"""LLM gateway: every JSON-producing AI call goes through `generate_json`.

What it adds on top of a plain SDK call:
  * Fallback chain: PROPOSAL_GEMINI_MODEL, then each model in
    PROPOSAL_GEMINI_FALLBACK_MODEL (comma-separated; a different Gemini model
    has its own quota), then Groq as a last resort when the prompt fits its
    tokens-per-minute limit.
  * Circuit breaker: after a 429 a model is skipped until its retryDelay passes,
    so parallel calls don't each waste a round-trip on an exhausted model.
  * Retries with backoff for 503 "high demand" errors and malformed JSON.
  * A concurrency limit (LLM_MAX_CONCURRENCY, default 3) so a review never
    fires a burst of requests that trips the per-minute limit.
  * Per-task "thinking" limits (thinking tokens are billed as output): a token
    budget for Gemini 2.5 models, the matching thinking level for Gemini 3.
  * Token accounting: wrap a unit of work in `with track_usage() as usage:`
    and every call inside it, including calls in child asyncio tasks, is
    recorded with its task name, model and token counts.
"""
from __future__ import annotations

import asyncio
import contextlib
import contextvars
import json
import logging
import os
import re
import time
import weakref
from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, List, Optional, Tuple

logger = logging.getLogger("llm.gateway")

_DEFAULT_MODEL = os.getenv("PROPOSAL_GEMINI_MODEL", "gemini-2.5-flash")
_FALLBACK_MODELS = [m.strip() for m in os.getenv("PROPOSAL_GEMINI_FALLBACK_MODEL", "").split(",") if m.strip()]
_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

_GROQ_API_KEY = os.getenv("GROQ_API_KEY_PROPOSAL") or os.getenv("GROQ_API_KEY")
_GROQ_MODEL = os.getenv("PROPOSAL_GROQ_MODEL", "qwen/qwen3.8-27b")
_GROQ_BASE_URL = "https://api.groq.com/openai/v1"
# Tokens-per-minute budget of the Groq model. If input + output would exceed
# it the call is skipped instead of eating a guaranteed 413.
_GROQ_TPM_LIMIT = int(os.getenv("PROPOSAL_GROQ_TPM_LIMIT", "8000"))
# Groq rejects max_tokens above the model's own ceiling.
_GROQ_MAX_OUTPUT_TOKENS = int(os.getenv("PROPOSAL_GROQ_MAX_OUTPUT_TOKENS", "8192"))
_GROQ_OVERHEAD_TOKENS = 80

_MAX_CONCURRENCY = max(1, int(os.getenv("LLM_MAX_CONCURRENCY", "3")))
_MAX_TRANSIENT_RETRIES = 4
_BACKOFF_BASE_SECONDS = 1.0

_client = None
_groq_client = None


# ---------------------------------------------------------------------------
# Token accounting
# ---------------------------------------------------------------------------

@dataclass
class CallRecord:
    task: str
    model: str
    input_tokens: int
    output_tokens: int
    thinking_tokens: int
    seconds: float


@dataclass
class UsageTracker:
    calls: List[CallRecord] = field(default_factory=list)
    failed_calls: int = 0
    parent: Optional["UsageTracker"] = None

    def add(self, record: CallRecord) -> None:
        tracker: Optional[UsageTracker] = self
        while tracker is not None:
            tracker.calls.append(record)
            tracker = tracker.parent

    def add_failure(self) -> None:
        tracker: Optional[UsageTracker] = self
        while tracker is not None:
            tracker.failed_calls += 1
            tracker = tracker.parent

    @property
    def input_tokens(self) -> int:
        return sum(c.input_tokens for c in self.calls)

    @property
    def output_tokens(self) -> int:
        """Visible output plus thinking (both are billed as output)."""
        return sum(c.output_tokens + c.thinking_tokens for c in self.calls)

    def summary(self) -> Dict[str, Any]:
        by_task: Dict[str, Dict[str, int]] = {}
        for c in self.calls:
            t = by_task.setdefault(c.task, {"calls": 0, "input_tokens": 0, "output_tokens": 0})
            t["calls"] += 1
            t["input_tokens"] += c.input_tokens
            t["output_tokens"] += c.output_tokens + c.thinking_tokens
        return {
            "calls": len(self.calls),
            "failed_calls": self.failed_calls,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "models": sorted({c.model for c in self.calls}),
            "by_task": by_task,
        }


