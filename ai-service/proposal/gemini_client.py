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

_DEFAULT_MODEL = os.getenv("PROPOSAL_GEMINI_MODEL", "gemini-2.5-flash")
_FALLBACK_MODEL = os.getenv("PROPOSAL_GEMINI_FALLBACK_MODEL", "")
_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "AIzaSyC7-g3xrWm4XHk6NEYUCmbDfW-mLQJ-lEQ"

_GROQ_API_KEY = os.getenv("GROQ_API_KEY_PROPOSAL") or os.getenv("GROQ_API_KEY")
_GROQ_MODEL = os.getenv("PROPOSAL_GROQ_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
_GROQ_BASE_URL = "https://api.groq.com/openai/v1"
# Per-minute token budget for the Groq fallback model. If input+output
# would exceed this we skip the call entirely rather than eating the
# round-trip on a guaranteed 413. Tune via PROPOSAL_GROQ_TPM_LIMIT — the
# default (30000) matches `meta-llama/llama-4-scout-17b-16e-instruct`
# free-tier limits, but verify against your account at
# https://console.groq.com/settings/limits if you see pre-skip warnings.
_GROQ_TPM_LIMIT = int(os.getenv("PROPOSAL_GROQ_TPM_LIMIT", "30000"))
# Per-call output cap. Groq enforces a per-model ceiling on `max_tokens`
# independent of TPM (Llama 4 Scout = 8192). Calls asking for more than
# this 400-error before the model even runs, so we clamp callers down.
# Override via env if your model allows higher (e.g. some 70B models
# permit 32k).
_GROQ_MAX_OUTPUT_TOKENS = int(os.getenv("PROPOSAL_GROQ_MAX_OUTPUT_TOKENS", "8192"))
# System prompt + chat-format overhead we send alongside the user prompt.
# Rough constant — exact value doesn't matter for a defensive check.
_GROQ_OVERHEAD_TOKENS = 80

_client = None
_groq_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    from google import genai  # imported lazily so the module imports even if unconfigured
    _client = genai.Client(api_key=_API_KEY)
    return _client


def _get_groq_client():
    global _groq_client
    if _groq_client is not None:
        return _groq_client
    if not _GROQ_API_KEY:
        return None
    from openai import OpenAI
    _groq_client = OpenAI(api_key=_GROQ_API_KEY, base_url=_GROQ_BASE_URL)
    return _groq_client


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        if text.endswith("```"):
            text = text[:-3]
    return text.strip()


def _coerce_json(text: str) -> Any:
    """Best-effort JSON parsing for LLM output.

    Defense in depth (cheapest path first, only runs the next step if needed):
      1. Strict json.loads on the stripped text — handles clean output.
      2. Brace-trim: drop leading prose / trailing notes around the JSON body.
      3. json-repair: fix unescaped quotes/newlines, missing commas, trailing
         commas, single-quoted strings — common Gemini Flash quirks on rich
         text fields. Imported lazily so the module loads even if the package
         isn't installed yet.
    Raises ValueError only if all three fail, which then triggers the retry
    in generate_json().
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
    try:
        return json.loads(snippet)
    except json.JSONDecodeError as strict_err:
        try:
            from json_repair import repair_json
        except ImportError:
            logger.warning(
                "json-repair not installed; cannot repair malformed JSON. "
                "Run `pip install json-repair` to silence this."
            )
            raise strict_err

        try:
            repaired = repair_json(snippet, return_objects=True)
        except Exception as repair_err:
            logger.debug("json-repair also failed: %s", repair_err)
            raise strict_err

        # repair_json returns "" for unsalvageable input.
        if repaired == "" or repaired is None:
            raise strict_err

        logger.info("Recovered malformed JSON via json-repair (was %d chars).", len(snippet))
        return repaired


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


def _is_transient_error(exc: Exception) -> bool:
    """503/504/timeout — Gemini reports these as 'high demand'; retry helps."""
    text = str(exc).lower()
    return (
        "503" in text
        or "504" in text
        or "unavailable" in text
        or "timeout" in text
        or "deadline" in text
    )


# --- Gemini circuit breaker ---------------------------------------------------
# Once Gemini returns a 429, every parallel call in deep-mode would otherwise
# also waste a round-trip on Gemini before falling to Groq. The breaker remembers
# "this model is in cooldown until T" so subsequent calls skip Gemini entirely
# until the retryDelay window passes.
import time as _time  # noqa: E402

_DEFAULT_COOLDOWN_SECONDS = 60.0
# Maximum cooldown we'll respect — Google sometimes returns retryDelays of hours
# or days for free-tier daily quotas; capping at 15 min keeps the breaker
# self-healing in case the actual quota refilled sooner (e.g. paid tier kicks in).
_MAX_COOLDOWN_SECONDS = 900.0
_gemini_cooldown_until: dict[str, float] = {}


def _parse_retry_delay_seconds(exc: Exception) -> float:
    """Extract Google's suggested retryDelay (e.g. 'retryDelay': '26s')."""
    m = re.search(r"retryDelay['\"]?\s*:\s*['\"]?(\d+(?:\.\d+)?)s", str(exc))
    if not m:
        return _DEFAULT_COOLDOWN_SECONDS
    try:
        return float(m.group(1))
    except ValueError:
        return _DEFAULT_COOLDOWN_SECONDS


def _set_cooldown(model: str, exc: Exception) -> None:
    delay = min(_parse_retry_delay_seconds(exc), _MAX_COOLDOWN_SECONDS)
    _gemini_cooldown_until[model] = _time.time() + delay
    logger.warning(
        "Gemini circuit breaker OPEN for %s — skipping for %.0fs (until quota resets).",
        model, delay,
    )


def _is_in_cooldown(model: str) -> bool:
    until = _gemini_cooldown_until.get(model)
    if until is None:
        return False
    if _time.time() >= until:
        _gemini_cooldown_until.pop(model, None)
        logger.info("Gemini circuit breaker CLOSED for %s — retrying.", model)
        return False
    return True


def _estimate_tokens(text: str) -> int:
    """Cheap token estimate without pulling in tiktoken.

    ~4 chars/token is the standard rule of thumb for English; we round up
    slightly to stay on the conservative side of TPM limits.
    """
    return (len(text) + 3) // 4


def _generate_groq_sync(
    prompt: str,
    *,
    model: str,
    temperature: float,
    max_output_tokens: int,
) -> str:
    client = _get_groq_client()
    if client is None:
        raise RuntimeError("Groq fallback unavailable: GROQ_API_KEY_PROPOSAL not set")
    # Clamp to the Groq per-model output ceiling. Without this, callers
    # (e.g. section splitter requesting 16384) get a hard 400 from Groq
    # before the model runs.
    clamped_max = min(max_output_tokens, _GROQ_MAX_OUTPUT_TOKENS)
    completion = client.chat.completions.create(
        model=model,
        temperature=temperature,
        max_tokens=clamped_max,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": "You are a JSON-only assistant. Respond with valid JSON matching the user's requested schema. No markdown, no commentary.",
            },
            {"role": "user", "content": prompt},
        ],
    )
    text = (completion.choices[0].message.content or "").strip()
    if not text:
        raise RuntimeError("Groq returned an empty response")
    return text


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
    free-tier daily limit on Pro doesn't break the feature. If both
    Gemini models are quota-exhausted (or otherwise failing) and Groq
    is configured, falls through to Groq (`PROPOSAL_GROQ_MODEL`,
    e.g. `openai/gpt-oss-20b`) as a last resort. Retries once on parse
    failure with a stricter reminder appended.
    """
    primary = model or _DEFAULT_MODEL
    candidates = [primary]
    if _FALLBACK_MODEL and _FALLBACK_MODEL != primary:
        candidates.append(_FALLBACK_MODEL)

    last_error: Exception | None = None
    saw_quota_error = False

    # Allow more attempts than `retries` for transient 503s — Gemini Flash
    # frequently bounces back within 1-3s of "high demand" errors, and there's
    # no useful fallback (Groq is too small for our prompts), so it's worth
    # waiting a bit before giving up.
    _MAX_TRANSIENT_RETRIES = 4
    _BACKOFF_BASE_SECONDS = 1.0

    for used_model in candidates:
        # Circuit breaker: skip this Gemini model entirely if a recent 429 is
        # still in its retry-delay window. Saves a round-trip per parallel call.
        if _is_in_cooldown(used_model):
            saw_quota_error = True
            logger.info("Skipping %s — in quota cooldown.", used_model)
            continue

        attempt = 0
        max_attempts = retries + 1
        while attempt < max_attempts:
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
                    used_model, attempt + 1, max_attempts, exc,
                )
                if _is_quota_error(exc):
                    saw_quota_error = True
                    _set_cooldown(used_model, exc)
                    logger.info("Quota error on %s — switching to next provider/model.", used_model)
                    break
                if _is_transient_error(exc):
                    # Stretch the budget on transient errors so 1-2 hiccups
                    # don't drop us straight to the (size-blocked) Groq fallback.
                    if max_attempts < _MAX_TRANSIENT_RETRIES:
                        max_attempts = _MAX_TRANSIENT_RETRIES
                    if attempt + 1 < max_attempts:
                        delay = _BACKOFF_BASE_SECONDS * (2 ** attempt)
                        logger.info(
                            "Transient error on %s; sleeping %.1fs before retry %d/%d.",
                            used_model, delay, attempt + 2, max_attempts,
                        )
                        await asyncio.sleep(delay)
                attempt += 1

    # All Gemini candidates exhausted. Try Groq if configured.
    groq_skipped_reason: str | None = None
    if _GROQ_API_KEY:
        # Pre-check TPM budget. Groq counts input + max_output_tokens against
        # the per-minute quota; if we already know it'll 413 there's no point
        # making the round-trip. Use the clamped output cap, since that's
        # what we'll actually send.
        estimated_input = _estimate_tokens(prompt) + _GROQ_OVERHEAD_TOKENS
        effective_max_output = min(max_output_tokens, _GROQ_MAX_OUTPUT_TOKENS)
        projected_total = estimated_input + effective_max_output
        if projected_total > _GROQ_TPM_LIMIT:
            groq_skipped_reason = (
                f"prompt too large for Groq fallback "
                f"(~{estimated_input} input + {effective_max_output} output tokens "
                f"= {projected_total}, exceeds {_GROQ_TPM_LIMIT} TPM limit on {_GROQ_MODEL})"
            )
            logger.warning("Skipping Groq fallback: %s", groq_skipped_reason)
        else:
            logger.info(
                "Falling through to Groq (model=%s) after Gemini failure (quota=%s).",
                _GROQ_MODEL, saw_quota_error,
            )
            for attempt in range(retries + 1):
                effective_prompt = (
                    prompt
                    if attempt == 0
                    else prompt + "\n\nReturn ONLY valid JSON. No markdown, no commentary."
                )
                try:
                    raw = await asyncio.to_thread(
                        _generate_groq_sync,
                        effective_prompt,
                        model=_GROQ_MODEL,
                        temperature=temperature,
                        max_output_tokens=max_output_tokens,
                    )
                    return _coerce_json(raw)
                except Exception as exc:
                    last_error = exc
                    logger.warning(
                        "Groq fallback call failed (model=%s, attempt %d/%d): %s",
                        _GROQ_MODEL, attempt + 1, retries + 1, exc,
                    )

    if groq_skipped_reason:
        raise RuntimeError(
            f"LLM generation failed: Gemini exhausted (quota={saw_quota_error}) "
            f"and Groq fallback skipped — {groq_skipped_reason}. "
            f"Last Gemini error: {last_error}"
        )
    raise RuntimeError(f"LLM generation failed (Gemini + Groq exhausted): {last_error}")
