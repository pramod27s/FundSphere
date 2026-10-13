import json
import logging
from openai import OpenAI
from .config import settings
from .profile_builder import eligibility_lines, topic_lines
from .schemas import UserProfile

logger = logging.getLogger("rag.query_expander")

def expand_queries(profile: UserProfile, user_query: str | None) -> list[str]:
    """Up to 3 LLM rewrites of the profile and query, or [] when expansion
    can't run. Only the rewrites: the recommender searches the original
    query alongside them, since a rewrite can drift from what was asked."""
    if not settings.groq_api_key_query_expansion:
        logger.warning("GROQ_API_KEY_QUERY_EXPANSION is missing, searching without expansion.")
        return []

    try:
        client = OpenAI(
            api_key=settings.groq_api_key_query_expansion,
            base_url="https://api.groq.com/openai/v1"
        )

        # Build prompt
        # Topic only, like the search text (see profile_builder.eligibility_lines).
        profile_str = "\n".join(topic_lines(profile) + eligibility_lines(profile)) or "(no profile detail provided)"
        
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

        if isinstance(queries, list):
            queries = [q.strip() for q in queries if isinstance(q, str) and q.strip()]
        if queries:
            logger.info(f"Successfully expanded into {len(queries)} queries.")
            return queries
        logger.warning(f"Unexpected response format from query expander, searching without expansion. Response: {text}")
        return []

    except Exception as e:
        logger.error(f"Error during query expansion: {e}")
        return []
