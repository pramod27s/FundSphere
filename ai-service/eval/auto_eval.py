"""
Fully-automated evaluation for the FundSphere recommender.

Pipeline:
  1. Pull N random real researcher profiles from CoreBackend
     (falls back to LLM-synthesised profiles if the endpoint is unavailable).
  2. For each profile, ask the LLM to invent a realistic query that researcher
     might type today.
  3. Run the recommender → top K candidates per profile.
  4. Ask the LLM to rate each candidate 0–3 for relevance to (profile, query).
  5. Treat ratings ≥ 2 as the auto-label "expected" set.
  6. Compute Recall@K, MRR, NDCG@K against those labels.
  7. (Optional --compare) run the whole thing TWICE, once with the new accuracy
     flags OFF and once with them ON, then diff the two reports.

Cost: ~$0.05–$0.15 in Groq tokens per full run with N=30.

Usage (from ai-service/):
    python -m eval.auto_eval                   # single run, current settings
    python -m eval.auto_eval --n 30 --top-k 10
    python -m eval.auto_eval --compare         # baseline vs improved diff
    python -m eval.auto_eval --save out.json   # persist full results

The eval imports the recommender directly — no HTTP layer in between.
"""

import argparse
import json
import logging
import math
import os
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Allow `python eval/auto_eval.py` from ai-service/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from openai import OpenAI  # noqa: E402

from rag.config import settings  # noqa: E402
from rag.pinecone_client import PineconeService  # noqa: E402
from rag.recommender import RecommenderService  # noqa: E402
from rag.schemas import RecommendationItem, RecommendationRequest, UserProfile  # noqa: E402
from rag.springboot_client import SpringBootClient  # noqa: E402

logging.basicConfig(level=logging.WARNING)
log = logging.getLogger("auto_eval")


# ─────────────────────────────────────────────────────────────────────────────
# LLM helper (single client used for query gen + relevance judging)
# ─────────────────────────────────────────────────────────────────────────────

def _llm_client() -> Tuple[OpenAI, str]:
    """Reuse whichever Groq key is set. Prefer the dedicated HyDE key — it's
    the freshest one — then query-expansion, then the judge key."""
    api_key = (
        settings.groq_api_key_hyde
        or settings.groq_api_key_query_expansion
        or settings.groq_api_key_llm_judge
        or ""
    )
    if not api_key:
        raise SystemExit(
            "auto_eval needs at least one Groq API key set "
            "(GROQ_API_KEY_HYDE / GROQ_API_KEY_QUERY_EXPANSION / GROQ_API_KEY_LLM_JUDGE)."
        )
    model = settings.hyde_model or settings.query_expansion_model or "openai/gpt-oss-120b"
    return OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1"), model


def _chat(client: OpenAI, model: str, system: str, user: str, temperature: float = 0.4, max_tokens: int = 1500) -> str:
    resp = client.chat.completions.create(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
    )
    return (resp.choices[0].message.content or "").strip()


def _safe_json_parse(text: str) -> Optional[Any]:
    """Extract the first JSON object/array from an LLM response, tolerating
    markdown fences and pre/postamble."""
    text = text.strip()
    if text.startswith("```"):
        # Strip the first fence and any language hint
        text = text.split("```", 2)[1] if text.count("```") >= 2 else text.strip("`")
        text = text.lstrip("json").lstrip("JSON").strip()
        if text.endswith("```"):
            text = text[:-3]
    text = text.strip()
    # Find first { or [ ... last } or ]
    starts = [i for i, ch in enumerate(text) if ch in "{["]
    if not starts:
        return None
    s = starts[0]
    for e in range(len(text), s, -1):
        try:
            return json.loads(text[s:e])
        except Exception:
            continue
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — get profiles
# ─────────────────────────────────────────────────────────────────────────────

def fetch_real_profiles(spring: SpringBootClient, n: int) -> List[UserProfile]:
    return spring.sample_profiles(count=n)