_current_tracker: contextvars.ContextVar[Optional[UsageTracker]] = contextvars.ContextVar(
    "llm_usage_tracker", default=None
)


@contextlib.contextmanager
def track_usage() -> Iterator[UsageTracker]:
    """Record every LLM call made inside this block (and its asyncio tasks).
    Calls are also counted in any enclosing tracker."""
    tracker = UsageTracker(parent=_current_tracker.get())
    token = _current_tracker.set(tracker)
    try:
        yield tracker
    finally:
        _current_tracker.reset(token)


def _record(task: str, model: str, usage: Tuple[int, int, int], seconds: float) -> None:
    in_tok, out_tok, think_tok = usage
    logger.info("LLM call task=%s model=%s in=%d out=%d thinking=%d %.1fs",
                task, model, in_tok, out_tok, think_tok, seconds)
    tracker = _current_tracker.get()
    if tracker is not None:
        tracker.add(CallRecord(task, model, in_tok, out_tok, think_tok, seconds))


def _record_failure() -> None:
    tracker = _current_tracker.get()
    if tracker is not None:
        tracker.add_failure()


# ---------------------------------------------------------------------------
# Concurrency limit (one semaphore per event loop)
# ---------------------------------------------------------------------------

_semaphores: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore]" = weakref.WeakKeyDictionary()


def _limiter() -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    sem = _semaphores.get(loop)
    if sem is None:
        sem = asyncio.Semaphore(_MAX_CONCURRENCY)
        _semaphores[loop] = sem
    return sem


# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------

def _get_client():
    global _client
    if _client is not None:
        return _client
    if not _API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set. Add it to ai-service/.env")
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


def _generate_gemini_sync(
    prompt: str,
    *,
    model: str,
    temperature: float,
    max_output_tokens: int,
    thinking_budget: Optional[int],
) -> Tuple[str, Tuple[int, int, int]]:
    from google.genai import types

    config_args: Dict[str, Any] = dict(
        temperature=temperature,
        max_output_tokens=max_output_tokens,
        response_mime_type="application/json",
    )
    # Gemini 2.5 takes a token budget for thinking; Gemini 3 takes a level.
    # Without a limit, Gemini 3 Flash spent ~3x the output tokens on guidelines.
    if thinking_budget is not None and model.startswith("gemini-2.5"):
        config_args["thinking_config"] = types.ThinkingConfig(thinking_budget=thinking_budget)
    elif thinking_budget is not None and model.startswith("gemini-3"):
        level = (types.ThinkingLevel.MINIMAL if thinking_budget == 0
                 else types.ThinkingLevel.LOW if thinking_budget <= 2048 else types.ThinkingLevel.MEDIUM)
        config_args["thinking_config"] = types.ThinkingConfig(thinking_level=level)

    response = _get_client().models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(**config_args),
    )
    text = getattr(response, "text", None)
    if not text:
        for cand in getattr(response, "candidates", None) or []:
            for part in getattr(getattr(cand, "content", None), "parts", None) or []:
                if getattr(part, "text", None):
                    text = (text or "") + part.text
    if not text:
        raise RuntimeError("Gemini returned an empty response")
    meta = getattr(response, "usage_metadata", None)
    usage = (
        int(getattr(meta, "prompt_token_count", 0) or 0),
        int(getattr(meta, "candidates_token_count", 0) or 0),
        int(getattr(meta, "thoughts_token_count", 0) or 0),
    )
    return text, usage


