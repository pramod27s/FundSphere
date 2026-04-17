from typing import Dict, List, Optional
from .config import settings
from .filters import eligibility_score, freshness_score, deadline_is_open
from .keyword_fusion import fuse_keyword_and_semantic
from .pinecone_client import PineconeService
from .profile_builder import build_user_query_text
from .schemas import (
    RecommendationItem,
    RecommendationRequest,
    RecommendationResponse,
    SemanticHit,
    UserProfile,
)
from .springboot_client import SpringBootClient


class RecommenderService:
    def __init__(self, spring_client: SpringBootClient, pinecone_service: PineconeService) -> None:
        self.spring_client = spring_client
        self.pinecone_service = pinecone_service

    def recommend(self, request: RecommendationRequest) -> RecommendationResponse:
        profile = request.userProfile
        if profile is None:
            if request.userId is None:
                raise ValueError("Either userProfile or userId is required")
            profile = self.spring_client.get_user_profile(request.userId)

        query_text = build_user_query_text(profile, request.userQuery)
        keyword_candidates = request.keywordCandidates

        if not keyword_candidates:
            keyword_candidates = self.spring_client.keyword_search(
                query=query_text,
                user_profile=profile,
                top_k=max(request.topK * 3, 20),
            )

            # If strict profile filters return nothing, retry broad keyword search.
            if not keyword_candidates:
                keyword_candidates = self.spring_client.keyword_search(
                    query=query_text,
                    user_profile=None,
                    top_k=max(request.topK * 3, 20),
                )

        metadata_filter = self._build_metadata_filter(profile)
        semantic_hits = self.pinecone_service.search(
            query_text=query_text,
            top_k=max(request.topK * 3, settings.semantic_top_k),
            metadata_filter=metadata_filter,
            use_rerank=settings.use_rerank if request.useRerank is None else request.useRerank,
        )

        # If metadata constraints are too narrow, retry without filter to recover candidates.
        if not semantic_hits and metadata_filter is not None:
            semantic_hits = self.pinecone_service.search(
                query_text=query_text,
                top_k=max(request.topK * 3, settings.semantic_top_k),
                metadata_filter=None,
                use_rerank=settings.use_rerank if request.useRerank is None else request.useRerank,
            )

        fused = fuse_keyword_and_semantic(keyword_candidates, semantic_hits)
        semantic_map = {hit.grantId: hit for hit in semantic_hits}

        items: List[RecommendationItem] = []

        for grant_id, scores in fused.items():
            hit: Optional[SemanticHit] = semantic_map.get(grant_id)
            fields = hit.fields if hit else {}

            e_score = eligibility_score(profile, fields)
            f_score = freshness_score(fields.get("application_deadline"))

            expired_penalty = 0.15 if fields.get("application_deadline") and not deadline_is_open(fields.get("application_deadline")) else 0.0

            final_score = (
                0.45 * scores["semanticScore"]
                + 0.25 * scores["keywordScore"]
                + 0.15 * e_score
                + 0.10 * f_score
                + 0.05 * scores["rrfScore"]
                - expired_penalty
            )

            items.append(
                RecommendationItem(
                    grantId=grant_id,
                    finalScore=round(final_score, 6),
                    semanticScore=round(scores["semanticScore"], 6),
                    keywordScore=round(scores["keywordScore"], 6),
                    eligibilityScore=round(e_score, 6),
                    freshnessScore=round(f_score, 6),
                    title=fields.get("grant_title"),
                    fundingAgency=fields.get("funding_agency"),
                    reason=self._build_reason(profile, fields, scores),
                    fields=fields,
                )
            )

        items.sort(key=lambda x: x.finalScore, reverse=True)
        top_items = items[: request.topK or settings.final_top_k]

        return RecommendationResponse(
            queryText=query_text,
            results=top_items,
        )

    def _build_metadata_filter(self, profile: UserProfile) -> dict | None:
        clauses = []

        if profile.country:
            clauses.append({"eligible_countries": {"$in": [profile.country]}})

        if profile.institutionType:
            clauses.append({"institution_type": {"$in": [profile.institutionType]}})

        if profile.applicantType:
            clauses.append({"eligible_applicants": {"$in": [profile.applicantType]}})

        if not clauses:
            return None
        if len(clauses) == 1:
            return clauses[0]
        return {"$and": clauses}

    def _build_reason(self, profile: UserProfile, fields: Dict, scores: Dict) -> str:
        reasons = []

        if profile.country and profile.country in fields.get("eligible_countries", []):
            reasons.append(f"country match: {profile.country}")

        if profile.institutionType and profile.institutionType in fields.get("institution_type", []):
            reasons.append(f"institution match: {profile.institutionType}")

        if profile.applicantType and profile.applicantType in fields.get("eligible_applicants", []):
            reasons.append(f"applicant match: {profile.applicantType}")

        grant_fields = fields.get("field", [])
        if profile.researchInterests and grant_fields:
            overlap = set(x.lower() for x in profile.researchInterests) & set(x.lower() for x in grant_fields)
            if overlap:
                reasons.append(f"research overlap: {', '.join(sorted(overlap))}")

        if fields.get("application_deadline"):
            if deadline_is_open(fields.get("application_deadline")):
                reasons.append("deadline still open")
            else:
                reasons.append("deadline may be closed")

        if not reasons:
            if scores["semanticScore"] > scores["keywordScore"]:
                reasons.append("strong semantic similarity with your profile")
            else:
                reasons.append("strong keyword match with your profile")

        return "; ".join(reasons[:4])