_SYNTH_PROFILE_SYSTEM = """You generate realistic researcher profiles for a grant-discovery benchmark.

Output a JSON array of N profiles. Each profile must have:
- country (string, real country name)
- applicantType (one of: "FACULTY", "POSTDOC", "PHD_STUDENT", "INDEPENDENT_RESEARCHER", "INDUSTRY_RESEARCHER")
- institutionType (one of: "UNIVERSITY", "RESEARCH_INSTITUTE", "STARTUP", "NGO", "GOVERNMENT_LAB")
- careerStage (one of: "EARLY_CAREER", "MID_CAREER", "SENIOR")
- department (string, real academic department name)
- researchBio (1–2 sentences, first person)
- researchInterests (array of 2–4 UPPER_SNAKE_CASE field names like "MACHINE_LEARNING", "CLIMATE_SCIENCE")
- keywords (array of 3–6 short noun phrases)
- preferredMinAmount (number, USD)
- preferredMaxAmount (number, USD)
- preferredCurrency ("USD")

Cover diverse fields (AI, climate, biomedical, social science, materials, education, public health, etc.), career stages, and countries (US, India, UK, Brazil, Kenya, Germany, etc.).

Output ONLY the JSON array, no prose, no markdown.
"""


def synthesise_profiles(client: OpenAI, model: str, n: int) -> List[UserProfile]:
    user = f"Generate exactly {n} diverse profiles."
    text = _chat(client, model, _SYNTH_PROFILE_SYSTEM, user, temperature=0.6, max_tokens=4000)
    parsed = _safe_json_parse(text)
    if not isinstance(parsed, list):
        log.error("Profile synthesis returned non-list; got: %r", text[:200])
        return []
    out: List[UserProfile] = []
    for item in parsed[:n]:
        try:
            out.append(UserProfile(**item))
        except Exception as exc:
            log.warning("Skipping malformed synthesized profile: %s", exc)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — invent a realistic query per profile
# ─────────────────────────────────────────────────────────────────────────────

_QUERY_GEN_SYSTEM = """You roleplay as the researcher described and write the ONE search query they'd type into a grant-discovery tool today.

Rules:
- 4–14 words. Conversational, not keyword soup.
- Reflect a real funding need (a project they're starting, a method they need, a population they want to serve).
- Don't repeat the bio verbatim — they already typed all that during signup.
- Output ONLY the query text. No quotes, no preamble.
"""


def _profile_summary(p: UserProfile) -> str:
    bits = []
    if p.researchBio:
        bits.append(f"Bio: {p.researchBio}")
    if p.researchInterests:
        bits.append(f"Interests: {', '.join(p.researchInterests)}")
    if p.keywords:
        bits.append(f"Keywords: {', '.join(p.keywords)}")
    if p.country:
        bits.append(f"Country: {p.country}")
    if p.applicantType:
        bits.append(f"Role: {p.applicantType}")
    if p.institutionType:
        bits.append(f"Institution: {p.institutionType}")
    return "\n".join(bits) if bits else "(empty profile)"


def invent_query(client: OpenAI, model: str, profile: UserProfile) -> str:
    text = _chat(
        client, model, _QUERY_GEN_SYSTEM,
        _profile_summary(profile),
        temperature=0.7, max_tokens=80,
    )
    # Strip leading/trailing quotes some models add
    return text.strip().strip('"').strip("'")


# ─────────────────────────────────────────────────────────────────────────────
# Step 4 — LLM judges relevance
# ─────────────────────────────────────────────────────────────────────────────

_JUDGE_SYSTEM = """You are an expert grant-matching evaluator.

You are given:
- A researcher profile.
- The query they typed.
- A list of candidate grants returned by a recommender.

Rate each candidate from 0–3:
  3 = highly relevant — clearly funds the work they described
  2 = relevant — the same field/topic, eligible applicant
  1 = tangentially related — same broad area but unlikely to fit
  0 = irrelevant — wrong field, wrong applicant, or off-topic

Be strict. Most candidates should be 0 or 1; only truly fitting grants get 2 or 3.

Output ONLY a JSON array of objects: [{"grantId": <int>, "rating": <0-3>, "reason": "<short>"}, ...]
Rate every candidate exactly once. Do not invent grants. No prose, no markdown.
"""


@dataclass
class JudgedCandidate:
    grantId: int
    rating: int
    reason: str = ""


