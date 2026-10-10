"""Tests for the RAG recommender pipeline, its scoring filters, and the eval
metrics. No API calls: Pinecone, CoreBackend and the LLM judge are faked."""
from __future__ import annotations

import json
import threading
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from eval import run as eval_run
from rag.cache import query_cache
from rag.config import settings
from rag.filters import (
    APPLICANT_ALIASES,
    INSTITUTION_ALIASES,
    _match_strength,
    eligibility_score,
    keyword_overlap_score,
)
from rag.recommender import RecommenderService, blend, candidate_signals
from rag.schemas import (
    KeywordCandidate,
    RecommendationItem,
    RecommendationRequest,
    SemanticHit,
    UserProfile,
)
from rag.springboot_client import SpringBootClient

FUTURE = (datetime.now(timezone.utc) + timedelta(days=40)).date().isoformat()
PAST = (datetime.now(timezone.utc) - timedelta(days=10)).date().isoformat()

# Pinned for every pipeline test: no LLM calls, no cache, filters on.
PIPELINE_SETTINGS = {
    "enable_query_expansion": False,
    "enable_hyde": False,
    "enable_llm_judge": False,
    "enable_query_cache": False,
    "enable_profile_query_split": False,
    "enable_structured_rerank_prompt": False,
    "enable_segment_weights": False,
    "enable_batch_embeddings": True,
    "use_rerank": True,
    "use_keyword_channel": True,
    "use_soft_filters": True,
    "exclude_expired_grants": True,
    "enable_hard_eligibility_filter": True,
    "rrf_pool_size": 30,
    "rerank_top_k": 16,
}

PROFILE = UserProfile(
    country="India",
    applicantType="Researcher",
    hasPhd=False,
    citizenship="India",
    researchInterests=["Solar Energy"],
    keywords=["photovoltaics"],
)


def grant(gid: int, title: str, deadline: str = FUTURE, **extra) -> dict:
    return {
        "grant_id": gid,
        "grant_title": title,
        "chunk_text": f"{title} description",
        "application_deadline": deadline,
        **extra,
    }


class FakePinecone:
    """Returns `semantic` grants for every query (it does not apply filters,
    so the recommender's own filtering is what's under test) and reranks by
    the given scores. `store` holds extra grants only reachable by id."""

    def __init__(self, semantic, rerank_scores, store=()):
        self.semantic = list(semantic)
        self.store = {g["grant_id"]: g for g in [*self.semantic, *store]}
        self.rerank_scores = rerank_scores
        self.filters = []
        self.reranked_ids = []

    def batch_search(self, queries, top_k, metadata_filter=None, alpha=0.7):
        self.filters.append(metadata_filter)
        hits = [
            SemanticHit(grantId=g["grant_id"], semanticScore=1.0 - i * 0.01, fields=dict(g))
            for i, g in enumerate(self.semantic)
        ]
        return [hits[:top_k] for _ in queries]

    def search(self, query_text, top_k, metadata_filter=None, alpha=0.7):
        return self.batch_search([query_text], top_k, metadata_filter, alpha)[0]

    def fetch_metadata_by_grant_ids(self, grant_ids):
        return {gid: dict(self.store[gid]) for gid in grant_ids if gid in self.store}

    def rerank(self, query, documents, top_n, text_field="text"):
        self.reranked_ids = [d["_grant_id"] for d in documents]
        ranked = sorted(documents, key=lambda d: self.rerank_scores.get(d["_grant_id"], 0.0), reverse=True)
        return [
            {**d, "_rerank_score": self.rerank_scores.get(d["_grant_id"], 0.0), "_rerank_rank": i}
            for i, d in enumerate(ranked[:top_n], start=1)
        ]


class FakeSpring:
    def __init__(self, candidates=()):
        self.candidates = list(candidates)

    def keyword_search(self, query, user_profile=None, top_k=20):
        return list(self.candidates)


