import hashlib
import json
import logging
import threading
import time
from collections import OrderedDict
from typing import Optional, Tuple

from .config import settings
from .schemas import RecommendationResponse, UserProfile

logger = logging.getLogger("rag.cache")


class RecommendationCache:
    def __init__(self, max_size: int = 256, ttl_seconds: int = 1800) -> None:
        self.max_size = max_size
        self.ttl_seconds = ttl_seconds
        self._cache: OrderedDict[str, Tuple[float, RecommendationResponse]] = OrderedDict()
        self._lock = threading.Lock()

    def make_key(
        self,
        profile: Optional[UserProfile],
        user_query: Optional[str],
        top_k: int,
        use_rerank: Optional[bool],
    ) -> str:
        """Construct a deterministic SHA256 key from request parameters and user profile."""
        profile_repr = ""
        if profile:
            profile_dict = {
                "userId": profile.userId,
                "country": profile.country,
                "applicantType": profile.applicantType,
                "institutionType": profile.institutionType,
                "careerStage": profile.careerStage,
                "department": profile.department,
                "researchInterests": sorted(profile.researchInterests or []),
                "keywords": sorted(profile.keywords or []),
                "hasPhd": profile.hasPhd,
                "citizenship": profile.citizenship,
                "preferredMinAmount": profile.preferredMinAmount,
                "preferredMaxAmount": profile.preferredMaxAmount,
                "preferredCurrency": profile.preferredCurrency,
            }
            profile_repr = json.dumps(profile_dict, sort_keys=True)

        norm_query = (user_query or "").strip().lower()
        key_raw = f"q:{norm_query}|k:{top_k}|rr:{use_rerank}|p:{profile_repr}"
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