def judge_candidates(
    client: OpenAI,
    model: str,
    profile: UserProfile,
    query: str,
    items: List[RecommendationItem],
) -> List[JudgedCandidate]:
    if not items:
        return []

    candidates_block = []
    for it in items:
        f = it.fields or {}
        candidates_block.append({
            "grantId": it.grantId,
            "title": it.title or f.get("grant_title") or "",
            "agency": it.fundingAgency or f.get("funding_agency") or "",
            "field": f.get("field") or [],
            "eligible_applicants": f.get("eligible_applicants") or [],
            "eligible_countries": f.get("eligible_countries") or [],
            "summary": (f.get("chunk_text") or "")[:500],
        })

    user_payload = {
        "profile": {
            "country": profile.country,
            "applicantType": profile.applicantType,
            "institutionType": profile.institutionType,
            "careerStage": profile.careerStage,
            "researchBio": profile.researchBio,
            "researchInterests": profile.researchInterests,
            "keywords": profile.keywords,
        },
        "query": query,
        "candidates": candidates_block,
    }

    raw = _chat(
        client, model, _JUDGE_SYSTEM,
        json.dumps(user_payload, indent=2),
        temperature=0.0, max_tokens=4000,
    )
    parsed = _safe_json_parse(raw)
    if not isinstance(parsed, list):
        log.warning("Judge returned non-list; treating all as 0. Raw head: %r", raw[:200])
        return [JudgedCandidate(grantId=it.grantId, rating=0) for it in items]

    by_id: Dict[int, JudgedCandidate] = {}
    for entry in parsed:
        try:
            gid = int(entry["grantId"])
            rating = max(0, min(3, int(entry.get("rating", 0))))
            reason = str(entry.get("reason", ""))[:160]
            by_id[gid] = JudgedCandidate(grantId=gid, rating=rating, reason=reason)
        except Exception:
            continue

    # Fill missing with 0
    return [by_id.get(it.grantId, JudgedCandidate(grantId=it.grantId, rating=0)) for it in items]


# ─────────────────────────────────────────────────────────────────────────────
# Step 5 — metrics
# ─────────────────────────────────────────────────────────────────────────────

def recall_at_k(returned_ids: List[int], expected_ids: List[int], k: int) -> float:
    if not expected_ids:
        return float("nan")
    top = set(returned_ids[:k])
    hits = sum(1 for gid in expected_ids if gid in top)
    return hits / len(expected_ids)


def mrr(returned_ids: List[int], expected_ids: List[int]) -> float:
    expected_set = set(expected_ids)
    for i, gid in enumerate(returned_ids, start=1):
        if gid in expected_set:
            return 1.0 / i
    return 0.0


def ndcg_at_k(returned_ids: List[int], ratings_by_id: Dict[int, int], k: int) -> float:
    """NDCG using full graded ratings (0–3), not just hit/miss."""
    gains = [ratings_by_id.get(gid, 0) for gid in returned_ids[:k]]
    dcg = sum(((2 ** g) - 1) / math.log2(i + 2) for i, g in enumerate(gains))
    ideal_gains = sorted(ratings_by_id.values(), reverse=True)[:k]
    idcg = sum(((2 ** g) - 1) / math.log2(i + 2) for i, g in enumerate(ideal_gains))
    return (dcg / idcg) if idcg > 0 else float("nan")


# ─────────────────────────────────────────────────────────────────────────────
# Single-run driver
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class CaseResult:
    profile_id: Optional[int]
    query: str
    returned_ids: List[int]
    ratings: List[Dict[str, Any]]
    recall_at_k: float
    mrr: float
    ndcg_at_k: float
    latency_ms: float


@dataclass
class RunReport:
    label: str
    n_cases: int
    top_k: int
    flags: Dict[str, Any]
    mean_recall: float
    mean_mrr: float
    mean_ndcg: float
    mean_latency_ms: float
    cases: List[CaseResult] = field(default_factory=list)

    def short(self) -> str:
        return (
            f"[{self.label}] cases={self.n_cases} "
            f"R@{self.top_k}={self.mean_recall*100:5.1f}%  "
            f"MRR={self.mean_mrr:.3f}  "
            f"NDCG@{self.top_k}={self.mean_ndcg:.3f}  "
            f"avg_lat={self.mean_latency_ms:.0f}ms"
        )


def _flags_snapshot() -> Dict[str, Any]:
    return {
        "ENABLE_PROFILE_QUERY_SPLIT": settings.enable_profile_query_split,
        "PROFILE_QUERY_SPLIT_INTENT_WEIGHT": settings.profile_query_split_intent_weight,
        "ENABLE_STRUCTURED_RERANK_PROMPT": settings.enable_structured_rerank_prompt,
        "ENABLE_HYDE": settings.enable_hyde,
        "HYDE_REPLACE_QUERY": settings.hyde_replace_query,
        "ENABLE_QUERY_EXPANSION": settings.enable_query_expansion,
        "USE_RERANK": settings.use_rerank,
        "USE_KEYWORD_CHANNEL": settings.use_keyword_channel,
    }


