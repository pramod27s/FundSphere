"""Content-hash cache for proposal analyses.

Same inputs (proposal bytes + guidelines bytes + grant title + mode) → same
cached result, no LLM call. This makes "upload the same PDF twice" return
identical scores instantly, which is what users intuitively expect and what
the analyzer alone cannot guarantee (every step is an LLM call with non-zero
temperature, plus the section-splitter produces different canonical names
between runs).

In-memory LRU. The cache is per-process — a restart costs at most one
re-analysis per unique input. That's fine for this use case; users rarely
re-analyze the exact same PDFs across a long downtime, and we don't want
the operational complexity of Redis here.
"""
from __future__ import annotations

import copy
import hashlib
import logging
import os
from collections import OrderedDict
from typing import Any, Optional

logger = logging.getLogger("proposal.analysis_cache")

_MAX_ENTRIES = int(os.getenv("PROPOSAL_CACHE_MAX_ENTRIES", "200"))
_cache: "OrderedDict[str, dict]" = OrderedDict()


def make_key(
    proposal_bytes: bytes,
    guidelines_bytes: bytes,
    grant_title: str,
    mode: str,
) -> str:
    """Hash key over the exact inputs that determine the analysis output."""
    h = hashlib.sha256()
    h.update(proposal_bytes)
    h.update(b"\x00")  # separator so adjacent files can't be confused
    h.update(guidelines_bytes)
    h.update(b"\x00")
    h.update((grant_title or "").strip().lower().encode("utf-8"))
    h.update(b"\x00")
    h.update((mode or "simple").strip().lower().encode("utf-8"))
    return h.hexdigest()


def get(key: str) -> Optional[dict]:
    """Return a deep copy of the cached result, or None on miss.

    Deep-copying defends against any caller mutating the response (e.g. the
    diff layer in the frontend if the same dict were ever reused server-side).
    """
    entry = _cache.get(key)
    if entry is None:
        return None
    # Mark as recently used.
    _cache.move_to_end(key)
    logger.info("Analysis cache HIT (key=%s..., size=%d)", key[:12], len(_cache))
    return copy.deepcopy(entry)


def put(key: str, result: dict) -> None:
    """Store a copy of result under key, evicting the oldest if at capacity."""
    if not isinstance(result, dict):
        # Defensive: only cache plain dicts (which is what analyzer returns).
        return
    _cache[key] = copy.deepcopy(result)
    _cache.move_to_end(key)
    while len(_cache) > _MAX_ENTRIES:
        evicted_key, _ = _cache.popitem(last=False)
        logger.debug("Analysis cache evicted oldest entry (key=%s...)", evicted_key[:12])


def clear() -> None:
    """Wipe the cache (used by tests, and available for ops)."""
    _cache.clear()


def size() -> int:
    return len(_cache)