def _generate_groq_sync(
    prompt: str,
    *,
    temperature: float,
    max_output_tokens: int,
) -> Tuple[str, Tuple[int, int, int]]:
    client = _get_groq_client()
    if client is None:
        raise RuntimeError("Groq fallback unavailable: GROQ_API_KEY_PROPOSAL not set")
    completion = client.chat.completions.create(
        model=_GROQ_MODEL,
        temperature=temperature,
        max_tokens=min(max_output_tokens, _GROQ_MAX_OUTPUT_TOKENS),
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": "You are a JSON-only assistant. Respond with valid JSON matching the user's requested schema. No markdown, no commentary."},
            {"role": "user", "content": prompt},
        ],
    )
    text = (completion.choices[0].message.content or "").strip()
    if not text:
        raise RuntimeError("Groq returned an empty response")
    usage = getattr(completion, "usage", None)
    return text, (
        int(getattr(usage, "prompt_tokens", 0) or 0),
        int(getattr(usage, "completion_tokens", 0) or 0),
        0,
    )


# ---------------------------------------------------------------------------
# Error classification and the Gemini circuit breaker
# ---------------------------------------------------------------------------

def _is_quota_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "429" in text or "resource_exhausted" in text or "quota" in text


def _is_transient_error(exc: Exception) -> bool:
    """503/504/timeout: Gemini reports these as 'high demand'; retrying helps."""
    text = str(exc).lower()
    return any(s in text for s in ("503", "504", "unavailable", "timeout", "deadline"))


_DEFAULT_COOLDOWN_SECONDS = 60.0
# Google sometimes suggests retry delays of hours for daily quotas; capping
# keeps the breaker self-healing if the quota refills sooner.
_MAX_COOLDOWN_SECONDS = 900.0
_cooldown_until: Dict[str, float] = {}


def _parse_retry_delay_seconds(exc: Exception) -> float:
    m = re.search(r"retryDelay['\"]?\s*:\s*['\"]?(\d+(?:\.\d+)?)s", str(exc))
    try:
        return float(m.group(1)) if m else _DEFAULT_COOLDOWN_SECONDS
    except ValueError:
        return _DEFAULT_COOLDOWN_SECONDS


def _set_cooldown(model: str, exc: Exception) -> None:
    delay = min(_parse_retry_delay_seconds(exc), _MAX_COOLDOWN_SECONDS)
    _cooldown_until[model] = time.time() + delay
    logger.warning("Circuit breaker OPEN for %s: skipping it for %.0fs.", model, delay)


def _is_in_cooldown(model: str) -> bool:
    until = _cooldown_until.get(model)
    if until is None:
        return False
    if time.time() >= until:
        _cooldown_until.pop(model, None)
        logger.info("Circuit breaker CLOSED for %s.", model)
        return False
    return True


def estimate_tokens(text: str) -> int:
    """~4 characters per token, rounded up (no tokenizer dependency)."""
    return (len(text) + 3) // 4


# ---------------------------------------------------------------------------
# JSON parsing
# ---------------------------------------------------------------------------

def _strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        if text.endswith("```"):
            text = text[:-3]
    return text.strip()


