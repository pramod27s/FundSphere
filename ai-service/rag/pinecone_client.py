from typing import Any, Dict, List, Optional
from pinecone import Pinecone
from .config import settings
from .document_builder import build_pinecone_record
from .schemas import GrantData, SemanticHit


SEARCH_FIELDS = [
    "grant_id",
    "grant_title",
    "funding_agency",
    "program_name",
    "application_deadline",
    "deadline_epoch",
    "funding_amount_min",
    "funding_amount_max",
    "funding_currency",
    "eligible_countries",
    "eligible_applicants",
    "institution_type",
    "field",
    "tags",
    "grant_url",
    "application_link",
    "chunk_text",
]


class PineconeService:
    def __init__(self) -> None:
        if not settings.pinecone_api_key:
            raise ValueError("PINECONE_API_KEY is missing")
        if not settings.pinecone_index_host:
            raise ValueError("PINECONE_INDEX_HOST is missing")

        self.pc = Pinecone(api_key=settings.pinecone_api_key)
        self.index = self.pc.Index(host=settings.pinecone_index_host)
        self.namespace = settings.pinecone_namespace

    def upsert_grant(self, grant: GrantData) -> dict:
        record = build_pinecone_record(grant)
        self.index.upsert_records(self.namespace, [record])
        return record

    def delete_grant(self, grant_id: int) -> None:
        record_id = f"grant#{grant_id}"
        self.index.delete(namespace=self.namespace, ids=[record_id])

    def search(
        self,
        query_text: str,
        top_k: int,
        metadata_filter: Optional[dict] = None,
        use_rerank: bool = True,
    ) -> List[SemanticHit]:
        query: Dict[str, Any] = {
            "inputs": {"text": query_text},
            "top_k": top_k,
        }

        if metadata_filter:
            query["filter"] = metadata_filter

        kwargs: Dict[str, Any] = {
            "namespace": self.namespace,
            "query": query,
            "fields": SEARCH_FIELDS,
        }

        if use_rerank:
            kwargs["rerank"] = {
                "model": settings.pinecone_rerank_model,
                "top_n": top_k,
                "rank_fields": ["chunk_text"],
                "query": query_text,
            }

        response = self.index.search(**kwargs)
        hits = self._extract_hits(response)

        results: List[SemanticHit] = []
        for hit in hits:
            hit_id = self._hit_id(hit)
            hit_score = float(self._hit_score(hit))
            fields = self._hit_fields(hit)

            grant_id = fields.get("grant_id")
            if grant_id is None and hit_id.startswith("grant#"):
                grant_id = int(hit_id.split("#")[-1])

            if grant_id is None:
                continue

            results.append(
                SemanticHit(
                    grantId=int(grant_id),
                    semanticScore=hit_score,
                    fields=fields,
                )
            )

        return results

    def _extract_hits(self, response: Any) -> list:
        if isinstance(response, dict):
            return response.get("result", {}).get("hits", [])

        result = getattr(response, "result", None)
        if result is not None:
            hits = getattr(result, "hits", None)
            if hits is not None:
                return hits

        return []

    def _hit_id(self, hit: Any) -> str:
        if isinstance(hit, dict):
            return str(hit.get("id", hit.get("_id", "")))
        return str(getattr(hit, "id", getattr(hit, "_id", "")))

    def _hit_score(self, hit: Any) -> float:
        if isinstance(hit, dict):
            return float(hit.get("_score", 0.0))
        return float(getattr(hit, "_score", 0.0))

    def _hit_fields(self, hit: Any) -> dict:
        if isinstance(hit, dict):
            return dict(hit.get("fields", {}) or {})
        return dict(getattr(hit, "fields", {}) or {})