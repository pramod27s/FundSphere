from typing import List
from .springboot_client import SpringBootClient
from .pinecone_client import PineconeService


class GrantIndexer:
    def __init__(self, spring_client: SpringBootClient, pinecone_service: PineconeService) -> None:
        self.spring_client = spring_client
        self.pinecone_service = pinecone_service

    def index_grant(self, grant_id: int) -> dict:
        grant = self.spring_client.get_grant_for_indexing(grant_id)
        record = self.pinecone_service.upsert_grant(grant)

        return {
            "status": "indexed",
            "grantId": grant_id,
            "recordId": record["_id"],
        }

    def index_many(self, grant_ids: List[int]) -> dict:
        results = []
        for grant_id in grant_ids:
            try:
                results.append(self.index_grant(grant_id))
            except Exception as exc:
                results.append(
                    {
                        "status": "failed",
                        "grantId": grant_id,
                        "error": str(exc),
                    }
                )
        return {"results": results}

    def delete_grant(self, grant_id: int) -> dict:
        self.pinecone_service.delete_grant(grant_id)
        return {"status": "deleted", "grantId": grant_id}