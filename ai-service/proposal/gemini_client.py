"""Thin async wrapper around the Gemini 2.5 Pro JSON-output API.

Keeps the rest of the proposal module decoupled from the SDK so we can
swap models without touching the prompts. Uses google-genai (already a
dependency in requirements.txt). Falls back to a synchronous call wrapped
in `asyncio.to_thread` because the SDK's async client is still in flux.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any

logger = logging.getLogger("proposal.gemini_client")

_DEFAULT_MODEL = os.getenv("PROPOSAL_GEMINI_MODEL", "gemini-2.5-pro")
_FALLBACK_MODEL = os.getenv("PROPOSAL_GEMINI_FALLBACK_MODEL", "gemini-2.5-flash")
_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "AIzaSyC7-g3xrWm4XHk6NEYUCmbDfW-mLQJ-lEQ"

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    from google import genai  # imported lazily so the module imports even if unconfigured
    _client = genai.Client(api_key=_API_KEY)
    return _client


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        if text.endswith("```"):
            text = text[:-3]
    return text.strip()


def _coerce_json(text: str) -> Any:
    """Best-effort JSON parsing for LLM output.

    The Gemini JSON mode is reliable but not perfect — we still defend
    against stray backticks, leading prose, or trailing notes.
    """
    text = _strip_code_fence(text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    first_brace = min(
        (i for i in (text.find("{"), text.find("[")) if i != -1),
        default=-1,
    )
    if first_brace == -1:
        raise ValueError(f"LLM did not return JSON: {text[:200]}")

    last_brace = max(text.rfind("}"), text.rfind("]"))
    if last_brace <= first_brace:
        raise ValueError(f"LLM JSON was truncated: {text[:200]}")

    snippet = text[first_brace : last_brace + 1]
    return json.loads(snippet)


def _generate_sync(
    prompt: str,
    *,
    model: str,
    temperature: float,
    max_output_tokens: int,
) -> str:
    from google.genai import types

    client = _get_client()
    config = types.GenerateContentConfig(
        temperature=temperature,
        max_output_tokens=max_output_tokens,
        response_mime_type="application/json",
    )
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=config,
    )
    text = getattr(response, "text", None)
    if not text:
        candidates = getattr(response, "candidates", None) or []
        for cand in candidates:
            content = getattr(cand, "content", None)
            parts = getattr(content, "parts", None) or []
            for part in parts:
                t = getattr(part, "text", None)
                if t:
                    text = (text or "") + t
    if not text:
        raise RuntimeError("Gemini returned an empty response")
    return text


def _is_quota_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "429" in text or "resource_exhausted" in text or "quota" in text


async def generate_json(
    prompt: str,
    *,
    model: str | None = None,
    temperature: float = 0.2,
    max_output_tokens: int = 8192,
    retries: int = 1,
) -> Any:
    """Send `prompt` to Gemini and parse the response as JSON.

    Tries the primary model first; on 429/quota errors transparently
    falls back to `_FALLBACK_MODEL` (gemini-2.5-flash by default) so a
    free-tier daily limit on Pro doesn't break the feature. Retries once
    on parse failure with a stricter reminder appended.
    """
    primary = model or _DEFAULT_MODEL
    candidates = [primary]
    if _FALLBACK_MODEL and _FALLBACK_MODEL != primary:
        candidates.append(_FALLBACK_MODEL)

    last_error: Exception | None = None

    for used_model in candidates:
        for attempt in range(retries + 1):
            effective_prompt = (
                prompt
                if attempt == 0
                else prompt + "\n\nReturn ONLY valid JSON. No markdown, no commentary."
            )
            try:
                raw = await asyncio.to_thread(
                    _generate_sync,
                    effective_prompt,
                    model=used_model,
                    temperature=temperature,
                    max_output_tokens=max_output_tokens,
                )
                return _coerce_json(raw)
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Gemini call failed (model=%s, attempt %d/%d): %s",
                    used_model, attempt + 1, retries + 1, exc,
                )
                # If the primary model is quota-limited, skip its retries and
                # jump straight to the fallback model.
                if _is_quota_error(exc):
                    logger.info("Quota error on %s — switching to fallback model.", used_model)
                    break

    raise RuntimeError(f"Gemini generation failed: {last_error}")
