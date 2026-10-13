import json
import logging
from openai import OpenAI
from .config import settings
from .schemas import UserProfile, RecommendationItem

logger = logging.getLogger("rag.llm_judge")

FIT_LABELS = ("strong", "partial", "weak")


def explain_candidates(
    profile: UserProfile,
    query_text: str,
    candidates: list[RecommendationItem],
) -> list[RecommendationItem]:
    """
    Annotate each candidate with an LLM-written fit rating (strong / partial /
    weak, in llmFit) and an explanation. Never removes or reorders candidates —
    the deterministic pipeline already chose them. The rating is there so a
    poor match is described as one instead of being talked up. If the LLM
    fails, candidates are returned unchanged.
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
            candidates_str += f"Deadline: {fields.get('application_deadline')}\n"

            # Enriched parent context for high-precision rationale
            obj = fields.get("objectives")
            if obj:
                candidates_str += f"Objectives: {str(obj)[:300]}\n"
            elig = fields.get("eligibility_criteria")
            if elig:
                candidates_str += f"Eligibility Guidelines: {str(elig)[:300]}\n"
            scope = fields.get("funding_scope")
            if scope:
                candidates_str += f"Funding Scope: {str(scope)[:250]}\n"
            chunk = fields.get("chunk_text")
            if chunk and not obj and not elig:
                candidates_str += f"Overview: {str(chunk)[:300]}\n"
            candidates_str += "\n"

        prompt = f"""You are a grant-matching assistant. For each candidate grant, rate how well it fits this researcher and explain the rating in 1-2 concrete sentences (research overlap, eligibility, funding range, deadline).

Ratings:
- "strong": the grant's topic matches the researcher's work and nothing in it rules them out.
- "partial": a broad or neighbouring scheme that could fund this work but isn't about it.
- "weak": the grant's topic doesn't match the researcher's work.

Be honest. Never invent a link the grant text doesn't support; if the fit is weak, say plainly why. Every candidate gets a rating; none is removed.

User Profile:
{profile_str}

User Query: {query_text}

Candidate Grants:
{candidates_str}

Return ONLY a JSON object with key "explanations" — an array of objects with:
- grantId (integer, must match input)
- fit ("strong", "partial" or "weak")
- reason (string, 1-2 sentences)

Example: {{"explanations": [{{"grantId": 123, "fit": "strong", "reason": "Your AI research aligns with the program's focus areas, and your country is eligible."}}, {{"grantId": 456, "fit": "weak", "reason": "This scheme funds marine biology, which is unrelated to your AI work."}}]}}
"""

        response = client.chat.completions.create(
            model=settings.llm_judge_model,
            messages=[
                {"role": "system", "content": "You rate and explain grant matches honestly. Output ONLY JSON."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
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
        fit_by_id = {}
        for item in explanations:
            gid = item.get("grantId")
            reason = (item.get("reason") or "").strip()
            if gid is not None and reason:
                reason_by_id[int(gid)] = reason
                fit = str(item.get("fit") or "").strip().lower()
                if fit in FIT_LABELS:
                    fit_by_id[int(gid)] = fit

        for c in candidates:
            if c.grantId in reason_by_id:
                c.llmReason = reason_by_id[c.grantId]
                c.reason = reason_by_id[c.grantId]
                c.llmFit = fit_by_id.get(c.grantId)
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
