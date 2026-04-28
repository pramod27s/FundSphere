from typing import Dict, List, Optional
from .config import settings
from .filters import eligibility_score, freshness_score, deadline_is_open
from .pinecone_client import PineconeService
from .profile_builder import build_user_query_text
from .schemas import (
    RecommendationItem,
    RecommendationRequest,
    RecommendationResponse,
    SemanticHit,
    UserProfile,
)
from .query_expander import expand_queries
from .llm_judge import judge_and_rerank
from .springboot_client import SpringBootClient
import logging

logger = logging.getLogger("rag.recommender")


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

        use_rerank = settings.use_rerank if request.useRerank is None else request.useRerank
        
        # Expose alpha on the request if present, else fallback to smart defaults
        alpha = 0.7
        if hasattr(request, "alpha") and request.alpha is not None:
            alpha = request.alpha
        elif "deadline" in query_text.lower():
            alpha = 0.5
        elif request.userQuery and len(request.userQuery.split()) < 3 and request.userQuery.isupper(): 
            alpha = 0.3
        elif request.userQuery and len(request.userQuery.split()) > 4: 
            alpha = 0.75

        if getattr(settings, "enable_query_expansion", False):
            query_strings = expand_queries(profile, request.userQuery)
        else:
            query_strings = [query_text]

        all_semantic_hits: Dict[int, SemanticHit] = {}

        for q_str in query_strings:
            hits = self._search_with_fallback(
                profile=profile,
                query_text=q_str,
                top_k=max(request.topK * 3, settings.semantic_top_k),
                use_rerank=use_rerank,
                alpha=alpha,
            )
            for hit in hits:
                if hit.grantId not in all_semantic_hits or hit.semanticScore > all_semantic_hits[hit.grantId].semanticScore:
                    all_semantic_hits[hit.grantId] = hit

        semantic_hits = list(all_semantic_hits.values())

        items: List[RecommendationItem] = []

        for hit in semantic_hits:
            fields = hit.fields if hit else {}
            grant_id = hit.grantId
            score = hit.semanticScore
            
            e_score = eligibility_score(profile, fields)
            f_score = freshness_score(fields.get("application_deadline"), decay_rate=getattr(settings, "freshness_decay_rate", 0.012))

            expired_penalty = getattr(settings, "expired_penalty", 0.15) if fields.get("application_deadline") and not deadline_is_open(fields.get("application_deadline")) else 0.0

            w_sem = getattr(settings, "weight_semantic", 0.70)
            w_eli = getattr(settings, "weight_eligibility", 0.20)
            w_fre = getattr(settings, "weight_freshness", 0.10)

            final_score = (
                w_sem * score
                + w_eli * e_score
                + w_fre * f_score
                - expired_penalty
            )
            
            logger.debug(
                f"GrantId={grant_id} | Sem={score:.3f}(x{w_sem}) | Eli={e_score:.3f}(x{w_eli}) | Fre={f_score:.3f}(x{w_fre}) | Pen={expired_penalty:.3f} | Final={final_score:.3f}"
            )

            items.append(
                RecommendationItem(
                    grantId=grant_id,
                    finalScore=round(final_score, 6),
                    semanticScore=round(score, 6),
                    keywordScore=0.0,
                    eligibilityScore=round(e_score, 6),
                    freshnessScore=round(f_score, 6),
                    title=fields.get("grant_title"),
                    fundingAgency=fields.get("funding_agency"),
                    reason=self._build_reason(profile, fields, {"semanticScore": score, "keywordScore": 0.0}),
                    fields=fields,
                )
            )

        items.sort(key=lambda x: x.finalScore, reverse=True)
        
        target_top_k = request.topK or settings.final_top_k
        
        if getattr(settings, "enable_llm_judge", False):
            judge_candidates = items[: getattr(settings, "llm_judge_candidate_count", 20)]
            top_items = judge_and_rerank(profile, query_text, judge_candidates, target_top_k)
        else:
            top_items = items[:target_top_k]

        return RecommendationResponse(
            queryText=query_text,
            results=top_items,
        )

    def _search_with_fallback(
        self,
        profile: UserProfile,
        query_text: str,
        top_k: int,
        use_rerank: bool,
        alpha: float,
    ) -> List[SemanticHit]:
        collected: Dict[str, SemanticHit] = {}
        stages = self._build_metadata_filter_stages(profile)

        for i, metadata_filter in enumerate(stages):
            hits = self.pinecone_service.search(
                query_text=query_text,
                top_k=top_k,
                metadata_filter=metadata_filter,
                use_rerank=use_rerank,
                alpha=alpha,
            )

            is_last_stage = (i == len(stages) - 1)
            cleaned_hits = self._post_filter_hits(profile, hits, strict=not is_last_stage)

            for hit in cleaned_hits:
                if hit.grantId not in collected:
                    collected[hit.grantId] = hit

        return list(collected.values())[:top_k]

    def _build_metadata_filter_stages(self, profile: UserProfile) -> List[dict | None]:
        stages: List[dict | None] = []

        country_clause = self._clause("eligible_countries", self._expand_country(profile.country))
        institution_clause = self._clause("institution_type", self._expand_institution(profile.institutionType))
        applicant_clause = self._clause("eligible_applicants", self._expand_applicant(profile.applicantType))

        all_clauses = [c for c in [country_clause, institution_clause, applicant_clause] if c]
        if all_clauses:
            stages.append(self._and_clauses(all_clauses))

        if country_clause and applicant_clause:
            stages.append(self._and_clauses([country_clause, applicant_clause]))

        if country_clause and institution_clause:
            stages.append(self._and_clauses([country_clause, institution_clause]))

        if country_clause:
            stages.append(country_clause)

        if applicant_clause:
            stages.append(applicant_clause)

        if institution_clause:
            stages.append(institution_clause)

        # Final fallback keeps recall when metadata values are inconsistent.
        stages.append(None)

        hard_clauses = []
        if getattr(profile, "hasPhd", None) is False:
            hard_clauses.append({"requires_phd": {"$ne": True}})
        if getattr(profile, "yearsOfExperience", None) is not None:
            # We use $or to allow missing fields if possible, but Pinecone standard only supports flat filters easily.
            # Using $lte as requested, though it may filter out records missing this field.
            hard_clauses.append({"min_experience_years": {"$lte": profile.yearsOfExperience}})
        if getattr(profile, "citizenship", None):
            hard_clauses.append({"citizenship_required": {"$in": [self._normalize(profile.citizenship)]}})

        deduped: List[dict | None] = []
        seen = set()
        for stage in stages:
            if hard_clauses:
                if stage is None:
                    stage = self._and_clauses(hard_clauses)
                else:
                    stage = self._and_clauses([stage] + hard_clauses)
            
            key = repr(stage)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(stage)

        return deduped

    def _post_filter_hits(self, profile: UserProfile, hits: List[SemanticHit], strict: bool) -> List[SemanticHit]:
        cleaned: List[SemanticHit] = []

        profile_country = self._normalize(profile.country)
        for hit in hits:
            fields = hit.fields or {}

            # Strict metadata filtering safety net
            if getattr(profile, "hasPhd", None) is False and fields.get("requires_phd") is True:
                continue
            
            years_exp = getattr(profile, "yearsOfExperience", None)
            if years_exp is not None:
                min_exp = fields.get("min_experience_years")
                if min_exp is not None and min_exp > years_exp:
                    continue

            citizenship = getattr(profile, "citizenship", None)
            if citizenship:
                cit_req = self._normalize_list(fields.get("citizenship_required", []))
                if cit_req and self._normalize(citizenship) not in cit_req:
                    continue

            # Keep strong semantic recall, but remove clear country mismatch when metadata exists.
            if strict and profile_country:
                eligible_countries = self._normalize_list(fields.get("eligible_countries", []))
                if eligible_countries and profile_country not in eligible_countries:
                    continue

            cleaned.append(hit)

        return cleaned

    def _clause(self, field: str, values: List[str]) -> dict | None:
        if not values:
            return None
        unique_values = []
        seen = set()
        for value in values:
            key = self._normalize(value)
            if not key or key in seen:
                continue
            seen.add(key)
            unique_values.append(value)
        if not unique_values:
            return None
        return {field: {"$in": unique_values}}

    def _and_clauses(self, clauses: List[dict]) -> dict:
        if len(clauses) == 1:
            return clauses[0]
        return {"$and": clauses}

    def _expand_country(self, value: str | None) -> List[str]:
        if not value:
            return []
        normalized = self._normalize(value)
        aliases = {
            "usa": ["USA", "US", "United States", "United States of America"],
            "us": ["US", "USA", "United States", "United States of America"],
            "united states": ["United States", "United States of America", "US", "USA"],
            "uk": ["UK", "United Kingdom", "Great Britain"],
            "united kingdom": ["United Kingdom", "UK", "Great Britain"],
        }
        return aliases.get(normalized, [value])

    def _expand_institution(self, value: str | None) -> List[str]:
        if not value:
            return []
        normalized = self._normalize(value)
        aliases = {
            "university": [
                "University",
                "Universities",
                "Academic Institutions",
                "Private Academic Institutions",
            ],
            "college": ["College", "Colleges", "Academic Institutions"],
            "academic institution": ["Academic Institutions", "University", "Universities"],
            "startup": ["Startup", "Startups", "Early-stage Startups"],
            "ngo": ["NGO", "Non-Governmental Organizations"],
        }
        return aliases.get(normalized, [value])

    def _expand_applicant(self, value: str | None) -> List[str]:
        if not value:
            return []
        normalized = self._normalize(value)
        aliases = {
            "researcher": ["Researcher", "Researchers", "Individual Researchers", "Faculty"],
            "student": ["Student", "Students", "Graduate Students", "PhD Students"],
            "faculty": ["Faculty", "Researchers", "Principal Investigators"],
            "startup": ["Startup", "Startups", "Founders", "Entrepreneurs"],
        }
        return aliases.get(normalized, [value])

    def _normalize(self, value: str | None) -> str:
        return (value or "").strip().lower()

    def _normalize_list(self, values: List[str] | None) -> set[str]:
        if not values:
            return set()
        return {self._normalize(str(v)) for v in values if self._normalize(str(v))}

    def _build_reason(self, profile: UserProfile, fields: Dict, scores: Dict) -> str:
        reasons = []

        normalized_countries = self._normalize_list(fields.get("eligible_countries", []))
        normalized_institutions = self._normalize_list(fields.get("institution_type", []))
        normalized_applicants = self._normalize_list(fields.get("eligible_applicants", []))

        country_aliases = {self._normalize(x) for x in self._expand_country(profile.country)}
        institution_aliases = {self._normalize(x) for x in self._expand_institution(profile.institutionType)}
        applicant_aliases = {self._normalize(x) for x in self._expand_applicant(profile.applicantType)}

        if country_aliases and country_aliases & normalized_countries:
            reasons.append(f"country match: {profile.country}")

        if institution_aliases and institution_aliases & normalized_institutions:
            reasons.append(f"institution match: {profile.institutionType}")

        if applicant_aliases and applicant_aliases & normalized_applicants:
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