from typing import Any, Dict, List, Optional
from pinecone import Pinecone, ServerlessSpec
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
        
        # Initialize Pinecone-hosted SPLADE encoder
        self.sparse_encoder = self.pc.inference.sparse_encoder(model="pinecone-sparse-english-v0")

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

    def upsert_grant(self, grant: GrantData) -> dict:
        record = build_pinecone_record(grant)
        
        chunk_text = record.get("chunk_text", "")
        
        # Generate dense vector
        dense_result = self.pc.inference.embed(
            model="llama-text-embed-v2",
            inputs=[chunk_text],
            parameters={"input_type": "passage"}
        )
        dense_embedding = dense_result[0].values
        
        # Generate SPLADE sparse vector from chunk_text
        sparse_result = self.sparse_encoder.encode_documents(documents=[chunk_text])
        sparse_vector = {
            "indices": sparse_result[0].indices,
            "values":  sparse_result[0].values,
        }

        metadata = record.copy()
        metadata.pop("id", None) # Remove 'id' from metadata to prevent duplication

        vector = {
            "id": record["id"],
            "values": dense_embedding,
            "sparse_values": sparse_vector,
            "metadata": metadata
        }

        self.index.upsert(vectors=[vector], namespace=self.namespace)
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
        alpha: float = 0.7,
    ) -> List[SemanticHit]:
        
        # Generate dense vector for query
        dense_result = self.pc.inference.embed(
            model="llama-text-embed-v2",
            inputs=[query_text],
            parameters={"input_type": "query"}
        )
        dense_embedding = dense_result[0].values
        
        # Generate SPLADE sparse vector for query
        sparse_result = self.sparse_encoder.encode_queries(queries=[query_text])
        sparse_vector = {
            "indices": sparse_result[0].indices,
            "values":  sparse_result[0].values,
        }
        
        # Apply alpha weighting
        weighted_dense = [v * alpha for v in dense_embedding]
        weighted_sparse = {
            "indices": sparse_vector["indices"],
            "values":  [v * (1 - alpha) for v in sparse_vector["values"]],
        }

        # Native pinecone query
        response = self.index.query(
            namespace=self.namespace,
            vector=weighted_dense,
            sparse_vector=weighted_sparse,
            top_k=top_k,
            include_metadata=True,
            filter=metadata_filter or {},
        )
        
        results: List[SemanticHit] = []
        for match in response.get("matches", []):
            hit_metadata = match.get("metadata", {})
            grant_id = hit_metadata.get("grant_id")
            
            if grant_id is None:
                continue
                
            results.append(
                SemanticHit(
                    grantId=int(grant_id),
                    semanticScore=float(match.get("score", 0.0)),
                    fields=hit_metadata,
                )
            )

        return results

