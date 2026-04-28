from typing import Any, Dict, List, Optional
import logging
from pinecone import Pinecone, ServerlessSpec
from .config import settings
from .document_builder import build_pinecone_records
from .schemas import GrantData, SemanticHit

logger = logging.getLogger("rag.pinecone_client")

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
    "checksum",
    "last_scraped_at",
    "updated_at",
]


class PineconeService:
    def __init__(self) -> None:
        if not settings.pinecone_api_key:
            raise ValueError("PINECONE_API_KEY is missing")
        if not settings.pinecone_index_host:
            raise ValueError("PINECONE_INDEX_HOST is missing")

        self.pc = Pinecone(api_key=settings.pinecone_api_key)
        self.index_name = settings.pinecone_namespace
        self.index = self.pc.Index(host=settings.pinecone_index_host)
        self.namespace = settings.pinecone_namespace

    def recreate_index(self, index_name: str) -> None:
        try:
            self.pc.delete_index(index_name)
        except Exception:
            pass
            
        self.pc.create_index(
            name=index_name,
            dimension=1024,
            metric="dotproduct",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )

    def upsert_grant(self, grant: GrantData) -> list[dict]:
        records = build_pinecone_records(grant)
        vectors = []
        
        for record in records:
            chunk_text = record.get("chunk_text", "")
            
            # Generate dense vector via Pinecone Integrated Inference (llama-text-embed-v2)
            dense_result = self.pc.inference.embed(
                model="llama-text-embed-v2",
                inputs=[chunk_text],
                parameters={"dimension": 1024, "input_type": "passage"}
            )
            dense_embedding = dense_result[0].values

            # Generate SPLADE sparse vector from chunk_text via Pinecone inference
            sparse_result = self.pc.inference.embed(
                model="pinecone-sparse-english-v0",
                inputs=[chunk_text],
                parameters={"input_type": "passage"}
            )
            sparse_vector = {
                "indices": sparse_result[0].sparse_indices,
                "values":  sparse_result[0].sparse_values,
            }

            metadata = record.copy()
            metadata.pop("id", None) # Remove 'id' from metadata to prevent duplication

            vectors.append({
                "id": record["id"],
                "values": dense_embedding,
                "sparse_values": sparse_vector,
                "metadata": metadata
            })

        self.index.upsert(vectors=vectors, namespace=self.namespace)
        return records

    def delete_grant(self, grant_id: int) -> None:
        try:
            # First try serverless metadata filter delete
            self.index.delete(namespace=self.namespace, filter={"grant_id": {"$eq": grant_id}})
        except Exception:
            # Fallback: query and delete
            response = self.index.query(
                namespace=self.namespace,
                vector=[1e-5] * 1024,
                top_k=200,
                filter={"grant_id": {"$eq": grant_id}},
                include_metadata=False,
            )
            ids_to_delete = [match["id"] for match in response.get("matches", [])]
            if ids_to_delete:
                self.index.delete(namespace=self.namespace, ids=ids_to_delete)
        
        # Also delete the legacy non-chunked ID for backward compatibility
        legacy_id = f"grant#{grant_id}"
        try:
            self.index.delete(namespace=self.namespace, ids=[legacy_id])
        except Exception:
            pass

    def search(
        self,
        query_text: str,
        top_k: int,
        metadata_filter: Optional[dict] = None,
        use_rerank: bool = True,
        alpha: float = 0.7,
    ) -> List[SemanticHit]:
        
        try:
            # Generate dense query vector via Pinecone Integrated Inference
            dense_result = self.pc.inference.embed(
                model="llama-text-embed-v2",
                inputs=[query_text],
                parameters={"dimension": 1024, "input_type": "query"}
            )
            dense_embedding = dense_result[0].values

            # Generate SPLADE sparse vector for query via Pinecone inference
            sparse_result = self.pc.inference.embed(
                model="pinecone-sparse-english-v0",
                inputs=[query_text],
                parameters={"input_type": "query"}
            )
            sparse_vector = {
                "indices": sparse_result[0].sparse_indices,
                "values":  sparse_result[0].sparse_values,
            }
        except Exception as e:
            logger.error(f"Pinecone inference embed failed: {e}")
            raise RuntimeError(f"Pinecone inference failed: {e}") from e

        # Apply alpha weighting
        weighted_dense = [v * alpha for v in dense_embedding]
        weighted_sparse = {
            "indices": sparse_vector["indices"],
            "values":  [v * (1 - alpha) for v in sparse_vector["values"]],
        }

        try:
            # Native pinecone query
            response = self.index.query(
                namespace=self.namespace,
                vector=weighted_dense,
                sparse_vector=weighted_sparse,
                top_k=top_k,
                include_metadata=True,
                filter=metadata_filter if metadata_filter else None,
            )
        except Exception as e:
            if "does not support sparse values" in str(e):
                response = self.index.query(
                    namespace=self.namespace,
                    vector=weighted_dense,
                    top_k=top_k,
                    include_metadata=True,
                    filter=metadata_filter if metadata_filter else None,
                )
            else:
                raise

        results: List[SemanticHit] = []
        seen_grants = set()
        for match in response.get("matches", []):
            hit_metadata = match.get("metadata", {})
            grant_id = hit_metadata.get("grant_id")
            
            if grant_id is None:
                continue
                
            grant_id = int(grant_id)
            if grant_id in seen_grants:
                continue
            seen_grants.add(grant_id)
                
            results.append(
                SemanticHit(
                    grantId=grant_id,
                    semanticScore=float(match.get("score", 0.0)),
                    fields=hit_metadata,
                )
            )

        return results

