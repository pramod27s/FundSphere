import json
import logging
from openai import OpenAI
from .config import settings
from .schemas import UserProfile, RecommendationItem

logger = logging.getLogger("rag.llm_judge")


def explain_candidates(
    profile: UserProfile,
    query_text: str,
    candidates: list[RecommendationItem],
) -> list[RecommendationItem]:
    """
    Annotate each candidate with an LLM-written explanation. Never removes or
    reorders candidates — the deterministic pipeline already chose them. If the
    LLM fails, candidates are returned unchanged.
    """
    if not settings.enable_llm_judge or not settings.groq_api_key_llm_judge or not candidates:
        return candidates

    try:
        client = OpenAI(
            api_key=settings.groq_api_key_llm_judge,
            base_url="https://api.groq.com/openai/v1"
        )

        profile_str = (
            f"Country: {profile.country}\n"
            f"Institution: {profile.institutionType}\n"
            f"Applicant: {profile.applicantType}\n"
            f"Bio: {profile.researchBio}\n"
            f"Interests: {', '.join(profile.researchInterests or [])}\n"
            f"Keywords: {', '.join(profile.keywords or [])}"
        )

        candidates_str = ""
        for i, c in enumerate(candidates):
            fields = c.fields or {}
            candidates_str += f"--- Candidate {i} ---\n"
            candidates_str += f"Grant ID: {c.grantId}\n"
            candidates_str += f"Title: {c.title}\n"
            candidates_str += f"Agency: {c.fundingAgency}\n"
            candidates_str += f"Fields: {', '.join(fields.get('field', []) or [])}\n"
            candidates_str += f"Countries: {', '.join(fields.get('eligible_countries', []) or [])}\n"
            candidates_str += f"Applicants: {', '.join(fields.get('eligible_applicants', []) or [])}\n"
            candidates_str += f"Funding: {fields.get('funding_amount_min')} - {fields.get('funding_amount_max')} {fields.get('funding_currency', '')}\n"
            candidates_str += f"Deadline: {fields.get('application_deadline')}\n\n"

        prompt = f"""You are a grant-matching assistant. For each candidate grant, write a concise 1-2 sentence explanation of why it could be a fit for this user. Focus on the strongest concrete signals (research overlap, eligibility, funding range, deadline). Never reject candidates — explanation only.

User Profile:
{profile_str}

User Query: {query_text}

Candidate Grants:
{candidates_str}

Return ONLY a JSON object with key "explanations" — an array of objects with:
- grantId (integer, must match input)
- reason (string, 1-2 sentences)

Example: {{"explanations": [{{"grantId": 123, "reason": "Your AI research aligns with the program's focus areas, and your country is eligible."}}]}}
"""

        response = client.chat.completions.create(
            model=settings.llm_judge_model,
            messages=[
                {"role": "system", "content": "You explain grant matches. Output ONLY JSON."},
                {"role": "user", "content": prompt},
            ],
        )
        text = (response.choices[0].message.content or "").strip()

        if text.startswith("```json"):
            text = text[7:].rstrip("`").rstrip().rstrip("`").strip()
            if text.endswith("```"):
                text = text[:-3].strip()
        elif text.startswith("```"):
            text = text[3:].rstrip("`").strip()
            if text.endswith("```"):
                text = text[:-3].strip()

        parsed = json.loads(text)
        explanations = parsed.get("explanations", []) if isinstance(parsed, dict) else parsed

        reason_by_id = {}
        for item in explanations:
            gid = item.get("grantId")
            reason = (item.get("reason") or "").strip()
            if gid is not None and reason:
                reason_by_id[int(gid)] = reason

        for c in candidates:
            if c.grantId in reason_by_id:
                c.llmReason = reason_by_id[c.grantId]
                c.reason = reason_by_id[c.grantId]
                c.llmApproved = True

        return candidates

    except Exception as e:
        logger.error(f"LLM explain step failed (non-fatal): {e}")
        return candidates


# Backwards-compatible shim: old call sites used judge_and_rerank as a hard filter.
# It now delegates to explain_candidates and never drops anyone.
def judge_and_rerank(
    profile: UserProfile,
    query_text: str,
    candidates: list[RecommendationItem],
    top_k: int,
) -> list[RecommendationItem]:
    annotated = explain_candidates(profile, query_text, candidates)
    return annotated[:top_k]
