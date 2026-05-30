"""
Weight auto-tuner for the FundSphere recommender.

Turns 2b from "measure" into "measure + recommend the optimal weights" — WITHOUT
spending LLM tokens and without re-running retrieval per weight combo.

How it stays cheap:
  1. SNAPSHOT (once): run the recommender over the frozen test set and capture,
     per candidate, the five sub-scores (semantic, eligibility, keyword, funding,
     freshness) + the two preference fits + whether the deadline is open. Cached
     to eval/tune_snapshot.json. This is the only step that touches Pinecone.
  2. SWEEP (instant, repeatable): re-combine those cached numbers under thousands
     of candidate weight vectors — pure arithmetic — re-rank, and score NDCG@K
     against the cached LLM labels (eval/labels_cache.json). Zero tokens.
  3. Report the best weight set, formatted to paste into your .env / config.

Prerequisites:
  - Run eval.bat (option 1 or 2) at least once so labels_cache.json exists.
  - For the first snapshot build, Pinecone (and CoreBackend, for the keyword
    channel) must be reachable. After that, re-tuning needs neither.

Usage (from ai-service/):
    python -m eval.tune                       # build/reuse snapshot, sweep 4000
    python -m eval.tune --iters 20000         # search harder
    python -m eval.tune --refresh-snapshot    # rebuild the signal snapshot
    python -m eval.tune --top-k 10 --pool 15  # NDCG@10 over a 15-candidate pool
    python -m eval.tune --save tune_result.json
"""

import argparse
import json
import random
import sys
from pathlib import Path
from typing import Any, Dict, List

# Allow `python eval/tune.py` from ai-service/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rag.config import settings  # noqa: E402
from rag.pinecone_client import PineconeService  # noqa: E402
from rag.recommender import RecommenderService  # noqa: E402
from rag.schemas import RecommendationRequest, UserProfile  # noqa: E402
from rag.springboot_client import SpringBootClient  # noqa: E402
from rag.filters import (  # noqa: E402
    eligibility_score,
    keyword_overlap_score,
    funding_fit,
    freshness_score,
    grant_type_fit,
    career_stage_fit,
    deadline_is_open,
)
from eval.auto_eval import (  # noqa: E402
    load_frozen_cases,
    load_label_cache,
    ndcg_at_k,
    TESTSET_PATH,
    LABELS_PATH,
)

SNAPSHOT_PATH = Path(__file__).resolve().parent / "tune_snapshot.json"

WEIGHT_KEYS = ["semantic", "eligibility", "keyword", "funding", "freshness"]


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — snapshot the retrieval signals (the only Pinecone-touching step)
# ─────────────────────────────────────────────────────────────────────────────

def build_snapshot(cases: List[Dict[str, Any]], rec: RecommenderService, pool: int) -> List[Dict[str, Any]]:
    snap: List[Dict[str, Any]] = []
    print(f"Building signal snapshot for {len(cases)} cases (pool={pool})…")
    for i, case in enumerate(cases, start=1):
        profile = UserProfile(**case["profile"])
        query = case["query"]
        try:
            resp = rec.recommend(RecommendationRequest(
                userProfile=profile, userQuery=query, topK=pool, useRerank=None,
            ))
            items = resp.results
        except Exception as exc:
            print(f"  ⚠ case {case['id']} retrieval failed: {exc}")
            items = []

        cands = []
        for it in items:
            f = it.fields or {}
            cands.append({
                "grantId": it.grantId,
                # semantic is already per-query normalized inside the recommender;
                # reuse it. The other signals are deterministic from (profile, fields).
                "sem": float(it.semanticScore or 0.0),
                "elig": float(eligibility_score(profile, f)),
                "kw": float(keyword_overlap_score(profile, query, f)),
                "fund": float(funding_fit(profile, f)),
                "fresh": float(freshness_score(f)),
                "gt": float(grant_type_fit(profile, f)),
                "cs": float(career_stage_fit(profile, f)),
                "open": bool(deadline_is_open(f.get("application_deadline"))),
            })
        snap.append({"id": case["id"], "candidates": cands})
        print(f"  #{i:02d}  {case['id']}  {len(cands)} candidates")
    SNAPSHOT_PATH.write_text(json.dumps({"pool": pool, "cases": snap}, indent=2), encoding="utf-8")
    print(f"  ✓ Snapshot saved → {SNAPSHOT_PATH.name} (re-tuning is now token-free and offline).")
    return snap


def load_snapshot() -> List[Dict[str, Any]]:
    if SNAPSHOT_PATH.exists():
        try:
            data = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
            cases = data.get("cases", [])
            if isinstance(cases, list) and cases:
                return cases
        except Exception:
            pass
    return []


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — score a weight config over the snapshot (pure arithmetic)
# ─────────────────────────────────────────────────────────────────────────────

def score_config(
    snap: List[Dict[str, Any]],
    labels: Dict[str, Dict[str, Any]],
    weights: Dict[str, float],
    gt_bonus: float,
    cs_bonus: float,
    expired_penalty: float,
    exclude_expired: bool,
    k: int,
) -> float:
    """Mean NDCG@k across labelled cases for a given weight vector."""
    scores: List[float] = []
    for case in snap:
        case_labels = labels.get(case["id"], {})
        if not case_labels:
            continue  # unlabelled case contributes nothing
        ratings = {int(gid): int(v.get("rating", 0) or 0) for gid, v in case_labels.items()}

        cands = case["candidates"]
        if exclude_expired:
            cands = [c for c in cands if c["open"]]
            if not cands:
                continue

        ranked = []
        for c in cands:
            penalty = expired_penalty if (not c["open"] and not exclude_expired) else 0.0
            b_gt = gt_bonus if c["gt"] >= 1.0 else 0.0
            b_cs = cs_bonus * c["cs"] if c["cs"] > 0.5 else 0.0
            final = (
                weights["semantic"] * c["sem"]
                + weights["eligibility"] * c["elig"]
                + weights["keyword"] * c["kw"]
                + weights["funding"] * c["fund"]
                + weights["freshness"] * c["fresh"]
                - penalty + b_gt + b_cs
            )
            ranked.append((c["grantId"], max(0.0, min(1.0, final))))

        ranked.sort(key=lambda x: x[1], reverse=True)
        returned_ids = [gid for gid, _ in ranked]
        n = ndcg_at_k(returned_ids, ratings, k)
        if n == n:  # not NaN
            scores.append(n)
    return sum(scores) / len(scores) if scores else 0.0


