"""Tests for the RAG recommender pipeline, its scoring filters, and the eval
metrics. No API calls: Pinecone, CoreBackend and the LLM judge are faked."""
from __future__ import annotations

import json
import threading
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

from eval import run as eval_run
from rag import recommender as recommender_module
from rag.cache import query_cache
from rag.config import settings
from rag.countries import UNRESOLVED_GROUP, canonical_country, country_allows, country_keys
from rag.document_builder import build_pinecone_records, chunk_text, estimate_tokens
from rag.filters import (
    APPLICANT_ALIASES,
    INSTITUTION_ALIASES,
    _match_strength,
    eligibility_score,
    is_strictly_disqualified,
    keyword_overlap_score,
)
from rag.pinecone_client import PineconeService
from rag.profile_builder import build_profile_only_text, build_user_query_text
from rag.recommender import RecommenderService, blend, candidate_signals, relevance_from_rerank
from rag.schemas import (
    GrantData,
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
        self.queries = []
        self.reranked_ids = []

    def batch_search(self, queries, top_k, metadata_filter=None, alpha=0.7):
        self.filters.append(metadata_filter)
        self.queries.extend(queries)
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

    def test_semantic_signal_is_the_rerank_score_on_its_logit_scale(self):
        pinecone = FakePinecone([grant(1, "Weak match A"), grant(2, "Weak match B")], {1: 0.04, 2: 0.02})

        resp = self.recommend(pinecone)

        top = resp.results[0]
        self.assertEqual(top.grantId, 1)
        self.assertAlmostEqual(top.semanticScore, relevance_from_rerank(0.04), places=5)  # not stretched to 1.0
        self.assertLess(top.finalScore, 0.5)  # a weak pool shows as weak

    def test_a_relevant_broad_scheme_outranks_an_eligible_off_topic_grant(self):
        # The eval's typical scores: a broad scheme that suits the user ~0.016,
        # an off-topic grant ~0.004. The off-topic one names the user's country,
        # which on the raw scale was enough to put it first.
        pinecone = FakePinecone(
            [grant(1, "Off-topic but eligible", eligible_countries=["India"]), grant(2, "Broad scheme that suits")],
            {1: 0.004, 2: 0.016},
        )

        resp = self.recommend(pinecone)

        self.assertEqual([r.grantId for r in resp.results], [2, 1])

    def test_relevance_spreads_the_low_end_and_keeps_the_order(self):
        scores = [0.0, 0.001, 0.004, 0.016, 0.1, 0.5, 0.95, 1.0]
        relevance = [relevance_from_rerank(s) for s in scores]

        self.assertEqual(relevance, sorted(relevance))
        self.assertGreater(relevance_from_rerank(0.016) - relevance_from_rerank(0.004), 0.1)
        self.assertEqual((relevance[0], relevance[-1]), (0.0, 1.0))

    def test_results_are_labelled_topic_or_broad_by_rerank_score(self):
        pinecone = FakePinecone([grant(1, "Solar cells"), grant(2, "Any science")], {1: 0.6, 2: 0.02})

        with mock.patch.object(settings, "topic_match_min_score", 0.1):
            resp = self.recommend(pinecone)

        self.assertEqual({r.grantId: r.matchType for r in resp.results}, {1: "topic", 2: "broad"})

    def test_without_rerank_scores_no_result_is_labelled(self):
        pinecone = FakePinecone([grant(1, "Solar cells")], {1: 0.6})

        with mock.patch.object(settings, "use_rerank", False):
            resp = self.recommend(pinecone)

        self.assertIsNone(resp.results[0].matchType)

    def test_pinecone_filter_keeps_the_deadline_clause_on_the_thin_results_retry(self):
        pinecone = FakePinecone([grant(1, "Only grant")], {1: 0.5})  # < 5 hits triggers the retry

        self.recommend(pinecone)

        self.assertEqual(len(pinecone.filters), 2)
        first, retry = (json.dumps(f) for f in pinecone.filters)
        self.assertIn("deadline_epoch", first)
        self.assertIn("country_keys", first)
        self.assertIn("deadline_epoch", retry)
        self.assertNotIn("country_keys", retry)

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

    REWRITES = ["photovoltaic research funding", "solar cell programmes"]

    def recommend_expanded(self, query="solar energy research", split=False):
        pinecone = FakePinecone([grant(1, "Solar grant")], {1: 0.5})
        with mock.patch.multiple(settings, enable_query_expansion=True, enable_profile_query_split=split), \
                mock.patch.object(recommender_module, "expand_queries", return_value=self.REWRITES):
            self.recommend(pinecone, query=query)
        return pinecone.queries

    def test_the_original_query_runs_alongside_its_expansions(self):
        queries = self.recommend_expanded()

        self.assertIn(build_user_query_text(PROFILE, "solar energy research"), queries)
        for rewrite in self.REWRITES:
            self.assertIn(rewrite, queries)

    def test_split_keeps_the_full_profile_text_out_of_the_intent_channel(self):
        queries = self.recommend_expanded(split=True)

        self.assertNotIn(build_user_query_text(PROFILE, "solar energy research"), queries)
        self.assertIn(build_profile_only_text(PROFILE), queries)  # the fit channel
        for rewrite in self.REWRITES:
            self.assertIn(rewrite, queries)

    def test_without_a_query_the_profile_text_runs_alongside_its_expansions(self):
        queries = self.recommend_expanded(query=None, split=True)

        self.assertIn(build_user_query_text(PROFILE, None), queries)
        for rewrite in self.REWRITES:
            self.assertIn(rewrite, queries)


def hit(gid: int, score: float, chunk: str = "") -> SemanticHit:
    return SemanticHit(grantId=gid, semanticScore=score, fields={"grant_id": gid, "chunk_text": chunk})


class SemanticFusionTests(unittest.TestCase):
    def test_query_variants_are_fused_by_rank_not_raw_score(self):
        # The long query's hybrid scores run far higher (the sparse part grows
        # with query length), but grant 2 tops two of the three variants.
        per_query = {
            "a long query": [hit(1, 40.0), hit(3, 39.0)],
            "short a": [hit(2, 0.6), hit(3, 0.4)],
            "short b": [hit(2, 0.7), hit(1, 0.3)],
        }

        class ByQuery:
            def batch_search(self, queries, top_k, metadata_filter=None, alpha=0.7):
                return [per_query[q] for q in queries]

        rec = RecommenderService(FakeSpring(), ByQuery())
        with mock.patch.object(settings, "enable_batch_embeddings", True):
            hits = rec._run_semantic_queries(list(per_query), 0.7, None, None)

        self.assertEqual([h.grantId for h in hits], [2, 1, 3])

    def test_each_grant_keeps_the_chunk_from_its_best_ranking(self):
        fused = RecommenderService._weighted_rrf_semantic(
            [([hit(1, 50.0), hit(2, 49.0, "second for the long query")], 1.0),
             ([hit(2, 0.4, "first for the short query")], 1.0)],
            k=60,
        )

        self.assertEqual(fused[0].grantId, 2)
        self.assertEqual(fused[0].fields["chunk_text"], "first for the short query")


class CountryTests(unittest.TestCase):
    US = UserProfile(country="United States")

    def test_spellings_reduce_to_one_canonical_name(self):
        self.assertEqual(canonical_country("USA"), "united states")
        self.assertEqual(canonical_country("  The United  Kingdom "), "united kingdom")
        self.assertEqual(canonical_country("Kenya"), "kenya")
        self.assertEqual(country_keys(["All countries", "Open to all", "Worldwide"]), ["any"])

    def test_alias_and_open_to_all_grants_are_not_disqualified(self):
        for countries in (["USA"], ["All countries"], ["Open to all nationalities"], ["Kenya", "Global"]):
            self.assertFalse(is_strictly_disqualified(self.US, {"eligible_countries": countries})[0], countries)
        self.assertTrue(is_strictly_disqualified(self.US, {"eligible_countries": ["Kenya"]})[0])

    def test_citizenship_compares_the_same_names(self):
        uk = UserProfile(citizenship="UK")
        self.assertFalse(is_strictly_disqualified(uk, {"citizenship_required": ["United Kingdom"]})[0])
        self.assertFalse(is_strictly_disqualified(uk, {"citizenship_required": ["Open"]})[0])
        self.assertTrue(is_strictly_disqualified(uk, {"citizenship_required": ["India"]})[0])

    def test_missing_data_is_never_a_conflict(self):
        self.assertTrue(country_allows([], "India"))
        self.assertTrue(country_allows(["Kenya"], None))

    def test_pinecone_filter_matches_the_keys_stored_at_indexing(self):
        clause = RecommenderService._country_clause(UserProfile(country="U.S.A."))
        record = build_pinecone_records(GrantData(id=1, grantTitle="T", eligibleCountries=["USA", "All countries"]))[0]

        self.assertEqual(clause["$or"][0], {"country_keys": {"$in": ["united states", "any", UNRESOLVED_GROUP]}})
        self.assertEqual(record["country_keys"], ["united states", "any"])

    # As the ERC Starting Grant was extracted: open to hosts in the EU and in
    # Horizon Europe's associated countries (the UK among them).
    ERC = ["EU Member States", "associated countries"]

    def test_a_region_admits_its_member_countries(self):
        for country in ("Spain", "Germany", "Republic of Ireland"):
            self.assertTrue(country_allows(["EU Member States"], country), country)
            self.assertTrue(country_allows(["EEA"], country), country)
        self.assertTrue(country_allows(["EEA countries"], "Norway"))
        self.assertFalse(country_allows(["EU Member States"], "India"))
        self.assertFalse(country_allows(["Nordics"], "Spain"))

    def test_a_group_we_cannot_resolve_rules_nobody_out(self):
        for country in ("United Kingdom", "India", "Spain"):
            self.assertFalse(is_strictly_disqualified(UserProfile(country=country), {"eligible_countries": self.ERC})[0], country)
        for group in ("Countries associated with the LIFE Programme", "Low- and middle-income countries",
                      "Non-associated third countries", "Africa", "Others"):
            self.assertEqual(canonical_country(group), UNRESOLVED_GROUP, group)

    def test_country_names_are_not_mistaken_for_groups(self):
        self.assertEqual(canonical_country("South Africa"), "south africa")
        self.assertEqual(canonical_country("United States"), "united states")
        self.assertEqual(canonical_country("Republic of Ireland"), "ireland")

    def test_regions_reach_the_index_and_the_pinecone_filter(self):
        record = build_pinecone_records(GrantData(id=1, grantTitle="ERC", eligibleCountries=self.ERC))[0]
        spain = RecommenderService._country_clause(UserProfile(country="Spain"))["$or"][0]["country_keys"]["$in"]

        self.assertEqual(record["country_keys"], ["european union", UNRESOLVED_GROUP])
        self.assertIn("european union", spain)
        self.assertIn("european economic area", spain)


class ChunkingTests(unittest.TestCase):
    LIMIT = 120
    HEADER = "Title: Quantum Sensing Grant\nAgency: DST\n"
    BULLETS = "\n".join(f"- Support for activity {i} including travel, equipment and consumables" for i in range(25))

    def chunks(self, **fields):
        grant_data = GrantData(id=7, grantTitle="Quantum Sensing Grant", fundingAgency="DST", **fields)
        with mock.patch.multiple(settings, enable_chunking=True, chunk_max_tokens=self.LIMIT, chunk_overlap_tokens=20):
            return [r["chunk_text"] for r in build_pinecone_records(grant_data)]

    def test_a_bulleted_description_splits_within_the_limit(self):
        chunks = self.chunks(description=self.BULLETS)

        self.assertGreater(len(chunks), 3)
        for chunk in chunks:
            self.assertLessEqual(estimate_tokens(chunk), self.LIMIT)

    def test_every_chunk_starts_with_its_grant(self):
        for chunk in self.chunks(description=self.BULLETS):
            self.assertTrue(chunk.startswith(self.HEADER), chunk[:80])
            self.assertGreater(len(chunk), len(self.HEADER))  # never the header alone

    def test_a_short_grant_is_one_chunk(self):
        self.assertEqual(self.chunks(description="Funds quantum sensors."),
                         [self.HEADER + "Description: Funds quantum sensors."])

    def test_one_endless_sentence_is_cut_into_word_runs(self):
        pieces = chunk_text(" ".join(["word"] * 1000), max_tokens=100, overlap_tokens=10)

        self.assertGreater(len(pieces), 1)
        for piece in pieces:
            self.assertLessEqual(estimate_tokens(piece), 100)
        self.assertGreaterEqual(sum(piece.split().count("word") for piece in pieces), 1000)

    def test_neighbouring_chunks_share_their_boundary_sentences(self):
        text = " ".join(f"Sentence {i} about the lab." for i in range(60))
        pieces = chunk_text(text, max_tokens=60, overlap_tokens=20)

        self.assertGreater(len(pieces), 2)
        for prev, nxt in zip(pieces, pieces[1:]):
            last_sentence = "Sentence" + prev.rsplit("Sentence", 1)[-1]
            self.assertIn(last_sentence, nxt)


class IndexingTests(unittest.TestCase):
    def test_a_grant_is_embedded_in_one_call_per_model(self):
        calls = []

        def embed(model, inputs, parameters):
            calls.append((model, len(inputs), parameters["input_type"]))
            return [mock.Mock(values=[0.1], sparse_indices=[1], sparse_values=[0.5]) for _ in inputs]

        service = PineconeService.__new__(PineconeService)  # skips the API-key checks
        service.pc = mock.Mock()
        service.pc.inference.embed.side_effect = embed
        service.index = mock.Mock()
        service.index.list.return_value = []
        service.namespace = "grants"

        description = "\n".join(f"Line {i} on eligible costs." for i in range(70))
        with mock.patch.multiple(settings, enable_chunking=True, chunk_max_tokens=200, chunk_overlap_tokens=20):
            records = service.upsert_grant(GrantData(id=3, grantTitle="Big grant", description=description))

        self.assertGreater(len(records), 1)
        self.assertEqual(calls, [
            ("llama-text-embed-v2", len(records), "passage"),
            ("pinecone-sparse-english-v0", len(records), "passage"),
        ])
        upserted = service.index.upsert.call_args.kwargs["vectors"]
        self.assertEqual([v["id"] for v in upserted], [r["id"] for r in records])


class SearchTextTests(unittest.TestCase):
    PROFILE = UserProfile(
        country="India", institutionType="Research Institute", applicantType="Researcher",
        careerStage="Research Assistant", preferredMinAmount=300000, preferredGrantType="Fellowship",
        researchBio="Works on perovskite solar cells.", researchInterests=["Solar Energy"],
        keywords=["perovskite"], department="Materials Science",
    )
    ELIGIBILITY_WORDS = ("India", "Research Institute", "Research Assistant", "300000", "Fellowship")

    def test_search_text_is_the_topic_only(self):
        text = build_user_query_text(self.PROFILE, "stability funding")

        for topic in ("perovskite solar cells", "Solar Energy", "perovskite", "Materials Science", "stability funding"):
            self.assertIn(topic, text)
        for word in self.ELIGIBILITY_WORDS:
            self.assertNotIn(word, text)

    def test_the_llm_prompts_get_the_topic_only(self):
        from rag.hyde import _build_user_prompt
        prompt = _build_user_prompt(self.PROFILE, "stability funding")

        self.assertIn("perovskite", prompt)
        for word in self.ELIGIBILITY_WORDS:
            self.assertNotIn(word, prompt)

    def test_eligibility_text_comes_back_for_comparison(self):
        with mock.patch.object(settings, "search_with_eligibility_text", True):
            text = build_user_query_text(self.PROFILE)

        self.assertIn("Researcher country: India.", text)
        self.assertIn("Preferred grant type: Fellowship.", text)


class PhdRequirementTests(unittest.TestCase):
    STUDENT = UserProfile(hasPhd=False)

    def disqualified(self, applicants):
        return is_strictly_disqualified(self.STUDENT, {"requires_phd": True, "eligible_applicants": applicants})[0]

    def test_a_grant_open_to_phd_students_is_not_hidden_from_them(self):
        # Real extractions from the corpus that carried requires_phd anyway.
        for applicants in (["Indian citizens pursuing a Ph.D.", "Indian citizens with a Ph.D."],
                           ["Ph.D. Students", "Researchers with Ph.D."], ["PhD students"],
                           ["Doctoral scholars"], ["Students enrolled in a PhD"]):
            self.assertFalse(self.disqualified(applicants), applicants)

    def test_a_grant_for_phd_holders_still_excludes_students(self):
        for applicants in (["Researchers with Ph.D."], ["Postdocs", "Scientists with PhDs"], []):
            self.assertTrue(self.disqualified(applicants), applicants)


class ExplanationTests(unittest.TestCase):
    def explain(self, reply: str) -> list[RecommendationItem]:
        from rag import llm_judge
        items = [RecommendationItem(grantId=gid, finalScore=0.5, title=f"Grant {gid}") for gid in (1, 2, 3)]
        client = mock.Mock()
        client.chat.completions.create.return_value.choices = [mock.Mock(message=mock.Mock(content=reply))]
        with mock.patch.multiple(settings, enable_llm_judge=True, groq_api_key_llm_judge="key"), \
                mock.patch.object(llm_judge, "OpenAI", return_value=client):
            return llm_judge.explain_candidates(UserProfile(), "solar", items)

    def test_each_explanation_carries_an_honest_fit_rating(self):
        items = self.explain(json.dumps({"explanations": [
            {"grantId": 1, "fit": "strong", "reason": "About solar cells."},
            {"grantId": 2, "fit": "Weak", "reason": "Funds marine biology, not solar work."},
            {"grantId": 3, "fit": "excellent", "reason": "Unknown rating."},
        ]}))

        self.assertEqual([i.llmFit for i in items], ["strong", "weak", None])
        self.assertEqual(items[1].reason, "Funds marine biology, not solar work.")
        self.assertEqual(len(items), 3)  # a weak fit is described, never dropped

    def test_the_prompt_asks_for_honesty_not_a_case_for_every_grant(self):
        from rag import llm_judge
        source = open(llm_judge.__file__, encoding="utf-8").read()

        self.assertIn("Never invent a link", source)
        self.assertNotIn("why it could be a fit", source)


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