def _override_flags(overrides: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Apply runtime overrides to the singleton settings, return previous values."""
    if not overrides:
        return {}
    saved: Dict[str, Any] = {}
    for k, v in overrides.items():
        saved[k] = getattr(settings, k)
        setattr(settings, k, v)
    return saved


def _restore_flags(saved: Dict[str, Any]) -> None:
    for k, v in saved.items():
        setattr(settings, k, v)


def run_eval(
    label: str,
    profiles: List[UserProfile],
    queries: List[str],
    rec: RecommenderService,
    judge_client: OpenAI,
    judge_model: str,
    top_k: int,
    flag_overrides: Optional[Dict[str, Any]] = None,
) -> RunReport:
    saved = _override_flags(flag_overrides)
    try:
        cases: List[CaseResult] = []
        recs, mrrs, ndcgs, lats = [], [], [], []

        print(f"\n── Running [{label}] · {len(profiles)} cases · top_k={top_k} ─────────────")
        for k_, v_ in _flags_snapshot().items():
            print(f"   {k_:<35} = {v_}")
        print()

        for i, (profile, query) in enumerate(zip(profiles, queries), start=1):
            t0 = time.perf_counter()
            try:
                resp = rec.recommend(RecommendationRequest(
                    userId=None, userProfile=profile, userQuery=query,
                    topK=top_k, useRerank=None,
                ))
                items = resp.results
            except Exception as exc:
                log.exception("Case %d failed: %s", i, exc)
                items = []
            lat_ms = (time.perf_counter() - t0) * 1000

            judged = judge_candidates(judge_client, judge_model, profile, query, items)
            ratings_by_id = {j.grantId: j.rating for j in judged}
            expected_ids = [j.grantId for j in judged if j.rating >= 2]

            returned_ids = [it.grantId for it in items]
            r = recall_at_k(returned_ids, expected_ids, top_k)
            m = mrr(returned_ids, expected_ids)
            n = ndcg_at_k(returned_ids, ratings_by_id, top_k)

            cases.append(CaseResult(
                profile_id=getattr(profile, "userId", None),
                query=query,
                returned_ids=returned_ids,
                ratings=[asdict(j) for j in judged],
                recall_at_k=r if r == r else 0.0,
                mrr=m,
                ndcg_at_k=n if n == n else 0.0,
                latency_ms=round(lat_ms, 1),
            ))
            if r == r: recs.append(r)
            mrrs.append(m)
            if n == n: ndcgs.append(n)
            lats.append(lat_ms)

            print(
                f"  #{i:02d}  R@{top_k}={r*100 if r==r else 0:5.1f}%  "
                f"MRR={m:.3f}  NDCG@{top_k}={n if n==n else 0:.3f}  "
                f"lat={lat_ms:5.0f}ms  expected={len(expected_ids)}/{len(returned_ids)}  "
                f"q={query[:60]!r}"
            )

        report = RunReport(
            label=label,
            n_cases=len(cases),
            top_k=top_k,
            flags=_flags_snapshot(),
            mean_recall=(sum(recs) / len(recs)) if recs else 0.0,
            mean_mrr=(sum(mrrs) / len(mrrs)) if mrrs else 0.0,
            mean_ndcg=(sum(ndcgs) / len(ndcgs)) if ndcgs else 0.0,
            mean_latency_ms=(sum(lats) / len(lats)) if lats else 0.0,
            cases=cases,
        )
        print(f"\n  → {report.short()}")
        return report
    finally:
        _restore_flags(saved)


# ─────────────────────────────────────────────────────────────────────────────
# Compare driver (run twice, diff)
# ─────────────────────────────────────────────────────────────────────────────

BASELINE_OFF = {
    "enable_profile_query_split": False,
    "enable_structured_rerank_prompt": False,
    "enable_hyde": False,
}

IMPROVED_ON = {
    "enable_profile_query_split": True,
    "enable_structured_rerank_prompt": True,
    "enable_hyde": True,
}


def diff_reports(a: RunReport, b: RunReport) -> str:
    def _delta(x: float, y: float, pct: bool = False) -> str:
        d = y - x
        sign = "+" if d >= 0 else ""
        if pct:
            return f"{sign}{d * 100:.2f}pp"
        return f"{sign}{d:.3f}"

    return (
        f"\n┌─ Comparison ──────────────────────────────────────────────────────┐\n"
        f"│ {a.label:<15} → {b.label:<15} │ {a.n_cases} cases · top_k={a.top_k}\n"
        f"├───────────────────────────────────────────────────────────────────┤\n"
        f"│ Recall@{a.top_k:<2} : {a.mean_recall*100:6.2f}%  → {b.mean_recall*100:6.2f}%   "
        f"({_delta(a.mean_recall, b.mean_recall, pct=True)})\n"
        f"│ MRR        : {a.mean_mrr:6.3f}   → {b.mean_mrr:6.3f}    "
        f"({_delta(a.mean_mrr, b.mean_mrr)})\n"
        f"│ NDCG@{a.top_k:<2}   : {a.mean_ndcg:6.3f}   → {b.mean_ndcg:6.3f}    "
        f"({_delta(a.mean_ndcg, b.mean_ndcg)})\n"
        f"│ Latency    : {a.mean_latency_ms:6.0f}ms → {b.mean_latency_ms:6.0f}ms   "
        f"({_delta(a.mean_latency_ms, b.mean_latency_ms)} ms)\n"
        f"└───────────────────────────────────────────────────────────────────┘\n"
    )


# ─────────────────────────────────────────────────────────────────────────────
# main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--n", type=int, default=15, help="Number of profiles to sample (default 15).")
    parser.add_argument("--top-k", type=int, default=10, help="Top-K for recall/NDCG (default 10).")
    parser.add_argument("--compare", action="store_true",
                        help="Run BASELINE (flags off) and IMPROVED (flags on) and diff.")
    parser.add_argument("--save", default=None, help="Write the full JSON report to this path.")
    parser.add_argument("--synthetic-profiles", action="store_true",
                        help="Skip CoreBackend; LLM-generate profiles instead.")
    args = parser.parse_args()

    spring = SpringBootClient()
    pine = PineconeService()
    rec = RecommenderService(spring_client=spring, pinecone_service=pine)
    llm, llm_model = _llm_client()

    # ── Step 1: profiles
    profiles: List[UserProfile] = []
    if not args.synthetic_profiles:
        print(f"Fetching {args.n} real researcher profiles from CoreBackend…")
        profiles = fetch_real_profiles(spring, args.n)
        if not profiles:
            print("  ⚠  CoreBackend returned 0 profiles (endpoint missing or DB empty).")
    if not profiles:
        print(f"Synthesising {args.n} profiles via {llm_model}…")
        profiles = synthesise_profiles(llm, llm_model, args.n)
        if not profiles:
            raise SystemExit("Could not obtain any profiles. Aborting.")
    print(f"  ✓ {len(profiles)} profiles ready.")

    # ── Step 2: invent a query per profile
    print(f"\nInventing one realistic query per profile (LLM)…")
    queries: List[str] = []
    for i, p in enumerate(profiles, start=1):
        q = invent_query(llm, llm_model, p)
        queries.append(q)
        print(f"  #{i:02d}  {q!r}")
    print(f"  ✓ {len(queries)} queries generated.")

    # ── Step 3–5: run + judge + score
    if args.compare:
        baseline = run_eval(
            "BASELINE_OFF", profiles, queries, rec, llm, llm_model,
            top_k=args.top_k, flag_overrides=BASELINE_OFF,
        )
        improved = run_eval(
            "IMPROVED_ON", profiles, queries, rec, llm, llm_model,
            top_k=args.top_k, flag_overrides=IMPROVED_ON,
        )
        print(diff_reports(baseline, improved))
        out = {"baseline": asdict(baseline), "improved": asdict(improved)}
    else:
        only = run_eval(
            "CURRENT", profiles, queries, rec, llm, llm_model,
            top_k=args.top_k, flag_overrides=None,
        )
        out = {"run": asdict(only)}

    if args.save:
        Path(args.save).write_text(json.dumps(out, indent=2, default=str), encoding="utf-8")
        print(f"\nFull report written → {args.save}")


if __name__ == "__main__":
    main()
