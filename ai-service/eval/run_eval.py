"""
Eval runner for the FundSphere RAG recommender.

Usage (from ai-service/):
    python -m eval.run_eval                       # uses eval/testset.json
    python -m eval.run_eval --testset path.json
    python -m eval.run_eval --top-k 10 --csv out.csv

Computes Recall@K, MRR, and per-case rank of the first expected grant.
Compare runs by running once with the flag OFF, then again with the flag ON
(e.g. ENABLE_PROFILE_QUERY_SPLIT=true) and diff the printed metrics.

The runner imports the recommender directly — it does NOT go through HTTP —
so you can run it locally without a frontend.
"""

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

# Allow running with `python eval/run_eval.py` from ai-service/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rag.config import settings  # noqa: E402
from rag.pinecone_client import PineconeService  # noqa: E402
from rag.recommender import RecommenderService  # noqa: E402
from rag.schemas import RecommendationRequest, UserProfile  # noqa: E402
from rag.springboot_client import SpringBootClient  # noqa: E402

logging.basicConfig(level=logging.WARNING)
log = logging.getLogger("eval")


def load_testset(path: Path) -> List[Dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    cases = data.get("cases", [])
    if not cases:
        raise SystemExit(f"No 'cases' in {path}")
    return cases


def run_case(rec: RecommenderService, case: Dict[str, Any], top_k: int) -> List[int]:
    """Run a single eval case and return the ordered list of grantIds returned."""
    profile_dict = case["userProfile"]
    profile = UserProfile(**profile_dict)
    req = RecommendationRequest(
        userId=None,
        userProfile=profile,
        userQuery=case.get("userQuery"),
        topK=top_k,
        useRerank=None,  # let settings decide
    )
    resp = rec.recommend(req)
    return [item.grantId for item in resp.results]


def recall_at_k(returned: List[int], expected: List[int], k: int) -> float:
    if not expected:
        return float("nan")
    top = set(returned[:k])
    hits = sum(1 for gid in expected if gid in top)
    return hits / len(expected)


def first_hit_rank(returned: List[int], expected: List[int]) -> Optional[int]:
    expected_set = set(expected)
    for i, gid in enumerate(returned, start=1):
        if gid in expected_set:
            return i
    return None


def mrr(returned: List[int], expected: List[int]) -> float:
    rank = first_hit_rank(returned, expected)
    return 1.0 / rank if rank else 0.0


def fmt_pct(x: float) -> str:
    if x != x:  # NaN
        return "  N/A "
    return f"{x * 100:5.1f}%"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--testset", default=str(Path(__file__).parent / "testset.json"))
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--csv", default=None, help="Optional CSV output path")
    args = parser.parse_args()

    cases = load_testset(Path(args.testset))

    # Print active flags so you can see what config produced the run.
    print("=" * 78)
    print("FundSphere RAG eval")
    print("-" * 78)
    print(f"  testset                       : {args.testset}")
    print(f"  cases                         : {len(cases)}")
    print(f"  top_k                         : {args.top_k}")
    print(f"  ENABLE_PROFILE_QUERY_SPLIT    : {settings.enable_profile_query_split}")
    print(f"  PROFILE_QUERY_SPLIT_INT_WT    : {settings.profile_query_split_intent_weight}")
    print(f"  ENABLE_STRUCTURED_RERANK_PRMT : {settings.enable_structured_rerank_prompt}")
    print(f"  ENABLE_HYDE                   : {settings.enable_hyde}")
    print(f"  HYDE_MODEL                    : {settings.hyde_model}")
    print(f"  HYDE_REPLACE_QUERY            : {settings.hyde_replace_query}")
    print(f"  ENABLE_QUERY_EXPANSION        : {settings.enable_query_expansion}")
    print(f"  USE_RERANK                    : {settings.use_rerank}")
    print(f"  USE_KEYWORD_CHANNEL           : {settings.use_keyword_channel}")
    print(f"  USE_SOFT_FILTERS              : {settings.use_soft_filters}")
    print("=" * 78)

    spring = SpringBootClient()
    pine = PineconeService()
    rec = RecommenderService(spring_client=spring, pinecone_service=pine)

    rows: List[Dict[str, Any]] = []
    recalls: List[float] = []
    mrrs: List[float] = []
    latencies_ms: List[float] = []

    print(f"{'case_id':<28} {'expected':>8} {'r@K':>6} {'mrr':>6} {'first':>5} {'lat(ms)':>8}")
    print("-" * 78)

    for case in cases:
        case_id = case.get("id", "(no-id)")
        expected = case.get("expectedGrantIds") or []

        t0 = time.perf_counter()
        try:
            returned = run_case(rec, case, args.top_k)
        except Exception as exc:
            log.exception(f"Case {case_id} failed")
            returned = []
        latency_ms = (time.perf_counter() - t0) * 1000
        latencies_ms.append(latency_ms)

        if expected:
            r = recall_at_k(returned, expected, args.top_k)
            m = mrr(returned, expected)
            first = first_hit_rank(returned, expected)
            recalls.append(r)
            mrrs.append(m)
        else:
            r = float("nan")
            m = float("nan")
            first = None

        first_str = str(first) if first else "  -  "
        print(f"{case_id:<28} {len(expected):>8} {fmt_pct(r):>6} {m:>6.3f} {first_str:>5} {latency_ms:>8.0f}")

        rows.append({
            "case_id": case_id,
            "expected_count": len(expected),
            "returned_count": len(returned),
            "recall_at_k": r,
            "mrr": m,
            "first_hit_rank": first,
            "latency_ms": round(latency_ms, 1),
            "returned_ids": returned[: args.top_k],
        })

    print("-" * 78)
    if recalls:
        mean_r = sum(recalls) / len(recalls)
        mean_m = sum(mrrs) / len(mrrs)
        print(f"  Recall@{args.top_k:<3}                       : {fmt_pct(mean_r)}  ({len(recalls)} labelled cases)")
        print(f"  MRR                              : {mean_m:.3f}")
    else:
        print("  No labelled cases — fill in 'expectedGrantIds' in the testset to get scores.")
    if latencies_ms:
        avg_lat = sum(latencies_ms) / len(latencies_ms)
        print(f"  Avg latency                      : {avg_lat:.0f} ms")
    print("=" * 78)

    if args.csv:
        import csv
        with open(args.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            for r in rows:
                # Stringify the list so CSV stays flat
                r = {**r, "returned_ids": ",".join(str(x) for x in r["returned_ids"])}
                w.writerow(r)
        print(f"CSV written → {args.csv}")


if __name__ == "__main__":
    main()
