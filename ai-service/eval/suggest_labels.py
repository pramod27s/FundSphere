"""
Helper for hand-labelling eval/testset.json.

For each case, runs the current recommender and prints the top-K candidates
with title + agency + a short snippet — so you can scan the list visually,
pick the grant IDs you'd consider correct, and paste them into
`expectedGrantIds` in testset.json.

This script never mutates anything. It just prints.

Usage (from ai-service/):
    python -m eval.suggest_labels                # uses eval/testset.json
    python -m eval.suggest_labels --top-k 15     # show more candidates per case
    python -m eval.suggest_labels --testset path.json

Suggested workflow:
    1. Run this script.
    2. For each case, read the top candidates and note the IDs that look
       like good matches to the (query, profile) pair.
    3. Open eval/testset.json and paste those IDs into `expectedGrantIds`.
    4. Run `python -m eval.run_eval` to get real Recall@10 / NDCG@10 numbers.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

# Allow `python eval/suggest_labels.py` from ai-service/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rag.pinecone_client import PineconeService  # noqa: E402
from rag.recommender import RecommenderService  # noqa: E402
from rag.schemas import RecommendationRequest, UserProfile  # noqa: E402
from rag.springboot_client import SpringBootClient  # noqa: E402


def _truncate(text: str, n: int) -> str:
    if not text:
        return ""
    return (text[:n] + "…") if len(text) > n else text


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--testset",
        default=str(Path(__file__).parent / "testset.json"),
        help="Path to the testset to scan.",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=10,
        help="How many candidates to show per case (default 10).",
    )
    args = parser.parse_args()

    data = json.loads(Path(args.testset).read_text(encoding="utf-8"))
    cases: List[Dict[str, Any]] = data.get("cases", [])
    if not cases:
        raise SystemExit(f"No 'cases' in {args.testset}")

    spring = SpringBootClient()
    pine = PineconeService()
    rec = RecommenderService(spring_client=spring, pinecone_service=pine)

    print(f"\nScanning {len(cases)} cases from {args.testset}")
    print("=" * 88)

    for case in cases:
        case_id = case.get("id", "(no-id)")
        query = case.get("userQuery") or ""
        profile = UserProfile(**case["userProfile"])
        already = case.get("expectedGrantIds") or []

        print(f"\n┌── case: {case_id}")
        print(f"│   query   : {query}")
        print(f"│   profile : {profile.country} · {profile.applicantType} · {profile.careerStage}")
        print(f"│   labelled: {already if already else '(none yet)'}")
        print("│")

        try:
            resp = rec.recommend(RecommendationRequest(
                userId=None,
                userProfile=profile,
                userQuery=query,
                topK=args.top_k,
                useRerank=None,  # honour current settings
            ))
            items = resp.results
        except Exception as exc:
            print(f"│   ⚠ recommend failed: {exc}")
            continue

        if not items:
            print("│   (no candidates returned)")
            continue

        print(f"│   {'rank':<4} {'grantId':<8} {'agency':<28} {'title'}")
        print("│   " + "-" * 80)
        for i, item in enumerate(items, start=1):
            f = item.fields or {}
            agency = (item.fundingAgency or f.get("funding_agency") or "")[:28]
            title = item.title or f.get("grant_title") or ""
            print(f"│   {i:<4} {item.grantId:<8} {agency:<28} {_truncate(title, 50)}")

        # Compact summary block for the top 3 — gives just enough context
        # to decide without printing everything.
        print("│")
        print("│   Top-3 snippets:")
        for item in items[:3]:
            f = item.fields or {}
            snippet = _truncate(f.get("chunk_text", "") or "", 180)
            if snippet:
                print(f"│     [{item.grantId}] {snippet}")
        print("└" + "─" * 87)

    print(
        "\nNext step: edit eval/testset.json and fill in `expectedGrantIds` "
        "for each case with the grant IDs you judged as correct above.\n"
        "Then run:  python -m eval.run_eval\n"
    )


if __name__ == "__main__":
    main()
