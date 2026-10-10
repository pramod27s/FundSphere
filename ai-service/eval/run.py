"""
Recommender eval: run the test cases, rate the results with an LLM, score.

    python -m eval.run                                  # score current settings
    python -m eval.run --compare ENABLE_HYDE=false      # current vs a variant
    python -m eval.run --compare WEIGHT_SEMANTIC=0.6 WEIGHT_ELIGIBILITY=0.1
    python -m eval.run --tune                           # find better scoring weights
    python -m eval.run --save report.json               # also write full results

How it works
  1. Each case in cases.json (a profile + a query) goes through the
     recommender once per config: the current settings, plus the variant
     given with --compare (current settings with those values changed).
  2. Returned grants that labels.json has no rating for are rated 0-3 by an
     LLM and saved there. Existing ratings are never overwritten.
  3. Each config is scored against every rating the case has, so a relevant
     grant one config found and the other missed counts against the one that
     missed it (rating >= 2 = relevant):
       Recall@K  share of the case's relevant grants in the top K
       MRR       1 / rank of the first relevant grant
       NDCG@K    graded ranking quality; 1.0 = ideal order
     Grants whose deadline has passed since they were rated are left out:
     the recommender can't return them anymore.

labels.json is the benchmark and is meant to be committed. It grows as runs
find new grants. To correct the LLM, edit a rating by hand; to add a grant
you know is relevant, add an entry for it; it then counts as missed until a
config finds it.

--tune: the weights only reorder the grants the reranker already picked, so
one run is enough. Every reranked grant is rated, then ~40 weight sets
re-rank those same grants offline (seconds, no tokens). To avoid weights that
only fit these cases, a set is picked on half the cases and checked on the
other half, both ways round; a change is suggested only if it wins on the
half it wasn't picked on, both times.
"""

import argparse
import json
import logging
import math
import re
import sys
import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from openai import OpenAI, RateLimitError

# Allow `python eval/run.py` from ai-service/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rag.config import settings  # noqa: E402
from rag.filters import deadline_is_open  # noqa: E402
from rag.pinecone_client import PineconeService  # noqa: E402
from rag.recommender import FIT_SIGNALS, RecommenderService, blend, candidate_signals  # noqa: E402
from rag.schemas import RecommendationItem, RecommendationRequest, UserProfile  # noqa: E402
from rag.springboot_client import SpringBootClient  # noqa: E402

logging.basicConfig(level=logging.WARNING)
log = logging.getLogger("eval")

EVAL_DIR = Path(__file__).resolve().parent
CASES_PATH = EVAL_DIR / "cases.json"
LABELS_PATH = EVAL_DIR / "labels.json"

RELEVANT = 2  # a rating at or above this counts as relevant
JUDGE_BATCH_SIZE = 10  # grants per LLM call; stays inside Groq's per-minute token limit
# Every eval run skips the recommendation cache (each config must really run)
# and the LLM explanations (they never change the ranking, only cost tokens).
EVAL_SETTINGS = {"enable_query_cache": False, "enable_llm_judge": False}


# ─────────────────────────────────────────────────────────────────────────────
# Settings overrides (--compare NAME=value)
# ─────────────────────────────────────────────────────────────────────────────

def parse_overrides(pairs: List[str]) -> Dict[str, Any]:
    """NAME=value pairs (the .env names) → settings attribute values, typed
    like the current value."""
    overrides: Dict[str, Any] = {}
    for pair in pairs:
        name, sep, raw = pair.partition("=")
        attr = name.strip().lower()
        if not sep or not hasattr(settings, attr):
            raise SystemExit(f"Unknown setting {pair!r}: use the .env name, e.g. ENABLE_HYDE=false")
        current = getattr(settings, attr)
        raw = raw.strip()
        try:
            if isinstance(current, bool):
                overrides[attr] = raw.lower() in {"1", "true", "yes", "y", "on"}
            elif isinstance(current, int):
                overrides[attr] = int(raw)
            elif isinstance(current, float):
                overrides[attr] = float(raw)
            else:
                overrides[attr] = raw
        except ValueError:
            raise SystemExit(f"Bad value in {pair!r}: {name.strip()} is a {type(current).__name__}")
    return overrides


