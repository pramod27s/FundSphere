import json
import logging
from openai import OpenAI
from .config import settings
from .schemas import UserProfile
from .profile_builder import build_user_query_text

logger = logging.getLogger("rag.query_expander")

def expand_queries(profile: UserProfile, user_query: str | None) -> list[str]:
    fallback = [build_user_query_text(profile, user_query)]
    
    if not settings.groq_api_key_query_expansion:
        logger.warning("GROQ_API_KEY_QUERY_EXPANSION is missing, falling back to basic query.")
        return fallback

    try:
        client = OpenAI(
            api_key=settings.groq_api_key_query_expansion,
            base_url="https://api.groq.com/openai/v1"
        )

        # Build prompt
        profile_str = f"Country: {profile.country}\nInstitution: {profile.institutionType}\nApplicant: {profile.applicantType}\nBio: {profile.researchBio}\nInterests: {', '.join(profile.researchInterests)}\nKeywords: {', '.join(profile.keywords)}"
        
        prompt = f"""
You are an expert grant researcher. Given the following user profile and an optional user query, generate exactly 3 distinct search queries to find relevant grants.

User Profile:
{profile_str}

User Query: {user_query or 'None'}

Generate exactly 3 queries:
1. Query A — Broad Conceptual: The researcher's overall domain and interests in natural language.
2. Query B — Specific Technical: Exact methodologies, techniques, acronyms, and niche topics.
3. Query C — Synonym-Expanded: Key terms rewritten with alternate vocabulary, abbreviations, and related concepts that grant agencies typically use.

Return ONLY a JSON object with a single key "queries" containing a list of 3 strings. Do not include markdown formatting or explanations.
Example: {{"queries": ["query A", "query B", "query C"]}}
"""

        response = client.chat.completions.create(
            model=settings.query_expansion_model,
            messages=[
                {"role": "system", "content": "You are a helpful grant researcher. Output ONLY JSON."},
                {"role": "user", "content": prompt}
            ]
        )

        text = response.choices[0].message.content.strip()

        # Handle possible markdown formatting
        if text.startswith("```json"):
            text = text[7:-3].strip()
        elif text.startswith("```"):
            text = text[3:-3].strip()
            
        parsed_json = json.loads(text)
        queries = parsed_json.get("queries", []) if isinstance(parsed_json, dict) else parsed_json

        if isinstance(queries, list) and len(queries) >= 1:
            logger.info(f"Successfully expanded into {len(queries)} queries.")
            return queries
        else:
            logger.warning(f"Unexpected response format from query expander, returning fallback. Response: {text}")
            return fallback

    except Exception as e:
        logger.error(f"Error during query expansion: {e}")
        return fallback