class PipelineTests(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.multiple(settings, **PIPELINE_SETTINGS)
        patcher.start()
        self.addCleanup(patcher.stop)

    @staticmethod
    def recommend(pinecone, spring=None, profile=PROFILE, query="solar energy research"):
        rec = RecommenderService(spring or FakeSpring(), pinecone)
        return rec.recommend(RecommendationRequest(userProfile=profile, userQuery=query, topK=10))

    def test_expired_and_ineligible_grants_never_reach_the_reranker(self):
        pinecone = FakePinecone(
            [
                grant(1, "Open grant", eligible_countries=["India"]),
                grant(2, "Expired grant", deadline=PAST),
                grant(3, "US-only grant", eligible_countries=["United States"]),
                grant(4, "PhD-only grant", requires_phd=True),
            ],
            rerank_scores={1: 0.6, 2: 0.9, 3: 0.9, 4: 0.9},
        )

        resp = self.recommend(pinecone)

        self.assertEqual(pinecone.reranked_ids, [1])
        self.assertEqual([r.grantId for r in resp.results], [1])

    def test_keyword_only_candidates_are_hydrated_then_filtered(self):
        pinecone = FakePinecone(
            [grant(1, "Semantic hit")],
            rerank_scores={1: 0.5, 5: 0.5, 6: 0.5},
            store=[grant(5, "Keyword-only open grant"), grant(6, "Keyword-only expired grant", deadline=PAST)],
        )
        spring = FakeSpring([KeywordCandidate(grantId=5, keywordScore=0.3), KeywordCandidate(grantId=6, keywordScore=0.2)])

        self.recommend(pinecone, spring)

        self.assertEqual(sorted(pinecone.reranked_ids), [1, 5])

    def test_no_results_when_every_candidate_is_ineligible(self):
        pinecone = FakePinecone([grant(3, "US-only grant", eligible_countries=["United States"])], {3: 0.9})

        resp = self.recommend(pinecone)

        self.assertEqual(resp.results, [])

    def test_semantic_signal_is_the_raw_rerank_score(self):
        pinecone = FakePinecone([grant(1, "Weak match A"), grant(2, "Weak match B")], {1: 0.04, 2: 0.02})

        resp = self.recommend(pinecone)

        top = resp.results[0]
        self.assertEqual(top.grantId, 1)
        self.assertAlmostEqual(top.semanticScore, 0.04)  # not stretched to 1.0
        self.assertLess(top.finalScore, 0.5)  # a weak pool shows as weak

    def test_pinecone_filter_keeps_the_deadline_clause_on_the_thin_results_retry(self):
        pinecone = FakePinecone([grant(1, "Only grant")], {1: 0.5})  # < 5 hits triggers the retry

        self.recommend(pinecone)

        self.assertEqual(len(pinecone.filters), 2)
        first, retry = (json.dumps(f) for f in pinecone.filters)
        self.assertIn("deadline_epoch", first)
        self.assertIn("eligible_countries", first)
        self.assertIn("deadline_epoch", retry)
        self.assertNotIn("eligible_countries", retry)

    def test_keyword_and_semantic_channels_run_concurrently(self):
        # Each channel waits for the other at the barrier. Run one after the
        # other, the first would time out and both channels would come back empty.
        barrier = threading.Barrier(2, timeout=5)

        class WaitingPinecone(FakePinecone):
            def batch_search(self, *args, **kwargs):
                barrier.wait()
                return super().batch_search(*args, **kwargs)

        class WaitingSpring(FakeSpring):
            def keyword_search(self, *args, **kwargs):
                barrier.wait()
                return super().keyword_search(*args, **kwargs)

        pinecone = WaitingPinecone([grant(1, "Semantic hit")], {1: 0.5, 7: 0.5}, store=[grant(7, "Keyword hit")])
        spring = WaitingSpring([KeywordCandidate(grantId=7, keywordScore=0.4)])
        profile = UserProfile(researchInterests=[], keywords=[])  # one keyword query, no country retry

        resp = self.recommend(pinecone, spring, profile=profile)

        self.assertEqual(sorted(r.grantId for r in resp.results), [1, 7])


    def test_tuner_reproduces_the_recommenders_ranking(self):
        grants = [
            grant(gid, f"Grant {gid}", **({"eligible_countries": ["India"]} if gid % 2 else {}))
            for gid in range(1, 7)
        ]
        resp = self.recommend(FakePinecone(grants, {1: 0.30, 2: 0.32, 3: 0.10, 4: 0.50, 5: 0.05, 6: 0.31}))

        query = "solar energy research"
        candidates = [
            (it.grantId, it.semanticScore, candidate_signals(PROFILE, query, it.fields), it.fields["_rerank_rank"])
            for it in resp.results
        ]
        ranked = sorted(candidates, key=lambda c: (-blend(eval_run.current_weights(), c[1], c[2]), c[3]))

        self.assertEqual([c[0] for c in ranked], [it.grantId for it in resp.results])


class CacheKeyTests(unittest.TestCase):
    def key(self, profile, **request):
        req = RecommendationRequest(userProfile=profile, userQuery="solar", **request)
        return query_cache.make_key(profile, req, 10, True)

    def test_any_profile_change_is_a_new_key(self):
        base = UserProfile(country="India", researchBio="Solar cells.", yearsOfExperience=2, preferredGrantType="Fellowship")
        self.assertEqual(self.key(base), self.key(base.model_copy()))
        for change in ({"researchBio": "Wind turbines."}, {"yearsOfExperience": 9}, {"preferredGrantType": "Research Grant"}):
            self.assertNotEqual(self.key(base), self.key(base.model_copy(update=change)), change)

    def test_request_alpha_and_settings_are_part_of_the_key(self):
        profile = UserProfile(country="India")
        before = self.key(profile)
        self.assertNotEqual(before, self.key(profile, alpha=0.3))
        with mock.patch.object(settings, "enable_hyde", not settings.enable_hyde):
            self.assertNotEqual(before, self.key(profile))


class KeywordOverlapTests(unittest.TestCase):
    def score(self, title, keywords=(), query=None):
        return keyword_overlap_score(UserProfile(keywords=list(keywords)), query, {"grant_title": title})

    def test_matches_whole_words_only(self):
        self.assertEqual(self.score("AI for public health", keywords=["ai"]), 1.0)
        self.assertEqual(self.score("Maintain the chair", keywords=["ai"]), 0.0)

    def test_keywords_match_as_phrases(self):
        self.assertEqual(self.score("Machine-learning methods", keywords=["machine learning"]), 1.0)
        self.assertEqual(self.score("Machine tools for learning centres", keywords=["machine learning"]), 0.0)

    def test_generic_query_words_are_ignored(self):
        self.assertEqual(self.score("Any grant at all", query="looking for research grants"), 0.0)
        self.assertEqual(self.score("Network security", query="grants for networks"), 1.0)


class EligibilityScoreTests(unittest.TestCase):
    PROFILE = UserProfile(country="India", applicantType="Researcher", institutionType="University",
                          researchInterests=["Physics"])

    def test_unknown_metadata_scores_between_mismatch_and_match(self):
        unknown = eligibility_score(self.PROFILE, {})
        mismatch = eligibility_score(self.PROFILE, {
            "eligible_countries": ["Kenya"], "eligible_applicants": ["Startup"],
            "institution_type": ["Industry"], "field": ["Agriculture"],
        })
        match = eligibility_score(self.PROFILE, {
            "eligible_countries": ["India"], "eligible_applicants": ["Researcher"],
            "institution_type": ["University"], "field": ["Physics"],
        })
        self.assertAlmostEqual(unknown, 0.5)
        self.assertAlmostEqual(mismatch, 0.0)
        self.assertAlmostEqual(match, 1.0)

    def test_profile_labels_match_how_grants_word_them(self):
        def strength(value, grant_values, aliases=APPLICANT_ALIASES):
            return _match_strength(value, grant_values, aliases)

        self.assertEqual(strength("Researcher", ["Scientists", "Researchers"]), 1.0)  # plural folded
        self.assertEqual(strength("Startup Company", ["startups", "SMEs"]), 0.7)
        self.assertEqual(strength("Professor Faculty", ["faculties"]), 0.7)
        self.assertEqual(strength("Nonprofit Organization", ["NGOs"]), 0.7)
        self.assertEqual(strength("Student", ["companies"]), 0.0)
        self.assertEqual(strength("Academic Institutions", ["academic institution"], INSTITUTION_ALIASES), 1.0)
        self.assertEqual(strength("Government Lab", ["government", "public"], INSTITUTION_ALIASES), 0.7)


class SpringClientTests(unittest.TestCase):
    def test_keyword_search_filters_by_country_only(self):
        client = SpringBootClient()
        with mock.patch.object(client, "_post", return_value=[]) as post:
            client.keyword_search("solar", UserProfile(country="India", applicantType="Researcher"), top_k=5)
        body = post.call_args.args[1]
        self.assertEqual(body["country"], "India")
        self.assertNotIn("applicantType", body)
        self.assertNotIn("institutionType", body)
        self.assertEqual(body["includeClosed"], not settings.exclude_expired_grants)


class EvalMetricTests(unittest.TestCase):
    RATINGS = {1: 3, 2: 2, 3: 0, 4: 2}  # relevant: 1, 2, 4

    def test_relevant_grants_the_config_missed_lower_recall_and_ndcg(self):
        recall, mrr, ndcg = eval_run.score_case([1, 3], self.RATINGS, k=10)
        self.assertAlmostEqual(recall, 1 / 3)
        self.assertAlmostEqual(mrr, 1.0)
        self.assertLess(ndcg, 1.0)

    def test_finding_every_relevant_grant_in_ideal_order_scores_one(self):
        recall, mrr, ndcg = eval_run.score_case([1, 2, 4, 3], self.RATINGS, k=10)
        self.assertAlmostEqual(recall, 1.0)
        self.assertAlmostEqual(ndcg, 1.0)

    def test_only_the_top_k_counts(self):
        recall, _, _ = eval_run.score_case([3, 1, 2, 4], self.RATINGS, k=2)
        self.assertAlmostEqual(recall, 1 / 3)

    def test_ratings_of_grants_now_expired_no_longer_count(self):
        labels = {"1": {"rating": 3, "deadline": PAST}, "2": {"rating": 2, "deadline": FUTURE}, "3": {"rating": 1}}
        self.assertEqual(eval_run.live_ratings(labels), {2: 2, 3: 1})

    def test_a_case_is_scored_only_when_every_returned_grant_is_rated(self):
        run = eval_run.Run("current", {}, results={
            "rated": [RecommendationItem(grantId=1, finalScore=0.5)],
            "unrated": [RecommendationItem(grantId=2, finalScore=0.5)],
            "irrelevant": [RecommendationItem(grantId=3, finalScore=0.5)],
        })
        cases = [{"id": case_id} for case_id in ("rated", "unrated", "irrelevant")]
        labels = {"rated": {"1": {"rating": 3}}, "irrelevant": {"3": {"rating": 0}}}

        skipped = eval_run.score([run], cases, labels, k=10)

        self.assertEqual(set(skipped), {"unrated", "irrelevant"})
        self.assertEqual(run.scores["rated"], (1.0, 1.0, 1.0))


class CompareOverrideTests(unittest.TestCase):
    def test_values_are_typed_like_the_setting(self):
        overrides = eval_run.parse_overrides(["ENABLE_HYDE=false", "RRF_K=40", "WEIGHT_SEMANTIC=0.6"])
        self.assertEqual(overrides, {"enable_hyde": False, "rrf_k": 40, "weight_semantic": 0.6})

    def test_unknown_names_and_bad_values_stop_the_run(self):
        with self.assertRaises(SystemExit):
            eval_run.parse_overrides(["ENABLE_HYDEE=false"])
        with self.assertRaises(SystemExit):
            eval_run.parse_overrides(["RRF_K=lots"])


class TuneTests(unittest.TestCase):
    FIT_HEAVY = {"semantic": 0.2, "eligibility": 0.4, "keyword": 0.4, "funding": 0.0, "freshness": 0.0}
    SEMANTIC_HEAVY = {"semantic": 0.8, "eligibility": 0.05, "keyword": 0.05, "funding": 0.05, "freshness": 0.05}

    @staticmethod
    def case(relevant_is_on_topic: bool) -> "eval_run.TuneCase":
        """Grant 1 is on-topic but a poor fit on paper; grant 2 the reverse.
        FIT_HEAVY ranks grant 2 first, SEMANTIC_HEAVY grant 1."""
        on_topic = {"eligibility": 0.0, "keyword": 0.0, "funding": 0.5, "freshness": 0.5, "adjustment": 0.0}
        off_topic = {"eligibility": 1.0, "keyword": 1.0, "funding": 0.5, "freshness": 0.5, "adjustment": 0.0}
        ratings = {1: 3, 2: 0} if relevant_is_on_topic else {1: 0, 2: 3}
        return eval_run.TuneCase(ratings=ratings, candidates=[(1, 0.9, on_topic, 1), (2, 0.1, off_topic, 2)])

    def test_grid_starts_with_current_weights_and_every_set_sums_to_one(self):
        grid = eval_run.weight_grid()
        self.assertEqual(grid[0], eval_run.current_weights())
        self.assertTrue(30 <= len(grid) <= 50)
        for weights in grid[1:]:
            self.assertAlmostEqual(sum(weights.values()), 1.0, places=6)

    def test_suggests_weights_that_win_on_unseen_cases(self):
        cases = {f"c{i}": self.case(relevant_is_on_topic=True) for i in range(8)}

        result = eval_run.tune_weights(cases, [self.FIT_HEAVY, self.SEMANTIC_HEAVY], k=10)

        self.assertEqual(result.best, self.SEMANTIC_HEAVY)
        self.assertTrue(result.suggest)

    def test_rejects_weights_that_only_win_on_the_cases_they_were_picked_on(self):
        # Even-numbered cases favour SEMANTIC_HEAVY, odd ones FIT_HEAVY: whichever
        # set one half picks, the other half doesn't confirm it.
        cases = {f"c{i}": self.case(relevant_is_on_topic=i % 2 == 0) for i in range(8)}

        result = eval_run.tune_weights(cases, [self.FIT_HEAVY, self.SEMANTIC_HEAVY], k=10)

        self.assertFalse(result.suggest)

    def test_keeps_current_weights_on_a_tie(self):
        cases = {f"c{i}": self.case(relevant_is_on_topic=True) for i in range(8)}

        result = eval_run.tune_weights(cases, [self.SEMANTIC_HEAVY, dict(self.SEMANTIC_HEAVY, semantic=0.9)], k=10)

        self.assertEqual(result.best, self.SEMANTIC_HEAVY)
        self.assertFalse(result.suggest)


class RatingTests(unittest.TestCase):
    ITEMS = [RecommendationItem(grantId=gid, finalScore=0.5, title=f"Grant {gid}") for gid in (1, 2)]

    def rate(self, reply):
        labels = {}
        run = eval_run.Run("current", {}, results={"case": self.ITEMS})
        with mock.patch.object(eval_run, "llm_client", return_value=(None, "model")), \
                mock.patch.object(eval_run, "chat", return_value=reply), \
                mock.patch.object(eval_run, "save_labels"):
            eval_run.rate_missing([run], [{"id": "case", "profile": {}, "query": "q"}], labels)
        return labels

    def test_a_failed_judge_call_records_nothing(self):
        self.assertEqual(self.rate(""), {})

    def test_only_grants_the_judge_rated_are_recorded(self):
        labels = self.rate('[{"grantId": 1, "rating": 3, "reason": "fits"}]')
        self.assertEqual(labels, {"case": {"1": {"rating": 3, "title": "Grant 1", "deadline": None, "reason": "fits"}}})

    def test_existing_ratings_are_never_re_rated(self):
        labels = {"case": {"1": {"rating": 0}, "2": {"rating": 1}}}
        run = eval_run.Run("current", {}, results={"case": self.ITEMS})
        with mock.patch.object(eval_run, "llm_client") as client:
            eval_run.rate_missing([run], [{"id": "case", "profile": {}, "query": "q"}], labels)
        client.assert_not_called()
        self.assertEqual(labels["case"]["1"], {"rating": 0})


if __name__ == "__main__":
    unittest.main()
