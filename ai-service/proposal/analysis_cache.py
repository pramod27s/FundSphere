"""In-process content-hash cache for guidelines extractions.

The same guidelines text returns the cached result instantly, with no LLM
call. CoreBackend also stores every extraction in its database, which is the
lasting copy; this cache just avoids repeat calls within one process.

In-memory LRU. The cache is per-process — a restart costs at most one
re-analysis per unique input. That's fine for this use case; users rarely
re-analyze the exact same PDFs across a long downtime, and we don't want
the operational complexity of Redis here.
"""
from __future__ import annotations

import copy
import logging
import os
from collections import OrderedDict
from typing import Optional

logger = logging.getLogger("proposal.analysis_cache")

_MAX_ENTRIES = int(os.getenv("PROPOSAL_CACHE_MAX_ENTRIES", "200"))
_cache: "OrderedDict[str, dict]" = OrderedDict()


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
