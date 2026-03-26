import requests
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

    def _get(self, path: str, params: Optional[dict] = None) -> Any:
        url = f"{self.base_url}{path}"
        response = self.session.get(url, headers=self._headers(), params=params, timeout=30)
        response.raise_for_status()
        return response.json()

    def _post(self, path: str, body: dict) -> Any:
        url = f"{self.base_url}{path}"
        response = self.session.post(url, headers=self._headers(), json=body, timeout=30)
        response.raise_for_status()
        return response.json()

    def get_grant_for_indexing(self, grant_id: int) -> GrantData:
        data = self._get(f"/api/ai/grants/{grant_id}/indexable")
        return GrantData(**data)

    def get_user_profile(self, user_id: int) -> UserProfile:
        data = self._get(f"/api/ai/users/{user_id}/grant-profile")
        return UserProfile(**data)

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