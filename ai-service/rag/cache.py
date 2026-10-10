import dataclasses
import hashlib
import json
import logging
import threading
import time
from collections import OrderedDict
from typing import Optional, Tuple

from .config import settings
from .schemas import RecommendationRequest, RecommendationResponse, UserProfile

logger = logging.getLogger("rag.cache")


def _settings_fingerprint() -> dict:
    """Current settings minus secrets. Read per call: the eval harness flips
    flags at runtime, and a result computed under other flags must not be reused."""
    return {k: v for k, v in dataclasses.asdict(settings).items() if "api_key" not in k}


class RecommendationCache:
    def __init__(self, max_size: int = 256, ttl_seconds: int = 1800) -> None:
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        self._cache: OrderedDict[str, Tuple[float, RecommendationResponse]] = OrderedDict()
        self._lock = threading.Lock()

    def make_key(
        self,
        profile: Optional[UserProfile],
        request: RecommendationRequest,
        top_k: int,
        use_rerank: Optional[bool],
    ) -> str:
        """Deterministic SHA256 key over everything that can change the result:
        the whole profile (any edit is a new key), the request's query, alpha
        and keyword candidates, and the live settings."""
        payload = {
            "profile": profile.model_dump(mode="json") if profile else None,
            "query": (request.userQuery or "").strip().lower(),
            "alpha": request.alpha,
            "keywordCandidates": [[c.grantId, c.keywordScore] for c in request.keywordCandidates],
            "topK": top_k,
            "useRerank": use_rerank,
            "settings": _settings_fingerprint(),
        }
        key_raw = json.dumps(payload, sort_keys=True, default=str)
        return hashlib.sha256(key_raw.encode("utf-8")).hexdigest()

    def get(self, key: str) -> Optional[RecommendationResponse]:
        if not settings.enable_query_cache:
            return None

        now = time.time()
        with self._lock:
            if key not in self._cache:
                return None

            timestamp, response = self._cache[key]
            if now - timestamp > self.ttl_seconds:
                # Expired
                del self._cache[key]
                return None

            # Move to end for LRU order
            self._cache.move_to_end(key)
            logger.debug(f"Recommendation cache HIT for key={key[:12]}")
            return response

    def set(self, key: str, response: RecommendationResponse) -> None:
        if not settings.enable_query_cache:
            return

        now = time.time()
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = (now, response)

            # Evict oldest if exceeding max_size
            while len(self._cache) > self.max_size:
                self._cache.popitem(last=False)
            logger.debug(f"Recommendation cache SET for key={key[:12]}")

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()


# Global singleton instance
query_cache = RecommendationCache(
    max_size=settings.query_cache_max_size,
    ttl_seconds=settings.query_cache_ttl_seconds,
)