def settings_summary() -> str:
    on = {True: "on", False: "off"}
    return (
        f"expansion={on[settings.enable_query_expansion]} hyde={on[settings.enable_hyde]} "
        f"split={on[settings.enable_profile_query_split]} rerank={on[settings.use_rerank]} "
        f"keyword={on[settings.use_keyword_channel]} weights="
        f"{settings.weight_semantic}/{settings.weight_eligibility}/{settings.weight_keyword}/"
        f"{settings.weight_funding}/{settings.weight_freshness}"
    )


@contextmanager
def settings_applied(overrides: Dict[str, Any]):
    saved = {attr: getattr(settings, attr) for attr in overrides}
    for attr, value in overrides.items():
        setattr(settings, attr, value)
    try:
        yield
    finally:
        for attr, value in saved.items():
            setattr(settings, attr, value)


# ─────────────────────────────────────────────────────────────────────────────
# Running configs
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Run:
    name: str
    overrides: Dict[str, Any]
    results: Dict[str, List[RecommendationItem]] = field(default_factory=dict)
    seconds: Dict[str, float] = field(default_factory=dict)
    scores: Dict[str, Tuple[float, float, float]] = field(default_factory=dict)  # case → (recall, mrr, ndcg)


def check_backend() -> None:
    """The keyword channel calls CoreBackend; without it the numbers would
    quietly measure a different system. Any HTTP response means it's up."""
    try:
        requests.get(settings.spring_boot_base_url, timeout=5)
    except requests.RequestException:
        raise SystemExit(f"CoreBackend is not reachable at {settings.spring_boot_base_url}. Start it first.")


def run_config(run: Run, cases: List[Dict[str, Any]], rec: RecommenderService, depth: int) -> None:
    with settings_applied({**EVAL_SETTINGS, **run.overrides}):
        print(f"\nRunning {run.name}: {settings_summary()}")
        for i, case in enumerate(cases, start=1):
            start = time.perf_counter()
            try:
                resp = rec.recommend(RecommendationRequest(
                    userProfile=UserProfile(**case["profile"]), userQuery=case["query"], topK=depth,
                ))
                items = resp.results
            except Exception:
                log.exception("Case %s failed", case["id"])
                items = []
            run.seconds[case["id"]] = time.perf_counter() - start
            run.results[case["id"]] = items
            print(f"  [{i:02d}/{len(cases)}] {case['id']:<36} {len(items):2d} results  {run.seconds[case['id']]:4.1f}s")


def pooled_results(runs: List[Run], case_id: str) -> Dict[int, RecommendationItem]:
    pool: Dict[int, RecommendationItem] = {}
    for run in runs:
        for item in run.results.get(case_id, []):
            pool.setdefault(item.grantId, item)
    return pool


# ─────────────────────────────────────────────────────────────────────────────
# Rating (LLM judge) and labels.json
# ─────────────────────────────────────────────────────────────────────────────

_JUDGE_PROMPT = """You are an expert grant-matching evaluator.

You are given a researcher profile, the query they typed, and candidate grants.
Rate each candidate from 0–3:
  3 = highly relevant — clearly funds the work they described
  2 = relevant — the same field/topic, eligible applicant
  1 = tangentially related — same broad area but unlikely to fit
  0 = irrelevant — wrong field, wrong applicant, or off-topic

Be strict. Most candidates should be 0 or 1; only truly fitting grants get 2 or 3.

Output ONLY a JSON array: [{"grantId": <int>, "rating": <0-3>, "reason": "<short>"}, ...]
Rate every candidate exactly once. No prose, no markdown.
"""


def load_labels() -> Dict[str, Dict[str, Dict[str, Any]]]:
    if not LABELS_PATH.exists():
        return {}
    return json.loads(LABELS_PATH.read_text(encoding="utf-8"))


