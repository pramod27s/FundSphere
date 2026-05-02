import requests
import time
from typing import Any, List, Optional
from .config import settings
from .schemas import GrantData, UserProfile, KeywordCandidate


class SpringBootClient:
    def __init__(self) -> None:
        self.base_url = settings.spring_boot_base_url.rstrip("/")
        self.session = requests.Session()

    def _headers(self) -> dict:
        headers = {"Content-Type": "application/json"}
        if settings.spring_boot_api_key:
            headers["X-API-KEY"] = settings.spring_boot_api_key
        return headers

    def _request(self, method: str, path: str, params: Optional[dict] = None, body: Optional[dict] = None) -> Any:
        url = f"{self.base_url}{path}"
        attempts = max(settings.spring_boot_retry_count, 0) + 1

        for attempt in range(1, attempts + 1):
            try:
                response = self.session.request(
                    method=method,
                    url=url,
                    headers=self._headers(),
                    params=params,
                    json=body,
                    timeout=settings.spring_boot_timeout_seconds,
                )
                response.raise_for_status()
                if not response.content:
                    return {}
                return response.json()
            except requests.RequestException as exc:
                if attempt >= attempts:
                    raise RuntimeError(f"CoreBackend call failed for {method} {path}: {exc}") from exc
                sleep_seconds = settings.spring_boot_retry_backoff_seconds * attempt
                time.sleep(sleep_seconds)

        return {}

    def _get(self, path: str, params: Optional[dict] = None) -> Any:
        return self._request("GET", path, params=params)

    def _post(self, path: str, body: dict) -> Any:
        return self._request("POST", path, body=body)

    def get_grant_for_indexing(self, grant_id: int) -> GrantData:
        data = self._get(f"/api/ai/grants/{grant_id}/indexable")
        return GrantData(**data)

    def get_user_profile(self, user_id: int) -> UserProfile:
        data = self._get(f"/api/ai/users/{user_id}/grant-profile")
        return UserProfile(**data)

    def sample_profiles(self, count: int = 30) -> List[UserProfile]:
        """Pull a random sample of real researcher profiles from CoreBackend.
        Used by the auto-eval harness to benchmark on real users.
        Returns [] if the endpoint is unavailable (older backend) — callers
        should fall back to synthesized profiles."""
        try:
            data = self._get("/api/ai/users/sample-profiles", params={"count": count})
        except Exception:
            return []
        if not isinstance(data, list):
            return []
        return [UserProfile(**item) for item in data]

    def keyword_search(
        self,
        query: str,
        user_profile: Optional[UserProfile] = None,
        top_k: int = 20,
    ) -> List[KeywordCandidate]:
        body = {
            "query": query,
            "topK": top_k,
            "country": user_profile.country if user_profile else None,
            "institutionType": user_profile.institutionType if user_profile else None,
            "applicantType": user_profile.applicantType if user_profile else None,
        }
        data = self._post("/api/ai/grants/keyword-search", body)
        return [KeywordCandidate(**item) for item in data]

    def get_changed_grant_ids(self, since_iso: str) -> List[int]:
        data = self._get("/api/ai/grants/changed-ids", params={"since": since_iso})
        return [int(x) for x in data]