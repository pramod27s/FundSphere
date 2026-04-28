import json
import logging
from openai import OpenAI
from .config import settings
from .schemas import UserProfile, RecommendationItem

logger = logging.getLogger("rag.llm_judge")

def judge_and_rerank(profile: UserProfile, query_text: str, candidates: list[RecommendationItem], top_k: int) -> list[RecommendationItem]:
    if not settings.enable_llm_judge or not settings.groq_api_key_llm_judge:
        logger.warning("LLM Judge is disabled or GROQ_API_KEY_LLM_JUDGE is missing, skipping.")
        return candidates[:top_k]

    if not candidates:
        return []

    try:
        client = OpenAI(
            api_key=settings.groq_api_key_llm_judge,
            base_url="https://api.groq.com/openai/v1"
        )

        # Build prompt
        profile_str = f"Country: {profile.country}\nInstitution: {profile.institutionType}\nApplicant: {profile.applicantType}\nBio: {profile.researchBio}\nInterests: {', '.join(profile.researchInterests)}\nKeywords: {', '.join(profile.keywords)}"
        
        candidates_str = ""
        for i, c in enumerate(candidates):
            fields = c.fields
            candidates_str += f"--- Candidate {i} ---\n"
            candidates_str += f"Grant ID: {c.grantId}\n"
            candidates_str += f"Title: {c.title}\n"
            candidates_str += f"Agency: {c.fundingAgency}\n"
            candidates_str += f"Fields: {', '.join(fields.get('field', []))}\n"
            candidates_str += f"Countries: {', '.join(fields.get('eligible_countries', []))}\n"
            candidates_str += f"Applicants: {', '.join(fields.get('eligible_applicants', []))}\n"
            candidates_str += f"Funding Min: {fields.get('funding_amount_min')}, Max: {fields.get('funding_amount_max')}\n"
            candidates_str += f"Deadline: {fields.get('application_deadline')}\n"
            candidates_str += f"Current Reason: {c.reason}\n\n"

        prompt = f"""
You are an expert grant evaluator. Review the following user profile and a list of candidate grants.
Discard grants where the user clearly violates eligibility.
Rank the remaining grants from best to worst match.
Write a 1-2 sentence explanation for each match.

User Profile:
{profile_str}

Candidate Grants:
{candidates_str}

Return ONLY a JSON object with a single key "judgments" containing an array of objects with these keys:
- grantId (integer, must match the input grantId)
- llmApproved (boolean)
- llmReason (string, 1-2 sentence explanation)

Example JSON structure:
{{
  "judgments": [
    {{
      "grantId": 123,
      "llmApproved": true,
      "llmReason": "User has a background in AI which aligns perfectly."
    }}
  ]
}}

The array must be ordered from best match to worst match. Do not include any markdown formatting or explanations outside the JSON.
"""

        response = client.chat.completions.create(
            model=settings.llm_judge_model,
            messages=[
                {"role": "system", "content": "You are a helpful grant evaluator. Output ONLY JSON."},
                {"role": "user", "content": prompt}
            ]
        )
        text = response.choices[0].message.content.strip()

        if text.startswith("```json"):
            text = text[7:-3].strip()
        elif text.startswith("```"):
            text = text[3:-3].strip()
            
        parsed_json = json.loads(text)
        judgments = parsed_json.get("judgments", []) if isinstance(parsed_json, dict) else parsed_json

        # Merge judgments back into candidates
        approved_candidates = []
        
        # Iterate over the judgments to preserve LLM's ranking
        for j in judgments:
            grant_id = j.get("grantId")
            approved = j.get("llmApproved", True)
            reason = j.get("llmReason", "")
            
            if not approved:
                continue
                
            # Find the candidate object
            candidate = next((c for c in candidates if c.grantId == grant_id), None)
            if candidate:
                candidate.llmApproved = approved
                candidate.llmReason = reason
                candidate.reason = reason
                approved_candidates.append(candidate)
                
        if not approved_candidates and candidates:
            logger.warning("LLM judge filtered out ALL candidates.")
            
        return approved_candidates[:top_k]

    except Exception as e:
        logger.error(f"Error during LLM judge: {e}")
        return candidates[:top_k]