def coerce_json(text: str) -> Any:
    """Parse LLM output as JSON: strict, then brace-trimmed, then json-repair."""
    text = _strip_code_fence(text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    first = min((i for i in (text.find("{"), text.find("[")) if i != -1), default=-1)
    if first == -1:
        raise ValueError(f"LLM did not return JSON: {text[:200]}")
    last = max(text.rfind("}"), text.rfind("]"))
    if last <= first:
        raise ValueError(f"LLM JSON was truncated: {text[:200]}")

    snippet = text[first : last + 1]
    try:
        return json.loads(snippet)
    except json.JSONDecodeError as strict_err:
        try:
            from json_repair import repair_json
        except ImportError:
            raise strict_err
        try:
            repaired = repair_json(snippet, return_objects=True)
        except Exception:
            raise strict_err
        if repaired in ("", None):
            raise strict_err
        logger.info("Recovered malformed JSON via json-repair (%d chars).", len(snippet))
        return repaired


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

class LLMUnavailableError(RuntimeError):
    """Every provider failed or was skipped. The message says why."""


async def generate_json(
    prompt: str,
    *,
    task: str = "general",
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_output_tokens: int = 8192,
    retries: int = 1,
    thinking_budget: Optional[int] = None,
) -> Any:
    """Send `prompt` and return the parsed JSON response.

    `task` names the call in logs and usage reports. `thinking_budget` caps
    Gemini 2.5 thinking tokens (0 turns thinking off).
    """
    candidates = [model or _DEFAULT_MODEL]
    candidates += [m for m in _FALLBACK_MODELS if m not in candidates]

    last_error: Optional[Exception] = None
    saw_quota_error = False

    for used_model in candidates:
        if _is_in_cooldown(used_model):
            saw_quota_error = True
            logger.info("Skipping %s: in quota cooldown.", used_model)
            continue

        attempt, max_attempts = 0, retries + 1
        while attempt < max_attempts:
            effective_prompt = prompt if attempt == 0 else prompt + "\n\nReturn ONLY valid JSON. No markdown, no commentary."
            started = time.time()
            try:
                async with _limiter():
                    text, usage = await asyncio.to_thread(
                        _generate_gemini_sync,
                        effective_prompt,
                        model=used_model,
                        temperature=temperature,
                        max_output_tokens=max_output_tokens,
                        thinking_budget=thinking_budget,
                    )
                _record(task, used_model, usage, time.time() - started)
                return coerce_json(text)
            except Exception as exc:
                last_error = exc
                _record_failure()
                logger.warning("Gemini call failed (task=%s, model=%s, attempt %d/%d): %s",
                               task, used_model, attempt + 1, max_attempts, str(exc)[:300])
                if _is_quota_error(exc):
                    saw_quota_error = True
                    _set_cooldown(used_model, exc)
                    break
                if _is_transient_error(exc):
                    max_attempts = max(max_attempts, _MAX_TRANSIENT_RETRIES)
                    if attempt + 1 < max_attempts:
                        await asyncio.sleep(_BACKOFF_BASE_SECONDS * (2 ** attempt))
                attempt += 1

    # Every Gemini model failed: try Groq if the prompt fits its limit.
    groq_skipped = None
    if _GROQ_API_KEY:
        projected = estimate_tokens(prompt) + _GROQ_OVERHEAD_TOKENS + min(max_output_tokens, _GROQ_MAX_OUTPUT_TOKENS)
        if projected > _GROQ_TPM_LIMIT:
            groq_skipped = f"prompt too large for Groq ({projected} > {_GROQ_TPM_LIMIT} tokens/min)"
            logger.warning("Skipping Groq fallback: %s", groq_skipped)
        else:
            for attempt in range(retries + 1):
                started = time.time()
                try:
                    async with _limiter():
                        text, usage = await asyncio.to_thread(
                            _generate_groq_sync,
                            prompt if attempt == 0 else prompt + "\n\nReturn ONLY valid JSON.",
                            temperature=temperature,
                            max_output_tokens=max_output_tokens,
                        )
                    _record(task, f"groq:{_GROQ_MODEL}", usage, time.time() - started)
                    return coerce_json(text)
                except Exception as exc:
                    last_error = exc
                    _record_failure()
                    logger.warning("Groq fallback failed (task=%s, attempt %d): %s", task, attempt + 1, str(exc)[:300])

    reason = "quota exhausted" if saw_quota_error else "providers unavailable"
    if groq_skipped:
        reason += f"; Groq skipped: {groq_skipped}"
    raise LLMUnavailableError(f"LLM generation failed ({reason}). Last error: {last_error}")