def save_labels(labels: Dict[str, Dict[str, Dict[str, Any]]]) -> None:
    """Cases alphabetically, grants by id, so diffs of the committed file stay readable."""
    ordered = {
        case_id: {gid: labels[case_id][gid] for gid in sorted(labels[case_id], key=int)}
        for case_id in sorted(labels)
    }
    LABELS_PATH.write_text(json.dumps(ordered, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def llm_client() -> Tuple[OpenAI, str]:
    key = (
        settings.groq_api_key_llm_judge
        or settings.groq_api_key_query_expansion
        or settings.groq_api_key_hyde
    )
    if not key:
        raise SystemExit("Rating needs a Groq key: set GROQ_API_KEY_LLM_JUDGE in ai-service/.env.")
    return OpenAI(api_key=key, base_url="https://api.groq.com/openai/v1"), settings.llm_judge_model


def chat(client: OpenAI, model: str, user: str) -> str:
    """One judge call, waiting out Groq 429s (free-tier per-minute limits).
    Returns "" if it still fails."""
    delay = 1.5
    for attempt in range(1, 7):
        try:
            resp = client.chat.completions.create(
                model=model,
                temperature=0.0,
                max_tokens=1200,
                messages=[{"role": "system", "content": _JUDGE_PROMPT}, {"role": "user", "content": user}],
            )
            return (resp.choices[0].message.content or "").strip()
        except RateLimitError as exc:
            hint = re.search(r"try again in\s+([\d.]+)\s*(ms|s)\b", str(exc), re.IGNORECASE)
            wait = (float(hint.group(1)) / (1000 if hint.group(2).lower() == "ms" else 1)) if hint else delay
            wait = min(wait, 60.0)
            print(f"      rate-limited (attempt {attempt}/6); waiting {wait:.1f}s...", flush=True)
            time.sleep(wait)
            delay = min(delay * 2, 60.0)
    return ""


def _json_list(text: str) -> Optional[list]:
    """The first JSON array in an LLM reply, tolerating fences and chatter."""
    start = text.find("[")
    end = text.rfind("]")
    if start < 0 or end <= start:
        return None
    try:
        parsed = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, list) else None


def rate(client: OpenAI, model: str, case: Dict[str, Any], items: List[RecommendationItem]) -> Dict[int, Tuple[int, str]]:
    """LLM ratings by grant id. A failed call or a grant the judge skipped is
    simply missing — never recorded as 0."""
    profile = case["profile"]
    payload = {
        "profile": {k: profile.get(k) for k in (
            "country", "applicantType", "institutionType", "careerStage",
            "researchBio", "researchInterests", "keywords")},
        "query": case["query"],
        "candidates": [
            {
                "grantId": it.grantId,
                "title": it.title or it.fields.get("grant_title") or "",
                "agency": it.fundingAgency or it.fields.get("funding_agency") or "",
                "field": it.fields.get("field") or [],
                "eligible_applicants": it.fields.get("eligible_applicants") or [],
                "eligible_countries": it.fields.get("eligible_countries") or [],
                "summary": (it.fields.get("chunk_text") or "")[:240],
            }
            for it in items
        ],
    }
    parsed = _json_list(chat(client, model, json.dumps(payload, indent=2)))
    if parsed is None:
        log.warning("Judge reply unusable for case %s; those grants stay unrated.", case["id"])
        return {}

    wanted = {it.grantId for it in items}
    rated: Dict[int, Tuple[int, str]] = {}
    for entry in parsed:
        try:
            gid = int(entry["grantId"])
            if gid in wanted:
                rated[gid] = (max(0, min(3, int(entry["rating"]))), str(entry.get("reason", ""))[:160])
        except (KeyError, TypeError, ValueError):
            continue
    return rated


def rate_missing(runs: List[Run], cases: List[Dict[str, Any]], labels: Dict[str, Dict[str, Any]]) -> None:
    """Rate every returned grant labels.json doesn't have yet, saving after each call."""
    todo = []
    for case in cases:
        known = labels.get(case["id"], {})
        missing = [it for gid, it in pooled_results(runs, case["id"]).items() if str(gid) not in known]
        if missing:
            todo.append((case, missing))
    total = sum(len(missing) for _, missing in todo)
    if not total:
        print("\nEvery returned grant already has a rating in labels.json.")
        return

    client, model = llm_client()
    print(f"\nRating {total} new grant(s) with {model}...")
    for case, missing in todo:
        done = 0
        for start in range(0, len(missing), JUDGE_BATCH_SIZE):
            batch = missing[start:start + JUDGE_BATCH_SIZE]
            rated = rate(client, model, case, batch)
            for it in batch:
                if it.grantId in rated:
                    rating, reason = rated[it.grantId]
                    labels.setdefault(case["id"], {})[str(it.grantId)] = {
                        "rating": rating,
                        "title": it.title or it.fields.get("grant_title") or "",
                        "deadline": it.fields.get("application_deadline"),
                        "reason": reason,
                    }
                    done += 1
            save_labels(labels)
        print(f"  {case['id']:<36} {done}/{len(missing)} rated")


# ─────────────────────────────────────────────────────────────────────────────
# Scoring
# ─────────────────────────────────────────────────────────────────────────────

def live_ratings(case_labels: Dict[str, Dict[str, Any]]) -> Dict[int, int]:
    """Ratings that still count: a grant whose deadline has passed can't be
    recommended anymore, so missing it is no longer a miss."""
    return {
        int(gid): int(entry["rating"])
        for gid, entry in case_labels.items()
        if deadline_is_open(entry.get("deadline"))
    }


def score_case(returned_ids: List[int], ratings: Dict[int, int], k: int) -> Tuple[float, float, float]:
    """(Recall@k, MRR, NDCG@k) of one ranked list against a case's ratings.
    Only call it when at least one rating is relevant."""
    top = returned_ids[:k]
    relevant = {gid for gid, r in ratings.items() if r >= RELEVANT}
    recall = sum(1 for gid in top if gid in relevant) / len(relevant)
    mrr = next((1.0 / rank for rank, gid in enumerate(top, start=1) if gid in relevant), 0.0)

    def dcg(gains: List[int]) -> float:
        return sum((2 ** g - 1) / math.log2(i + 2) for i, g in enumerate(gains))

    ideal = dcg(sorted(ratings.values(), reverse=True)[:k])
    ndcg = dcg([ratings.get(gid, 0) for gid in top]) / ideal
    return recall, mrr, ndcg


def score(runs: List[Run], cases: List[Dict[str, Any]], labels: Dict[str, Any], k: int) -> Dict[str, str]:
    """Fill each run's per-case scores. Returns {case_id: reason} for the
    cases that couldn't be scored."""
    skipped: Dict[str, str] = {}
    for case in cases:
        case_id = case["id"]
        known = labels.get(case_id, {})
        unrated = [gid for gid in pooled_results(runs, case_id) if str(gid) not in known]
        ratings = live_ratings(known)
        if unrated:
            skipped[case_id] = f"{len(unrated)} returned grant(s) unrated; re-run to retry"
        elif not any(r >= RELEVANT for r in ratings.values()):
            skipped[case_id] = "no relevant grant known yet"
        else:
            for run in runs:
                run.scores[case_id] = score_case([it.grantId for it in run.results.get(case_id, [])], ratings, k)
    return skipped


def _mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def print_report(runs: List[Run], cases: List[Dict[str, Any]], skipped: Dict[str, str], k: int) -> None:
    scored = [c["id"] for c in cases if c["id"] not in skipped]
    print(f"\n{'':<38}" + "".join(f"{run.name:>14}" for run in runs))

    def row(label: str, values: List[float], fmt: str, delta_fmt: str) -> None:
        line = f"  {label:<36}" + "".join(f"{v:>14{fmt}}" for v in values)
        if len(values) == 2:
            line += f"   ({values[1] - values[0]:+{delta_fmt}})"
        print(line)

    for index, label, fmt, delta_fmt in ((0, f"Recall@{k}", ".1%", ".1%"), (1, "MRR", ".3f", ".3f"), (2, f"NDCG@{k}", ".3f", ".3f")):
        row(label, [_mean([run.scores[c][index] for c in scored]) for run in runs], fmt, delta_fmt)
    row("Avg latency (s)", [_mean(list(run.seconds.values())) for run in runs], ".1f", ".1f")
    print(f"  Scored {len(scored)}/{len(cases)} cases")

    print(f"\n  Per case (Recall@{k} / NDCG@{k}):")
    for case_id in scored:
        cells = "".join(f"   {run.scores[case_id][0]:>4.0%} / {run.scores[case_id][2]:.2f}" for run in runs)
        print(f"  {case_id:<36}{cells}")
    for case_id, reason in skipped.items():
        print(f"  {case_id:<36}   not scored: {reason}")


# ─────────────────────────────────────────────────────────────────────────────
# Weight tuning (--tune)
# ─────────────────────────────────────────────────────────────────────────────

WEIGHT_NAMES = ("semantic", *FIT_SIGNALS)
# Grid: semantic share × how the rest splits (eligibility : keyword : funding : freshness).
_TUNE_SEMANTIC = (0.35, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8)
_TUNE_SPLITS = ((2, 1, 1, 1), (4, 1, 1, 1), (2, 3, 1, 1), (2, 1, 3, 1), (2, 1, 1, 3), (1, 1, 1, 1))
MIN_CASES_TO_TUNE = 6
MIN_GAIN = 0.01  # NDCG gain a new set must show on unseen cases, in both checks


@dataclass
class TuneCase:
    ratings: Dict[int, int]
    # (grant id, semantic score, fit signals, rerank position) per reranked grant
    candidates: List[Tuple[int, float, Dict[str, float], int]]


@dataclass
class TuneResult:
    n_cases: int
    n_sets: int
    current: Dict[str, float]
    best: Dict[str, float]
    ndcg_current: float
    ndcg_best: float
    holdout_gains: List[float]  # NDCG gain on the unseen half, per check

    @property
    def suggest(self) -> bool:
        return self.best != self.current and all(gain >= MIN_GAIN for gain in self.holdout_gains)


def current_weights() -> Dict[str, float]:
    return {name: getattr(settings, f"weight_{name}") for name in WEIGHT_NAMES}


def weight_grid() -> List[Dict[str, float]]:
    """The current weights first (so ties keep them), then the grid; each set sums to 1."""
    grid = [current_weights()]
    for semantic in _TUNE_SEMANTIC:
        for split in _TUNE_SPLITS:
            rest = [round((1 - semantic) * part / sum(split), 2) for part in split]
            rest[-1] = round(1 - semantic - sum(rest[:-1]), 2)
            weights = dict(zip(WEIGHT_NAMES, (semantic, *rest)))
            if weights not in grid:
                grid.append(weights)
    return grid


def tune_ndcg(weights: Dict[str, float], case: TuneCase, k: int) -> float:
    """NDCG@k of the order the recommender would produce with these weights
    (ties keep the reranker's order, as the recommender's stable sort does)."""
    ranked = sorted(case.candidates, key=lambda c: (-blend(weights, c[1], c[2]), c[3]))
    return score_case([gid for gid, *_ in ranked], case.ratings, k)[2]


def mean_tune_ndcg(weights: Dict[str, float], cases: Dict[str, TuneCase], ids: List[str], k: int) -> float:
    return _mean([tune_ndcg(weights, cases[case_id], k) for case_id in ids])


def best_weights(grid: List[Dict[str, float]], cases: Dict[str, TuneCase], ids: List[str], k: int) -> Dict[str, float]:
    best, best_ndcg = grid[0], mean_tune_ndcg(grid[0], cases, ids, k)
    for weights in grid[1:]:
        ndcg = mean_tune_ndcg(weights, cases, ids, k)
        if ndcg > best_ndcg + 1e-9:
            best, best_ndcg = weights, ndcg
    return best


def tune_weights(cases: Dict[str, TuneCase], grid: List[Dict[str, float]], k: int) -> TuneResult:
    """Pick the best set on all cases, and check whether picking generalises:
    choose on one half, measure on the other, then swap the halves."""
    ids = sorted(cases)
    halves = (ids[0::2], ids[1::2])
    current = grid[0]
    gains = []
    for pick_on, test_on in (halves, halves[::-1]):
        chosen = best_weights(grid, cases, pick_on, k)
        gains.append(mean_tune_ndcg(chosen, cases, test_on, k) - mean_tune_ndcg(current, cases, test_on, k))
    best = best_weights(grid, cases, ids, k)
    return TuneResult(
        n_cases=len(ids),
        n_sets=len(grid),
        current=current,
        best=best,
        ndcg_current=mean_tune_ndcg(current, cases, ids, k),
        ndcg_best=mean_tune_ndcg(best, cases, ids, k),
        holdout_gains=gains,
    )


def tune(run: Run, cases: List[Dict[str, Any]], labels: Dict[str, Any], skipped: Dict[str, str], k: int) -> Optional[TuneResult]:
    tune_cases: Dict[str, TuneCase] = {}
    for case in cases:
        if case["id"] in skipped:
            continue
        profile = UserProfile(**case["profile"])
        tune_cases[case["id"]] = TuneCase(
            ratings=live_ratings(labels[case["id"]]),
            candidates=[
                (it.grantId, it.semanticScore, candidate_signals(profile, case["query"], it.fields),
                 it.fields.get("_rerank_rank") or position)
                for position, it in enumerate(run.results[case["id"]], start=1)
            ],
        )
    if len(tune_cases) < MIN_CASES_TO_TUNE:
        print(f"\nTuning needs at least {MIN_CASES_TO_TUNE} scored cases; only {len(tune_cases)} so far.")
        return None
    return tune_weights(tune_cases, weight_grid(), k)


def print_tune(result: TuneResult, k: int) -> None:
    def fmt(weights: Dict[str, float]) -> str:
        return "/".join(f"{weights[name]:.2f}" for name in WEIGHT_NAMES)

    print(f"\nWeight tuning: {result.n_sets} weight sets on {result.n_cases} cases, NDCG@{k}")
    print("  (weights are semantic/eligibility/keyword/funding/freshness)")
    print(f"  current  {fmt(result.current)}   NDCG {result.ndcg_current:.3f}")
    print(f"  best     {fmt(result.best)}   NDCG {result.ndcg_best:.3f}")
    print("  Gain on unseen cases (picked on one half, tested on the other): "
          + ", ".join(f"{gain:+.3f}" for gain in result.holdout_gains))

    if result.suggest:
        print("\n  -> The gain holds on cases the weights weren't picked on. Paste into ai-service/.env:")
        for name in WEIGHT_NAMES:
            print(f"       WEIGHT_{name.upper()}={result.best[name]:.2f}")
    elif result.best == result.current:
        print("\n  -> Keep your current weights: no other set ranked these cases better.")
    else:
        print(f"\n  -> Keep your current weights: the best set didn't gain at least {MIN_GAIN} on unseen")
        print("    cases in both checks, so its edge is likely noise from these particular cases.")


# ─────────────────────────────────────────────────────────────────────────────
# main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--compare", nargs="+", metavar="NAME=VALUE",
                      help="Also run a variant: current settings with these .env values changed.")
    mode.add_argument("--tune", action="store_true",
                      help="Search for better scoring weights (WEIGHT_*) and suggest them if the gain holds up.")
    parser.add_argument("--top-k", type=int, default=10, help="K for Recall/NDCG (default 10).")
    parser.add_argument("--depth", type=int, default=20,
                        help="Results per case to rate (default 20; the recommender returns at most RERANK_TOP_K).")
    parser.add_argument("--save", metavar="PATH", help="Also write the full results as JSON.")
    args = parser.parse_args()

    cases = json.loads(CASES_PATH.read_text(encoding="utf-8"))["cases"]
    runs = [Run("current", {})]
    if args.compare:
        runs.append(Run("variant", parse_overrides(args.compare)))
        print("variant = current + " + " ".join(args.compare))

    depth = max(args.depth, args.top_k)
    if args.tune:
        # Every reranked grant must come back (and be rated): weights reorder all of them.
        depth = max(depth, settings.rerank_top_k)
        if settings.enable_segment_weights:
            print("Note: ENABLE_SEGMENT_WEIGHTS is on; tuning covers the global WEIGHT_* values only.")

    check_backend()
    rec = RecommenderService(SpringBootClient(), PineconeService())
    for run in runs:
        run_config(run, cases, rec, depth=depth)

    labels = load_labels()
    rate_missing(runs, cases, labels)
    skipped = score(runs, cases, labels, args.top_k)
    print_report(runs, cases, skipped, args.top_k)

    tuned = tune(runs[0], cases, labels, skipped, args.top_k) if args.tune else None
    if tuned:
        print_tune(tuned, args.top_k)

    if args.save:
        out = {
            "top_k": args.top_k,
            "skipped": skipped,
            "tune": {**asdict(tuned), "suggest": tuned.suggest} if tuned else None,
            "configs": [
                {
                    "name": run.name,
                    "overrides": run.overrides,
                    "cases": {
                        case_id: {
                            "returned": [it.grantId for it in items],
                            "seconds": round(run.seconds[case_id], 2),
                            **dict(zip(("recall", "mrr", "ndcg"), run.scores.get(case_id, ()))),
                        }
                        for case_id, items in run.results.items()
                    },
                }
                for run in runs
            ],
        }
        Path(args.save).write_text(json.dumps(out, indent=2), encoding="utf-8")
        print(f"\nFull results -> {args.save}")


if __name__ == "__main__":
    main()
