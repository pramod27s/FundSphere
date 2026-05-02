"""
HyDE — Hypothetical Document Embedding.

Idea: user queries and grant documents live in different semantic spaces. A
researcher writes "GIS for flood mapping in rural areas"; a real grant calls
itself "Geospatial Information Systems Capacity Building for Disaster Risk
Reduction in Underserved Communities". They mean the same thing — but their
embeddings are far apart.

Fix: ask an LLM to *write a hypothetical grant* that would perfectly fit the
user's need. Embed THAT instead of (or alongside) the raw query. The
hypothetical doc lives in the same semantic space as real grants → much
better retrieval.

This module is opt-in via `ENABLE_HYDE`. It uses its own Groq API key
(`GROQ_API_KEY_HYDE`) so you can isolate token usage. Falls back to the
query-expansion key, then to the judge key if not set, so existing setups
don't break.
"""

import json
import logging
from functools import lru_cache
from typing import Optional

from openai import OpenAI

from .config import settings
from .schemas import UserProfile

logger = logging.getLogger("rag.hyde")

_HYDE_SYSTEM_PROMPT = """You are an expert grant writer who has read thousands of real research funding announcements.

Given a researcher's profile and what they're looking for, write a SHORT hypothetical grant announcement that would be a perfect match. Do not invent funding agencies, dollar amounts, or deadlines — those will be looked up separately.

Focus entirely on the *language and terminology a real grant call would use* for this work: the program objectives, the kind of research it funds, eligible activities, target outcomes.

Write in the natural style of a real grant solicitation (Request for Proposals / Funding Opportunity Announcement). 3 to 5 sentences. No bullet points, no markdown, no preamble — just the announcement text.
"""


def _resolve_api_key() -> str:
    """Pick the most-specific Groq key configured. HyDE → query-expansion → judge."""
    return (
        settings.groq_api_key_hyde
        or settings.groq_api_key_query_expansion
        or settings.groq_api_key_llm_judge
        or ""
    )


def _build_user_prompt(profile: UserProfile, user_query: str) -> str:
    bits = []
    if profile.researchInterests:
        bits.append("Research focus: " + ", ".join(profile.researchInterests))
    if profile.keywords:
        bits.append("Keywords: " + ", ".join(profile.keywords))
    if profile.country:
        bits.append(f"Country: {profile.country}")
    if profile.applicantType:
        bits.append(f"Applicant type: {profile.applicantType}")
    if profile.institutionType:
        bits.append(f"Institution: {profile.institutionType}")
    if profile.careerStage:
        bits.append(f"Career stage: {profile.careerStage}")

    profile_block = "\n".join(f"- {b}" for b in bits) if bits else "- (no profile detail provided)"

    return (
        f"Researcher profile:\n{profile_block}\n\n"
        f"What they're looking for right now:\n{user_query.strip()}\n\n"
        "Write the hypothetical grant announcement now."
    )


@lru_cache(maxsize=512)
def _generate_cached(api_key: str, model: str, user_prompt: str, temperature: float) -> str:
    """Pure-function cache: same inputs → same hypothetical doc.
    Cache key includes api_key/model so a key rotation invalidates entries."""
    client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
    completion = client.chat.completions.create(
        model=model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": _HYDE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    )
    text = (completion.choices[0].message.content or "").strip()
    return text


def generate_hypothetical_grant(profile: UserProfile, user_query: Optional[str]) -> Optional[str]:
    """Public entry point. Returns the hypothetical grant text, or None if
    HyDE is disabled, no query, no key, or the LLM call fails (graceful
    degradation — the recommender just falls back to the raw query).
    """
    if not settings.enable_hyde:
        return None

    q = (user_query or "").strip()
    if not q:
        return None

    api_key = _resolve_api_key()
    if not api_key:
        logger.warning("HyDE enabled but no Groq API key found; skipping.")
        return None

    user_prompt = _build_user_prompt(profile, q)

    try:
        text = _generate_cached(api_key, settings.hyde_model, user_prompt, settings.hyde_temperature)
    except Exception as exc:
        logger.warning(f"HyDE generation failed (non-fatal): {exc}")
        return None

    if not text:
        return None

    # Defensive: some models like to wrap in JSON or markdown despite the prompt.
    text = text.strip("` \n")
    if text.startswith("{") and text.endswith("}"):
        try:
            obj = json.loads(text)
            for k in ("text", "announcement", "grant", "content"):
                if k in obj:
                    text = str(obj[k]).strip()
                    break
        except Exception:
            pass

    logger.debug(f"HyDE generated ({len(text)} chars): {text[:120]}…")
    return text
