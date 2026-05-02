import logging
from typing import Dict, List, Optional, Tuple

from .config import settings
from .filters import (
    deadline_is_open,
    eligibility_score,
    freshness_score,
    funding_fit,
    keyword_overlap_score,
    _expand_aliases,
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


class RecommenderService:
    def __init__(self, spring_client: SpringBootClient, pinecone_service: PineconeService) -> None:
        self.spring_client = spring_client
        self.pinecone_service = pinecone_service

    # ---------- Public entry point ----------

    def recommend(self, request: RecommendationRequest) -> RecommendationResponse:
        profile = request.userProfile
        if profile is None:
            if request.userId is None:
                raise ValueError("Either userProfile or userId is required")
            profile = self.spring_client.get_user_profile(request.userId)

        query_text = build_user_query_text(profile, request.userQuery)
        target_top_k = request.topK or settings.final_top_k

        # Stage 1 — query build (+ expansion)
        if settings.enable_query_expansion:
            query_strings = expand_queries(profile, request.userQuery)
        else:
            query_strings = [query_text]

        alpha = self._resolve_alpha(request, query_text)
        use_rerank = settings.use_rerank if request.useRerank is None else request.useRerank

        # Stage 1.5 — HyDE: ask the LLM to write a hypothetical grant that
        # would match the user's need. Bridges the vocabulary gap between
        # researcher queries and real grant text. Cached internally.
        hyde_doc = generate_hypothetical_grant(profile, request.userQuery)
        if hyde_doc:
            query_strings = self._inject_hyde(query_strings, hyde_doc)

        # Stage 2 — parallel retrieval channels
        if settings.enable_profile_query_split:
            semantic_hits = self._semantic_channel_split(
                profile, request.userQuery, query_strings, alpha, hyde_doc=hyde_doc
            )
        else:
            semantic_hits = self._semantic_channel(profile, query_strings, alpha)
        keyword_hits = self._keyword_channel(profile, request, query_strings)

        # Stage 3 — RRF fusion across channels
        fused = self._rrf_fuse(
            channels=[semantic_hits, keyword_hits],
            k=settings.rrf_k,
            pool_size=settings.rrf_pool_size,
        )

        if not fused:
            return RecommendationResponse(queryText=query_text, results=[])

        # Hydrate keyword-only candidates (no Pinecone metadata) before scoring/reranking
        fused = self._hydrate_missing_metadata(fused)

        # Drop anything we still couldn't hydrate — without a title or chunk text,
        # we can't render or rerank it meaningfully.
        fused = [h for h in fused if h.fields.get("grant_title") or h.fields.get("chunk_text")]
        if not fused:
            return RecommendationResponse(queryText=query_text, results=[])

        # Stage 4 — reranker (Pinecone bge-reranker-v2-m3)
        # When the structured prompt is enabled, give the reranker the *intent*
        # (live query) as the anchor — that's what it should be measuring against.
        rerank_query = (request.userQuery or "").strip() if settings.enable_structured_rerank_prompt else query_text
        if not rerank_query:
            rerank_query = query_text
        reranked = self._rerank_stage(rerank_query, fused, top_k=settings.rerank_top_k) if use_rerank else fused[: settings.rerank_top_k]

        # Stage 5 — 5-signal business-rule scoring
        scored = self._score_candidates(profile, request.userQuery, reranked)
        scored.sort(key=lambda x: x.finalScore, reverse=True)
        top_items = scored[:target_top_k]

        # Stage 6 — LLM explanations (never filters)
        if settings.enable_llm_judge:
            top_items = explain_candidates(profile, query_text, top_items)

        return RecommendationResponse(queryText=query_text, results=top_items)

    # ---------- Stage 2: channels ----------

    def _semantic_channel(
        self,
        profile: UserProfile,
        query_strings: List[str],
        alpha: float,
    ) -> List[SemanticHit]:
        """Pinecone hybrid (dense + sparse). Soft filters; structured constraints
        are scored downstream rather than excluded here."""
        soft_filter = self._soft_filter(profile) if settings.use_soft_filters else None
        merged: Dict[int, SemanticHit] = {}

        for q in query_strings:
            try:
                hits = self.pinecone_service.search(
                    query_text=q,
                    top_k=settings.semantic_top_k,
                    metadata_filter=soft_filter,
                    alpha=alpha,
                )
            except Exception as exc:
                logger.error(f"Semantic channel failed for query='{q[:60]}': {exc}")
                hits = []

            # Recall fallback: drop the soft filter if first attempt was thin.
            if len(hits) < 5 and soft_filter is not None:
                try:
                    extra = self.pinecone_service.search(
                        query_text=q,
                        top_k=settings.semantic_top_k,
                        metadata_filter=None,
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

        soft_filter = self._soft_filter(profile) if settings.use_soft_filters else None

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

        intent_hits = self._run_semantic_queries(intent_queries, alpha, soft_filter)

        # Channel B: fit (profile-only, no live query). Heavier on dense recall
        # of grants matching the researcher's standing background.
        fit_query = build_profile_only_text(profile)
        fit_hits = self._run_semantic_queries([fit_query], alpha, soft_filter) if fit_query else []

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
        soft_filter: Optional[dict],
    ) -> List[SemanticHit]:
        """Helper: run a list of queries through Pinecone, merge by best score."""
        merged: Dict[int, SemanticHit] = {}
        for q in queries:
            try:
                hits = self.pinecone_service.search(
                    query_text=q,
                    top_k=settings.semantic_top_k,
                    metadata_filter=soft_filter,
                    alpha=alpha,
                )
            except Exception as exc:
                logger.error(f"Split-channel semantic search failed for q='{q[:60]}': {exc}")
                hits = []

            if len(hits) < 5 and soft_filter is not None:
                try:
                    extra = self.pinecone_service.search(
                        query_text=q,
                        top_k=settings.semantic_top_k,
                        metadata_filter=None,
                        alpha=alpha,
                    )
                    hits = self._merge_hits(hits, extra)
                except Exception as exc:
                    logger.warning(f"Split-channel semantic fallback failed: {exc}")

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
        query_strings: List[str],
    ) -> List[SemanticHit]:
        """PostgreSQL FTS via Spring Boot. Each KeywordCandidate becomes a thin
        SemanticHit with score-only (no metadata) — RRF only needs rank order."""
        if not settings.use_keyword_channel:
            return []

        # Prefer client-supplied keyword candidates if present
        if request.keywordCandidates:
            return self._kw_to_hits(request.keywordCandidates)

        merged: Dict[int, KeywordCandidate] = {}
        seed_query = (request.userQuery or "").strip()
        queries: List[str] = []
        if seed_query:
            queries.append(seed_query)
        if profile.keywords:
            queries.append(" ".join(profile.keywords))
        if profile.researchInterests:
            queries.append(" ".join(profile.researchInterests))
        if not queries and query_strings:
            queries.append(query_strings[0])

        for q in queries:
            if not q.strip():
                continue
            try:
                results = self.spring_client.keyword_search(
                    query=q,
                    user_profile=profile,
                    top_k=settings.keyword_top_k,
                )
            except Exception as exc:
                logger.warning(f"Keyword channel failed for query='{q[:60]}': {exc}")
                continue

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

        rerank_scores = [c.fields.get("_rerank_score") for c in candidates if c.fields.get("_rerank_score") is not None]
        rr_min = min(rerank_scores) if rerank_scores else 0.0
        rr_max = max(rerank_scores) if rerank_scores else 1.0
        rr_span = (rr_max - rr_min) or 1.0

        sem_scores = [c.semanticScore for c in candidates]
        s_min = min(sem_scores) if sem_scores else 0.0
        s_max = max(sem_scores) if sem_scores else 1.0
        s_span = (s_max - s_min) or 1.0

        for hit in candidates:
            fields = hit.fields or {}

            # Semantic signal: prefer reranker score (normalised) when available
            rr = fields.get("_rerank_score")
            if rr is not None:
                semantic = (rr - rr_min) / rr_span
            else:
                semantic = (hit.semanticScore - s_min) / s_span
            semantic = max(0.0, min(1.0, semantic))

            elig = eligibility_score(profile, fields)
            keyword = keyword_overlap_score(profile, user_query, fields)
            funding = funding_fit(profile, fields)
            fresh = freshness_score(fields)

            deadline = fields.get("application_deadline")
            penalty = settings.expired_penalty if (deadline and not deadline_is_open(deadline)) else 0.0

            final = (
                settings.weight_semantic * semantic
                + settings.weight_eligibility * elig
                + settings.weight_keyword * keyword
                + settings.weight_funding * funding
                + settings.weight_freshness * fresh
                - penalty
            )

            logger.debug(
                f"GrantId={hit.grantId} | Sem={semantic:.3f} | Eli={elig:.3f} | "
                f"Kw={keyword:.3f} | Fund={funding:.3f} | Fresh={fresh:.3f} | "
                f"Pen={penalty:.2f} | Final={final:.3f}"
            )

            items.append(
                RecommendationItem(
                    grantId=hit.grantId,
                    finalScore=round(final, 6),
                    semanticScore=round(semantic, 6),
                    keywordScore=round(keyword, 6),
                    eligibilityScore=round(elig, 6),
                    freshnessScore=round(fresh, 6),
                    title=fields.get("grant_title"),
                    fundingAgency=fields.get("funding_agency"),
                    reason=self._build_reason(profile, fields, semantic, elig, keyword, funding),
                    fields=fields,
                )
            )

        return items

    # ---------- Helpers ----------

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

    def _soft_filter(self, profile: UserProfile) -> Optional[dict]:
        """
        Soft metadata filter: include grants that explicitly match the user's
        country OR are open to all OR have no country listed at all. Never AND
        across multiple structured fields — that silently kills recall.
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
        applicant_aliases = _expand_aliases(profile.applicantType, APPLICANT_ALIASES)
        institution_aliases = _expand_aliases(profile.institutionType, INSTITUTION_ALIASES)

        grant_countries = _norm_set(fields.get("eligible_countries", []))
        grant_applicants = _norm_set(fields.get("eligible_applicants", []))
        grant_institutions = _norm_set(fields.get("institution_type", []))

        if profile.country and (country_aliases & grant_countries):
            bits.append(f"country match: {profile.country}")
        if profile.applicantType and (applicant_aliases & grant_applicants):
            bits.append(f"applicant fit: {profile.applicantType}")
        if profile.institutionType and (institution_aliases & grant_institutions):
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
