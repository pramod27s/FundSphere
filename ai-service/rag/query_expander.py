import json
import logging
from google import genai
from .config import settings
from .schemas import UserProfile
from .profile_builder import build_user_query_text

logger = logging.getLogger("rag.query_expander")

def expand_queries(profile: UserProfile, user_query: str | None) -> list[str]:
    fallback = [build_user_query_text(profile, user_query)]
    
    if not settings.gemini_api_key_query_expansion:
        logger.warning("GEMINI_API_KEY_QUERY_EXPANSION is missing, falling back to basic query.")
        return fallback

    try:
        client = genai.Client(api_key=settings.gemini_api_key_query_expansion)
        
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

Return ONLY a JSON list of 3 strings. Do not include markdown formatting or explanations.
Example: ["query A", "query B", "query C"]
"""

        response = client.models.generate_content(
            model=settings.query_expansion_model,
            contents=prompt
        )
        text = response.text.strip()
        
        # Handle possible markdown formatting from Gemini
        if text.startswith("```json"):
            text = text[7:-3].strip()
        elif text.startswith("```"):
            text = text[3:-3].strip()
            
        queries = json.loads(text)
        
        if isinstance(queries, list) and len(queries) >= 1:
            logger.info(f"Successfully expanded into {len(queries)} queries.")
            return queries
        else:
            logger.warning(f"Unexpected response format from query expander, returning fallback. Response: {text}")
            return fallback

    except Exception as e:
        logger.error(f"Error during query expansion: {e}")
        return fallback
