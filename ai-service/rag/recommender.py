import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional, Tuple

from .cache import query_cache
from .config import settings
from .filters import (
    deadline_is_open,
    eligibility_score,
    freshness_score,
    funding_fit,
    keyword_overlap_score,
    grant_type_fit,
    career_stage_fit,
    is_strictly_disqualified,
    _expand_aliases,
    _match_strength,
    _norm,
    _norm_set,
    APPLICANT_ALIASES,
    INSTITUTION_ALIASES,
    COUNTRY_ALIASES,
)
from .hyde import generate_hypothetical_grant
from .llm_judge import explain_candidates
from .pinecone_client import PineconeService
from .profile_builder import (
    build_user_query_text,
    build_profile_only_text,
    build_query_only_text,
)
from .query_expander import expand_queries
from .schemas import (
    RecommendationItem,
    RecommendationRequest,
    RecommendationResponse,
    SemanticHit,
    UserProfile,
    KeywordCandidate,
)
from .springboot_client import SpringBootClient

logger = logging.getLogger("rag.recommender")


# Per-segment weight presets (4b). Each is a conservative nudge (±≤0.10) around
# the global defaults (0.50/0.20/0.10/0.10/0.10) and sums to 1.0. Enabled via
# ENABLE_SEGMENT_WEIGHTS; unknown/missing segments fall back to the global
# settings weights. These are domain hypotheses — NOT yet validated by the eval
# harness (2b) — so they are deliberately small and fully reversible.
_SEGMENT_WEIGHT_PRESETS: Dict[str, Dict[str, float]] = {
    # Academics (independent researchers, professors/faculty): research-fit
    # dominates, funding fit matters least.
    "academic": {"semantic": 0.55, "eligibility": 0.20, "keyword": 0.10, "funding": 0.05, "freshness": 0.10},
    # Students: eligibility restrictions and deadline urgency matter most;
    # funding-amount fit matters least.
    "student": {"semantic": 0.45, "eligibility": 0.25, "keyword": 0.10, "funding": 0.05, "freshness": 0.15},
    # Startups / companies: funding fit and commercialization keywords lead.
    "startup": {"semantic": 0.45, "eligibility": 0.15, "keyword": 0.12, "funding": 0.20, "freshness": 0.08},
    # NGOs / nonprofits: funding fit plus sector/geography eligibility.
    "ngo": {"semantic": 0.45, "eligibility": 0.23, "keyword": 0.10, "funding": 0.15, "freshness": 0.07},
}

# The weighted signals besides semantic, in the order they're reported.
FIT_SIGNALS = ("eligibility", "keyword", "funding", "freshness")


def candidate_signals(profile: UserProfile, user_query: Optional[str], fields: dict) -> Dict[str, float]:
    """The four fit signals for one candidate, plus `adjustment`: the
    preference bonuses minus the expired-deadline penalty. Shared with the
    eval's weight tuner, so tuning scores exactly what the recommender does."""
    deadline = fields.get("application_deadline")
    penalty = settings.expired_penalty if (deadline and not deadline_is_open(deadline)) else 0.0

    # Positive-only preference nudges (never penalize a non-match).
    gt_fit = grant_type_fit(profile, fields)
    grant_type_bonus = settings.grant_type_match_bonus if gt_fit >= 1.0 else 0.0
    cs_fit = career_stage_fit(profile, fields)
    career_stage_bonus = settings.career_stage_match_bonus * cs_fit if cs_fit > 0.5 else 0.0

    return {
        "eligibility": eligibility_score(profile, fields),
        "keyword": keyword_overlap_score(profile, user_query, fields),
        "funding": funding_fit(profile, fields),
        "freshness": freshness_score(fields),
        "adjustment": grant_type_bonus + career_stage_bonus - penalty,
    }


def blend(weights: Dict[str, float], semantic: float, signals: Dict[str, float]) -> float:
    """The final match score: weighted signals plus the adjustment, clamped so
    the displayed match percentage stays within 0–100%."""
    total = weights["semantic"] * semantic + sum(weights[name] * signals[name] for name in FIT_SIGNALS)
    return max(0.0, min(1.0, total + signals["adjustment"]))


