import time
import sys
import logging

logging.basicConfig(level=logging.INFO)

from rag.config import settings
from rag.cache import query_cache
from rag.filters import is_strictly_disqualified
from rag.schemas import UserProfile, RecommendationRequest, RecommendationResponse, RecommendationItem

def test_hard_disqualification():
    print("--- Test 1: Hard Eligibility Disqualification Guardrails ---")
    
    # Case A: User has no PhD, grant requires PhD
    profile_student = UserProfile(
        userId=1,
        country="India",
        applicantType="Student",
        hasPhd=False,
        citizenship="India",
    )
    grant_phd = {
        "grant_id": 101,
        "requires_phd": True,
        "eligible_countries": ["India"],
    }
    disq, reason = is_strictly_disqualified(profile_student, grant_phd)
    assert disq is True, "Expected PhD guard to disqualify"
    print(f"  [PASS] PhD guard correctly disqualified: {reason}")

    # Case B: User has PhD
    profile_phd = UserProfile(
        userId=2,
        country="India",
        applicantType="Faculty",
        hasPhd=True,
        citizenship="India",
    )
    disq, reason = is_strictly_disqualified(profile_phd, grant_phd)
    assert disq is False, "Expected PhD holder to pass"
    print("  [PASS] PhD holder passed successfully")

    # Case C: Country mismatch
    grant_us_only = {
        "grant_id": 102,
        "requires_phd": False,
        "eligible_countries": ["United States"],
    }
    disq, reason = is_strictly_disqualified(profile_student, grant_us_only)
    assert disq is True, "Expected Country guard to disqualify"
    print(f"  [PASS] Country guard correctly disqualified: {reason}")

    # Case D: Open to all countries
    grant_global = {
        "grant_id": 103,
        "requires_phd": False,
        "eligible_countries": ["Global", "Any"],
    }
    disq, reason = is_strictly_disqualified(profile_student, grant_global)
    assert disq is False, "Expected Global country to pass"
    print("  [PASS] Global country grant passed successfully")


def test_query_cache():
    print("\n--- Test 2: In-Memory TTL Query Cache ---")
    profile = UserProfile(
        userId=10,
        country="India",
        applicantType="Faculty",
        researchInterests=["Artificial Intelligence"],
    )
    query = "Lightweight AI models"
    key = query_cache.make_key(profile, query, 5, True)
    
    # 1. Miss initially
    assert query_cache.get(key) is None, "Expected cache miss on empty cache"
    print("  [PASS] Initial cache miss verified")

    # 2. Set response
    dummy_resp = RecommendationResponse(
        queryText=query,
        results=[
            RecommendationItem(
                grantId=101,
                title="Test Grant",
                fundingAgency="Agency X",
                finalScore=0.95,
                fields={"field": ["AI"]},
            )
        ]
    )
    query_cache.set(key, dummy_resp)

    # 3. Hit
    cached = query_cache.get(key)
    assert cached is not None, "Expected cache hit"
    assert cached.results[0].grantId == 101, "Expected matching grant ID"
    print("  [PASS] Cache HIT returned identical RecommendationResponse")

    # 4. Clear
    query_cache.clear()
    assert query_cache.get(key) is None, "Expected cache miss after clear"
    print("  [PASS] Cache clear verified")


def test_conditional_hyde_threshold():
    print("\n--- Test 3: Conditional HyDE Word Count Threshold ---")
    short_query = "AI flood mapping"
    words_short = len(short_query.split())
    should_run_short = settings.enable_hyde and (0 < words_short < settings.hyde_max_query_words_to_trigger)
    assert should_run_short is True, "Expected short query to trigger HyDE"
    print(f"  [PASS] Short query ({words_short} words) triggers HyDE correctly")

    long_query = (
        "We propose a novel deep learning framework combining convolutional networks and transformers "
        "to perform semantic segmentation on multispectral satellite imagery for seasonal flood detection in South Asia."
    )
    words_long = len(long_query.split())
    should_run_long = settings.enable_hyde and (0 < words_long < settings.hyde_max_query_words_to_trigger)
    assert should_run_long is False, "Expected long detailed abstract to skip HyDE"
    print(f"  [PASS] Detailed abstract ({words_long} words >= {settings.hyde_max_query_words_to_trigger}) skips HyDE to save latency")


if __name__ == "__main__":
    try:
        test_hard_disqualification()
        test_query_cache()
        test_conditional_hyde_threshold()
        print("\nAll Core RAG Logic Checks Passed Successfully!")
    except Exception as e:
        print(f"\n[FAIL] {e}", file=sys.stderr)
        sys.exit(1)