def random_weights(rng: random.Random) -> Dict[str, float]:
    """Uniform sample over the weight simplex (sums to 1.0)."""
    vals = [rng.random() for _ in WEIGHT_KEYS]
    s = sum(vals) or 1.0
    return {k: v / s for k, v in zip(WEIGHT_KEYS, vals)}


# ─────────────────────────────────────────────────────────────────────────────
# main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--iters", type=int, default=4000, help="Random weight vectors to try (default 4000).")
    parser.add_argument("--top-k", type=int, default=10, help="NDCG@K (default 10).")
    parser.add_argument("--pool", type=int, default=settings.rerank_top_k, help="Candidate pool size for the snapshot.")
    parser.add_argument("--refresh-snapshot", action="store_true", help="Rebuild the signal snapshot from retrieval.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility.")
    parser.add_argument("--save", default=None, help="Write the best config + baseline to this JSON path.")
    args = parser.parse_args()

    # ── Preconditions
    cases = load_frozen_cases()
    if not cases:
        raise SystemExit(
            f"No frozen test set ({TESTSET_PATH.name}). Run eval.bat (option 1 or 2) once first."
        )
    labels = load_label_cache()
    total_labels = sum(len(v) for v in labels.values())
    if total_labels == 0:
        raise SystemExit(
            f"No labels in {LABELS_PATH.name}. Run eval.bat (option 1 or 2) once to judge candidates, "
            f"then re-run the tuner."
        )

    # ── Snapshot (reuse unless --refresh-snapshot)
    snap = [] if args.refresh_snapshot else load_snapshot()
    if snap:
        print(f"  ✓ Reusing cached snapshot {SNAPSHOT_PATH.name} ({len(snap)} cases) — no Pinecone calls.")
    else:
        spring = SpringBootClient()
        pine = PineconeService()
        rec = RecommenderService(spring_client=spring, pinecone_service=pine)
        snap = build_snapshot(cases, rec, args.pool)

    # ── Bonuses + expired handling are held at current settings; we sweep the 5 weights.
    gt_bonus = settings.grant_type_match_bonus
    cs_bonus = settings.career_stage_match_bonus
    expired_penalty = settings.expired_penalty
    exclude_expired = settings.exclude_expired_grants

    def _score(w: Dict[str, float]) -> float:
        return score_config(snap, labels, w, gt_bonus, cs_bonus, expired_penalty, exclude_expired, args.top_k)

    # ── Baseline = current configured weights
    baseline_w = {
        "semantic": settings.weight_semantic,
        "eligibility": settings.weight_eligibility,
        "keyword": settings.weight_keyword,
        "funding": settings.weight_funding,
        "freshness": settings.weight_freshness,
    }
    baseline_ndcg = _score(baseline_w)

    # ── Random search over the simplex
    print(f"\nSweeping {args.iters} weight vectors over {len(snap)} cases "
          f"(exclude_expired={exclude_expired})…")
    rng = random.Random(args.seed)
    best_w, best_ndcg = baseline_w, baseline_ndcg
    for _ in range(args.iters):
        w = random_weights(rng)
        n = _score(w)
        if n > best_ndcg:
            best_w, best_ndcg = w, n

    # ── Report
    improved = best_ndcg - baseline_ndcg
    print("\n" + "=" * 66)
    print(f"  Baseline NDCG@{args.top_k} : {baseline_ndcg:.4f}  (current config)")
    print(f"  Best NDCG@{args.top_k}     : {best_ndcg:.4f}  ({'+' if improved >= 0 else ''}{improved:.4f})")
    print("=" * 66)
    if improved <= 1e-4:
        print("  → No weight vector beat your current config. Keep it (or refine the test set / labels).")
    else:
        print("  → Recommended weights (paste into ai-service/.env):\n")
        env_name = {
            "semantic": "WEIGHT_SEMANTIC",
            "eligibility": "WEIGHT_ELIGIBILITY",
            "keyword": "WEIGHT_KEYWORD",
            "funding": "WEIGHT_FUNDING",
            "freshness": "WEIGHT_FRESHNESS",
        }
        for k in WEIGHT_KEYS:
            print(f"     {env_name[k]}={best_w[k]:.3f}")
    print()
    print("  NOTE: results are only as trustworthy as the cached labels (pseudo-labels).")
    print("        Treat this as a strong hypothesis; confirm with eval.bat option [1].")

    if args.save:
        Path(args.save).write_text(json.dumps({
            "top_k": args.top_k,
            "cases_scored": len(snap),
            "baseline": {"weights": baseline_w, "ndcg": baseline_ndcg},
            "best": {"weights": best_w, "ndcg": best_ndcg},
            "improvement": improved,
            "held_fixed": {
                "grant_type_match_bonus": gt_bonus,
                "career_stage_match_bonus": cs_bonus,
                "exclude_expired_grants": exclude_expired,
            },
        }, indent=2), encoding="utf-8")
        print(f"  Saved → {args.save}")


if __name__ == "__main__":
    main()