class RecommenderService:
    def __init__(self, spring_client: SpringBootClient, pinecone_service: PineconeService) -> None:
        self.spring_client = spring_client
        self.pinecone_service = pinecone_service

    # ---------- Public entry point ----------

    def recommend(self, request: RecommendationRequest) -> RecommendationResponse:
        started = time.perf_counter()
        profile = request.userProfile
        if profile is None:
            if request.userId is None:
                raise ValueError("Either userProfile or userId is required")
            profile = self.spring_client.get_user_profile(request.userId)

        target_top_k = request.topK or settings.final_top_k
        use_rerank = settings.use_rerank if request.useRerank is None else request.useRerank

        # Stage 0 — Query cache lookup
        cache_key = query_cache.make_key(profile, request, target_top_k, use_rerank)
        cached_resp = query_cache.get(cache_key)
        if cached_resp is not None:
            return cached_resp

        query_text = build_user_query_text(profile, request.userQuery)

        # Skip HyDE if live query is empty or already rich (>= threshold words)
        live_query_words = len((request.userQuery or "").strip().split())
        should_run_hyde = (
            settings.enable_hyde
            and (0 < live_query_words < settings.hyde_max_query_words_to_trigger)
        )

        # Stages 1–2 — the keyword channel needs no LLM output, so it runs
        # alongside query expansion and HyDE; the semantic channel starts as
        # soon as those return, while the keyword channel may still be running.
        with ThreadPoolExecutor(max_workers=3) as executor:
            future_keyword = executor.submit(self._keyword_channel, profile, request, query_text)
            future_expansion = (
                executor.submit(expand_queries, profile, request.userQuery)
                if settings.enable_query_expansion
                else None
            )
            future_hyde = (
                executor.submit(generate_hypothetical_grant, profile, request.userQuery)
                if should_run_hyde
                else None
            )

            query_strings = future_expansion.result() if future_expansion else [query_text]
            hyde_doc = future_hyde.result() if future_hyde else None
            prepared = time.perf_counter()

            if hyde_doc:
                query_strings = self._inject_hyde(query_strings, hyde_doc)

            alpha = self._resolve_alpha(request, query_text)

            if settings.enable_profile_query_split:
                semantic_hits = self._semantic_channel_split(
                    profile, request.userQuery, query_strings, alpha, hyde_doc=hyde_doc
                )
            else:
                semantic_hits = self._semantic_channel(profile, query_strings, alpha)
            keyword_hits = future_keyword.result()
        retrieved = time.perf_counter()

        # Stage 3 — RRF fusion across channels. Fuse twice the pool size: the
        # eligibility filter below removes some, then the rest is cut to the pool.
        fused = self._rrf_fuse(
            channels=[semantic_hits, keyword_hits],
            k=settings.rrf_k,
            pool_size=settings.rrf_pool_size * 2,
        )

        # Hydrate keyword-only candidates (no Pinecone metadata) before filtering/reranking
        fused = self._hydrate_missing_metadata(fused)

        # Drop anything we still couldn't hydrate — without a title or chunk text,
        # we can't render or rerank it meaningfully.
        fused = [h for h in fused if h.fields.get("grant_title") or h.fields.get("chunk_text")]

        # Drop expired and ineligible grants BEFORE reranking, so they neither
        # take rerank slots nor come back as results.
        candidates = self._drop_ineligible(profile, fused)[: settings.rrf_pool_size]
        if not candidates:
            resp = RecommendationResponse(queryText=query_text, results=[])
            query_cache.set(cache_key, resp)
            return resp

        # Stage 4 — reranker (Pinecone bge-reranker-v2-m3)
        rerank_query = (request.userQuery or "").strip() if settings.enable_structured_rerank_prompt else query_text
        if not rerank_query:
            rerank_query = query_text
        reranked = self._rerank_stage(rerank_query, candidates, top_k=settings.rerank_top_k) if use_rerank else candidates[: settings.rerank_top_k]
        ranked = time.perf_counter()

        # Stage 5 — 5-signal business-rule scoring
        scored = self._score_candidates(profile, request.userQuery, reranked)
        scored.sort(key=lambda x: x.finalScore, reverse=True)
        top_items = scored[:target_top_k]

        # Stage 6 — LLM explanations (never filters)
        if settings.enable_llm_judge:
            top_items = explain_candidates(profile, query_text, top_items)
        finished = time.perf_counter()

        logger.info(
            "recommend: %d results in %.0f ms (llm prep %.0f, retrieval %.0f, fuse+rerank %.0f, score+explain %.0f)",
            len(top_items),
            (finished - started) * 1000,
            (prepared - started) * 1000,
            (retrieved - prepared) * 1000,
            (ranked - retrieved) * 1000,
            (finished - ranked) * 1000,
        )

        response = RecommendationResponse(queryText=query_text, results=top_items)
        query_cache.set(cache_key, response)
        return response

    # ---------- Stage 2: channels ----------

    def _semantic_channel(
        self,
        profile: UserProfile,
        query_strings: List[str],
        alpha: float,
    ) -> List[SemanticHit]:
        """Pinecone hybrid (dense + sparse) with batched queries."""
        metadata_filter, relaxed_filter = self._metadata_filters(profile)
        return self._run_semantic_queries(query_strings, alpha, metadata_filter, relaxed_filter)

    @staticmethod
    def _inject_hyde(query_strings: List[str], hyde_doc: str) -> List[str]:
        """Add HyDE doc to the query list. If `HYDE_REPLACE_QUERY` is on, the
        hypothetical doc replaces the existing strings entirely; otherwise it
        rides alongside them so the original query still contributes."""
        if settings.hyde_replace_query:
            return [hyde_doc]
        # Prepend so HyDE drives recall first; expansions still contribute.
        return [hyde_doc] + [q for q in query_strings if q and q != hyde_doc]

    def _semantic_channel_split(
        self,
        profile: UserProfile,
        user_query: Optional[str],
        query_strings: List[str],
        alpha: float,
        hyde_doc: Optional[str] = None,
    ) -> List[SemanticHit]:
        """
        Profile/query split retrieval.

        Runs TWO Pinecone retrievals — one anchored on the user's live query
        (intent), one anchored on the static profile (fit) — then weighted-RRF
        fuses them. The intent channel is up-weighted (default 2x) so the live
        query dominates without losing the profile context entirely.

        Falls back to the standard single-channel retrieval whenever the user
        query is empty (then there is no intent to separate out).
        """
        live_query = (user_query or "").strip()
        if not live_query:
            return self._semantic_channel(profile, query_strings, alpha)

        metadata_filter, relaxed_filter = self._metadata_filters(profile)

        # Channel A: intent (live user query, lightly grounded with interests/keywords).
        # Use the LLM-expanded query strings here when available — they were
        # generated from the live query and are intent-flavoured.
        # If HyDE produced a hypothetical grant, prepend it — its embedding
        # lives in the same space as real grants and drives recall hardest.
        intent_queries: List[str] = []
        if hyde_doc:
            intent_queries.append(hyde_doc)
        if query_strings and settings.enable_query_expansion:
            intent_queries.extend(query_strings)
        intent_queries.append(build_query_only_text(profile, live_query))
        # Dedupe, preserve order
        seen: set[str] = set()
        intent_queries = [q for q in intent_queries if q and not (q in seen or seen.add(q))]

        intent_hits = self._run_semantic_queries(intent_queries, alpha, metadata_filter, relaxed_filter)

        # Channel B: fit (profile-only, no live query). Heavier on dense recall
        # of grants matching the researcher's standing background.
        fit_query = build_profile_only_text(profile)
        fit_hits = (
            self._run_semantic_queries([fit_query], alpha, metadata_filter, relaxed_filter)
            if fit_query
            else []
        )

        # Weighted RRF: each intent hit contributes intent_weight × 1/(k+rank);
        # each fit hit contributes 1.0 × 1/(k+rank).
        intent_weight = max(0.1, settings.profile_query_split_intent_weight)
        return self._weighted_rrf_semantic(
            channels=[(intent_hits, intent_weight), (fit_hits, 1.0)],
            k=settings.rrf_k,
            pool_size=settings.semantic_top_k,
        )

    def _run_semantic_queries(
        self,
        queries: List[str],
        alpha: float,
        metadata_filter: Optional[dict],
        relaxed_filter: Optional[dict],
    ) -> List[SemanticHit]:
        """Helper: run a list of queries through Pinecone with batched embeddings
        and concurrency. A query whose filtered hits are thin (< 5) is retried
        under `relaxed_filter` and the extra hits appended."""
        clean_queries = [q for q in queries if q and q.strip()]
        if not clean_queries:
            return []

        retry_relaxed = metadata_filter != relaxed_filter
        merged: Dict[int, SemanticHit] = {}

        if settings.enable_batch_embeddings:
            try:
                batch_hits = self.pinecone_service.batch_search(
                    queries=clean_queries,
                    top_k=settings.semantic_top_k,
                    metadata_filter=metadata_filter,
                    alpha=alpha,
                )
            except Exception as exc:
                logger.error(f"Batch semantic search failed: {exc}")
                batch_hits = [[] for _ in clean_queries]

            for q, hits in zip(clean_queries, batch_hits):
                # Fallback if filtered hits were thin
                if len(hits) < 5 and retry_relaxed:
                    try:
                        extra = self.pinecone_service.search(
                            query_text=q,
                            top_k=settings.semantic_top_k,
                            metadata_filter=relaxed_filter,
                            alpha=alpha,
                        )
                        hits = self._merge_hits(hits, extra)
                    except Exception as exc:
                        logger.warning(f"Semantic fallback failed for q='{q[:60]}': {exc}")

                for hit in hits:
                    existing = merged.get(hit.grantId)
                    if existing is None or hit.semanticScore > existing.semanticScore:
                        merged[hit.grantId] = hit
        else:
            for q in clean_queries:
                try:
                    hits = self.pinecone_service.search(
                        query_text=q,
                        top_k=settings.semantic_top_k,
                        metadata_filter=metadata_filter,
                        alpha=alpha,
                    )
                except Exception as exc:
                    logger.error(f"Semantic search failed for q='{q[:60]}': {exc}")
                    hits = []

                if len(hits) < 5 and retry_relaxed:
                    try:
                        extra = self.pinecone_service.search(
                            query_text=q,
                            top_k=settings.semantic_top_k,
                            metadata_filter=relaxed_filter,
                            alpha=alpha,
                        )
                        hits = self._merge_hits(hits, extra)
                    except Exception as exc:
                        logger.warning(f"Semantic fallback failed: {exc}")

                for hit in hits:
                    existing = merged.get(hit.grantId)
                    if existing is None or hit.semanticScore > existing.semanticScore:
                        merged[hit.grantId] = hit

        return sorted(merged.values(), key=lambda h: h.semanticScore, reverse=True)

    @staticmethod
    def _weighted_rrf_semantic(
        channels: List[Tuple[List[SemanticHit], float]],
        k: int,
        pool_size: int,
    ) -> List[SemanticHit]:
        """RRF where each channel can contribute with a weight multiplier.
        Used to fuse intent (heavy) and fit (light) inside the semantic stage."""
        scores: Dict[int, float] = {}
        best_hit: Dict[int, SemanticHit] = {}

        for channel, weight in channels:
            if weight <= 0 or not channel:
                continue
            for rank, hit in enumerate(channel, start=1):
                gid = hit.grantId
                scores[gid] = scores.get(gid, 0.0) + weight * (1.0 / (k + rank))
                prev = best_hit.get(gid)
                if prev is None or hit.semanticScore > prev.semanticScore:
                    best_hit[gid] = hit

        ordered = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        out: List[SemanticHit] = []
        for gid, _ in ordered[:pool_size]:
            out.append(best_hit[gid])
        return out

    def _keyword_channel(
        self,
        profile: UserProfile,
        request: RecommendationRequest,
        fallback_query: str,
    ) -> List[SemanticHit]:
        """PostgreSQL full-text search via Spring Boot, one call per query
        string, run concurrently. Each KeywordCandidate becomes a thin
        SemanticHit with score-only (no metadata) — RRF only needs rank order.
        `fallback_query` is searched only when the request and profile give
        nothing else to search for."""
        if not settings.use_keyword_channel:
            return []

        # Prefer client-supplied keyword candidates if present
        if request.keywordCandidates:
            return self._kw_to_hits(request.keywordCandidates)

        seed_query = (request.userQuery or "").strip()
        queries: List[str] = []
        if seed_query:
            queries.append(seed_query)
        if profile.keywords:
            queries.append(" ".join(profile.keywords))
        if profile.researchInterests:
            queries.append(" ".join(profile.researchInterests))
        if not queries and fallback_query:
            queries.append(fallback_query)
        queries = list(dict.fromkeys(q for q in queries if q.strip()))
        if not queries:
            return []

        def _search(q: str) -> List[KeywordCandidate]:
            try:
                return self.spring_client.keyword_search(
                    query=q,
                    user_profile=profile,
                    top_k=settings.keyword_top_k,
                )
            except Exception as exc:
                logger.warning(f"Keyword channel failed for query='{q[:60]}': {exc}")
                return []

        merged: Dict[int, KeywordCandidate] = {}
        with ThreadPoolExecutor(max_workers=len(queries)) as executor:
            for results in executor.map(_search, queries):
                for kc in results:
                    prev = merged.get(kc.grantId)
                    if prev is None or kc.keywordScore > prev.keywordScore:
                        merged[kc.grantId] = kc

        ranked = sorted(merged.values(), key=lambda c: c.keywordScore, reverse=True)
        return self._kw_to_hits(ranked)

    @staticmethod
    def _kw_to_hits(cands: List[KeywordCandidate]) -> List[SemanticHit]:
        return [
            SemanticHit(grantId=c.grantId, semanticScore=float(c.keywordScore), fields={})
            for c in cands
        ]

    def _hydrate_missing_metadata(self, hits: List[SemanticHit]) -> List[SemanticHit]:
        """Fill in Pinecone metadata for any candidate that came from the keyword
        channel only (and therefore has empty `fields`)."""
        missing_ids = [h.grantId for h in hits if not (h.fields.get("grant_title") or h.fields.get("chunk_text"))]
        if not missing_ids:
            return hits

        try:
            md_by_id = self.pinecone_service.fetch_metadata_by_grant_ids(missing_ids)
        except Exception as exc:
            logger.warning(f"Metadata hydration failed (non-fatal): {exc}")
            md_by_id = {}

        if not md_by_id:
            return hits

        hydrated: List[SemanticHit] = []
        for h in hits:
            md = md_by_id.get(h.grantId)
            if md and not (h.fields.get("grant_title") or h.fields.get("chunk_text")):
                merged = {**md, **h.fields}  # keep RRF score etc. from h
                hydrated.append(SemanticHit(grantId=h.grantId, semanticScore=h.semanticScore, fields=merged))
            else:
                hydrated.append(h)
        return hydrated

    @staticmethod
    def _drop_ineligible(profile: UserProfile, hits: List[SemanticHit]) -> List[SemanticHit]:
        """Remove candidates the user can't act on: deadline passed, or a hard
        eligibility conflict (PhD, citizenship, country, experience). If every
        candidate goes, the result is empty — grants the user is known to be
        ineligible for are never shown as matches."""
        kept: List[SemanticHit] = []
        for hit in hits:
            fields = hit.fields or {}
            if settings.exclude_expired_grants and not deadline_is_open(fields.get("application_deadline")):
                continue
            if settings.enable_hard_eligibility_filter:
                disqualified, reason = is_strictly_disqualified(profile, fields)
                if disqualified:
                    logger.debug("Grant %d disqualified: %s", hit.grantId, reason)
                    continue
            kept.append(hit)
        if len(kept) != len(hits):
            logger.debug("Dropped %d expired/ineligible candidate(s) before reranking.", len(hits) - len(kept))
        return kept

    @staticmethod
    def _merge_hits(primary: List[SemanticHit], extra: List[SemanticHit]) -> List[SemanticHit]:
        seen = {h.grantId for h in primary}
        out = list(primary)
        for h in extra:
            if h.grantId not in seen:
                out.append(h)
                seen.add(h.grantId)
        return out

    # ---------- Stage 3: RRF ----------

    @staticmethod
    def _rrf_fuse(
        channels: List[List[SemanticHit]],
        k: int,
        pool_size: int,
    ) -> List[SemanticHit]:
        """
        Reciprocal Rank Fusion: score = Σ 1/(k + rank_i) across channels.
        Carries forward the richest available metadata (Pinecone hits beat
        keyword-only hits) and keeps the best raw semantic score for downstream
        scoring.
        """
        scores: Dict[int, float] = {}
        best_hit: Dict[int, SemanticHit] = {}

        for channel in channels:
            for rank, hit in enumerate(channel, start=1):
                gid = hit.grantId
                scores[gid] = scores.get(gid, 0.0) + 1.0 / (k + rank)

                prev = best_hit.get(gid)
                if prev is None:
                    best_hit[gid] = hit
                else:
                    # Prefer the hit with metadata; otherwise the higher score
                    if not prev.fields and hit.fields:
                        best_hit[gid] = hit
                    elif prev.fields and hit.fields and hit.semanticScore > prev.semanticScore:
                        # keep prev's fields but bump the score
                        prev.semanticScore = max(prev.semanticScore, hit.semanticScore)
                        best_hit[gid] = prev

        ordered = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        fused: List[SemanticHit] = []
        for gid, rrf_score in ordered[:pool_size]:
            hit = best_hit[gid]
            fields = dict(hit.fields or {})
            fields["_rrf_score"] = rrf_score
            fused.append(SemanticHit(grantId=gid, semanticScore=hit.semanticScore, fields=fields))
        return fused

    # ---------- Stage 4: rerank ----------

    def _rerank_stage(
        self,
        query: str,
        candidates: List[SemanticHit],
        top_k: int,
    ) -> List[SemanticHit]:
        if not candidates:
            return []

        docs = []
        for hit in candidates:
            text = self._candidate_text_for_rerank(hit)
            docs.append({
                "id": str(hit.grantId),
                "text": text or hit.fields.get("grant_title", "") or "",
                "_grant_id": hit.grantId,
            })

        ranked_docs = self.pinecone_service.rerank(
            query=query,
            documents=docs,
            top_n=top_k,
            text_field="text",
        )

        if not ranked_docs:
            return candidates[:top_k]

        by_id = {h.grantId: h for h in candidates}
        out: List[SemanticHit] = []
        for doc in ranked_docs:
            gid = doc.get("_grant_id")
            if gid is None:
                try:
                    gid = int(doc.get("id"))
                except Exception:
                    continue
            hit = by_id.get(gid)
            if hit is None:
                continue
            new_fields = dict(hit.fields or {})
            new_fields["_rerank_score"] = doc.get("_rerank_score", 0.0)
            new_fields["_rerank_rank"] = doc.get("_rerank_rank")
            out.append(SemanticHit(grantId=gid, semanticScore=hit.semanticScore, fields=new_fields))
        return out

    @staticmethod
    def _candidate_text_for_rerank(hit: SemanticHit) -> str:
        if settings.enable_structured_rerank_prompt:
            return RecommenderService._candidate_text_structured(hit)

        f = hit.fields or {}
        parts = []
        title = f.get("grant_title")
        agency = f.get("funding_agency")
        if title:
            parts.append(f"Title: {title}")
        if agency:
            parts.append(f"Agency: {agency}")
        chunk = f.get("chunk_text")
        if chunk:
            parts.append(chunk)
        for key in ("field", "eligible_applicants", "eligible_countries", "tags"):
            val = f.get(key)
            if val:
                parts.append(f"{key}: {', '.join(val) if isinstance(val, list) else val}")
        return "\n".join(parts).strip()

    @staticmethod
    def _candidate_text_structured(hit: SemanticHit) -> str:
        """Reranker-optimised format. Cross-encoders work much better on natural,
        sentence-like prompts than on `key: value` dumps. Also caps the chunk so
        the most relevant text isn't drowned by metadata."""
        f = hit.fields or {}

        def _csv(val) -> str:
            if isinstance(val, list):
                return ", ".join(str(v) for v in val if v)
            return str(val) if val else ""

        title = f.get("grant_title") or "Untitled grant"
        agency = f.get("funding_agency") or "an unspecified agency"

        # Trim chunk to keep the cross-encoder focused. ~200 tokens ≈ 1100 chars.
        chunk_text = (f.get("chunk_text") or "").strip()
        if len(chunk_text) > 1100:
            chunk_text = chunk_text[:1100].rsplit(" ", 1)[0] + "…"

        fields_csv = _csv(f.get("field"))
        applicants_csv = _csv(f.get("eligible_applicants"))
        countries_csv = _csv(f.get("eligible_countries"))
        deadline = f.get("application_deadline") or ""
        funding_lo = f.get("funding_min") or f.get("funding_amount_min") or ""
        funding_hi = f.get("funding_max") or f.get("funding_amount_max") or ""

        sentences: List[str] = []
        sentences.append(f'Grant offered: "{title}" from {agency}.')
        if fields_csv:
            sentences.append(f"Field: {fields_csv}.")
        if chunk_text:
            sentences.append(f"Description: {chunk_text}")
        if applicants_csv:
            sentences.append(f"Eligible applicants: {applicants_csv}.")
        if countries_csv:
            sentences.append(f"Eligible countries: {countries_csv}.")
        if funding_lo or funding_hi:
            sentences.append(f"Funding range: {funding_lo or 'unspecified'} to {funding_hi or 'unspecified'}.")
        if deadline:
            sentences.append(f"Deadline: {deadline}.")

        return " ".join(sentences).strip()

    # ---------- Stage 5: 5-signal scoring ----------

    def _score_candidates(
        self,
        profile: UserProfile,
        user_query: Optional[str],
        candidates: List[SemanticHit],
    ) -> List[RecommendationItem]:
        items: List[RecommendationItem] = []

        # Resolve scoring weights once per request (global, or per-segment when enabled).
        weights = self._resolve_weights(profile)

        # Fallback semantic signal when there are no rerank scores (rerank off
        # or failed): the RRF score min-max normalised within this pool —
        # relative, but on one scale for both channels.
        rrf_scores = [c.fields.get("_rrf_score", 0.0) for c in candidates]
        f_min = min(rrf_scores) if rrf_scores else 0.0
        f_span = ((max(rrf_scores) - f_min) if rrf_scores else 0.0) or 1.0

        for hit in candidates:
            fields = hit.fields or {}

            # Semantic signal: the reranker's relevance score, used as-is.
            # bge-reranker-v2-m3 scores already come back in [0, 1], so a pool
            # of weak candidates scores low instead of being stretched to fill
            # the range — the match % means the same thing across queries.
            rr = fields.get("_rerank_score")
            if rr is not None:
                semantic = float(rr)
            else:
                semantic = (fields.get("_rrf_score", 0.0) - f_min) / f_span
            semantic = max(0.0, min(1.0, semantic))

            signals = candidate_signals(profile, user_query, fields)
            final = blend(weights, semantic, signals)

            logger.debug(
                f"GrantId={hit.grantId} | Sem={semantic:.3f} | Eli={signals['eligibility']:.3f} | "
                f"Kw={signals['keyword']:.3f} | Fund={signals['funding']:.3f} | "
                f"Fresh={signals['freshness']:.3f} | Adj={signals['adjustment']:+.2f} | Final={final:.3f}"
            )

            items.append(
                RecommendationItem(
                    grantId=hit.grantId,
                    finalScore=round(final, 6),
                    semanticScore=round(semantic, 6),
                    keywordScore=round(signals["keyword"], 6),
                    eligibilityScore=round(signals["eligibility"], 6),
                    freshnessScore=round(signals["freshness"], 6),
                    title=fields.get("grant_title"),
                    fundingAgency=fields.get("funding_agency"),
                    reason=self._build_reason(
                        profile, fields, semantic, signals["eligibility"], signals["keyword"], signals["funding"]
                    ),
                    fields=fields,
                )
            )

        return items

    # ---------- Helpers ----------

    @staticmethod
    def _segment_for(profile: UserProfile) -> Optional[str]:
        """Map a profile's applicant type to a weight-preset segment, or None
        (→ global weights). Substring matching keeps it robust to casing and
        the humanized enum form (e.g. 'Professor Faculty', 'Startup Company')."""
        at = _norm(getattr(profile, "applicantType", None))
        if not at:
            return None
        if "student" in at:
            return "student"
        if "startup" in at or "company" in at:
            return "startup"
        if "nonprofit" in at or "ngo" in at:
            return "ngo"
        if "professor" in at or "faculty" in at or "researcher" in at or "academic" in at:
            return "academic"
        return None

    def _resolve_weights(self, profile: UserProfile) -> Dict[str, float]:
        """The 5 scoring weights for this profile. Global defaults unless segment
        weights are enabled AND the profile maps to a known segment."""
        base = {
            "semantic": settings.weight_semantic,
            "eligibility": settings.weight_eligibility,
            "keyword": settings.weight_keyword,
            "funding": settings.weight_funding,
            "freshness": settings.weight_freshness,
        }
        if not settings.enable_segment_weights:
            return base
        seg = self._segment_for(profile)
        if seg and seg in _SEGMENT_WEIGHT_PRESETS:
            logger.debug("Applying '%s' segment weights for applicantType=%r", seg, profile.applicantType)
            return dict(_SEGMENT_WEIGHT_PRESETS[seg])
        return base

    @staticmethod
    def _resolve_alpha(request: RecommendationRequest, query_text: str) -> float:
        if request.alpha is not None:
            return float(request.alpha)
        q = (request.userQuery or "").strip()
        if "deadline" in query_text.lower():
            return 0.5
        if q and len(q.split()) < 3 and q.isupper():
            return 0.3
        if q and len(q.split()) > 4:
            return 0.75
        return 0.7

    def _metadata_filters(self, profile: UserProfile) -> Tuple[Optional[dict], Optional[dict]]:
        """
        Pinecone metadata filters as (filter, relaxed_filter).

        - Deadline (when expired grants are excluded): deadline still ahead,
          or no deadline_epoch at all (rolling / unknown deadlines stay).
        - Country (soft, see _country_clause).

        Each clause lets unknowns through, so ANDing them only drops grants
        known to be expired or known to exclude the user's country.
        relaxed_filter is for the thin-results retry: it drops the country
        clause but keeps the deadline clause, so the retry can't bring
        expired grants back.
        """
        deadline_clause = None
        if settings.exclude_expired_grants:
            deadline_clause = {
                "$or": [
                    {"deadline_epoch": {"$gte": int(time.time())}},
                    {"deadline_epoch": {"$exists": False}},
                ]
            }
        country_clause = self._country_clause(profile) if settings.use_soft_filters else None

        clauses = [c for c in (deadline_clause, country_clause) if c]
        if not clauses:
            metadata_filter = None
        elif len(clauses) == 1:
            metadata_filter = clauses[0]
        else:
            metadata_filter = {"$and": clauses}
        return metadata_filter, deadline_clause

    @staticmethod
    def _country_clause(profile: UserProfile) -> Optional[dict]:
        """
        Soft country filter: include grants that explicitly match the user's
        country OR are open to all OR have no country listed at all. Never AND
        across multiple eligibility fields — that silently kills recall.
        """
        if not profile.country:
            return None
        country_aliases = list(_expand_aliases(profile.country, COUNTRY_ALIASES))
        # Pinecone metadata filters are case-sensitive against the stored values.
        # Stored values aren't normalised, so include common casings.
        casings = set()
        for c in country_aliases:
            casings.add(c)
            casings.add(c.title())
            casings.add(c.upper())
        casings.update({"All", "Any", "Global", "International", "Worldwide"})
        return {
            "$or": [
                {"eligible_countries": {"$in": sorted(casings)}},
                {"eligible_countries": {"$exists": False}},
            ]
        }

    def _build_reason(
        self,
        profile: UserProfile,
        fields: dict,
        semantic: float,
        elig: float,
        keyword: float,
        funding: float,
    ) -> str:
        bits: List[str] = []

        country_aliases = _expand_aliases(profile.country, COUNTRY_ALIASES)
        grant_countries = _norm_set(fields.get("eligible_countries", []))

        if profile.country and (country_aliases & grant_countries):
            bits.append(f"country match: {profile.country}")
        # 0.7+ = exact or alias match; UNKNOWN_FIT (0.5) is not a fit to report.
        if _match_strength(profile.applicantType, fields.get("eligible_applicants"), APPLICANT_ALIASES) >= 0.7:
            bits.append(f"applicant fit: {profile.applicantType}")
        if _match_strength(profile.institutionType, fields.get("institution_type"), INSTITUTION_ALIASES) >= 0.7:
            bits.append(f"institution fit: {profile.institutionType}")

        grant_fields_list = fields.get("field") or []
        if profile.researchInterests and grant_fields_list:
            overlap = _norm_set(profile.researchInterests) & _norm_set(grant_fields_list)
            if overlap:
                bits.append(f"research overlap: {', '.join(sorted(overlap))}")

        if funding >= 0.7:
            bits.append("funding range fits")

        deadline = fields.get("application_deadline")
        if deadline:
            if deadline_is_open(deadline):
                bits.append("deadline open")
            else:
                bits.append("deadline likely closed")

        if not bits:
            if semantic >= keyword:
                bits.append("strong semantic similarity with your profile")
            else:
                bits.append("strong keyword match with your profile")

        return "; ".join(bits[:4])
