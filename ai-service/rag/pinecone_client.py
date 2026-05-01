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

            dense_result = self.pc.inference.embed(
                model="llama-text-embed-v2",
                inputs=[chunk_text],
                parameters={"dimension": 1024, "input_type": "passage"}
            )
            dense_embedding = dense_result[0].values

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
            metadata.pop("id", None)

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
            self.index.delete(namespace=self.namespace, filter={"grant_id": {"$eq": grant_id}})
        except Exception:
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
        use_rerank: bool = False,
        alpha: float = 0.7,
    ) -> List[SemanticHit]:
        try:
            dense_result = self.pc.inference.embed(
                model="llama-text-embed-v2",
                inputs=[query_text],
                parameters={"dimension": 1024, "input_type": "query"}
            )
            dense_embedding = dense_result[0].values

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

        weighted_dense = [v * alpha for v in dense_embedding]
        weighted_sparse = {
            "indices": sparse_vector["indices"],
            "values":  [v * (1 - alpha) for v in sparse_vector["values"]],
        }

        try:
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

    def fetch_metadata_by_grant_ids(self, grant_ids: List[int]) -> Dict[int, Dict[str, Any]]:
        """
        Look up the first stored chunk for each grant_id and return its metadata.
        Used to hydrate keyword-only candidates that were never returned by the
        semantic channel.
        """
        if not grant_ids:
            return {}

        results: Dict[int, Dict[str, Any]] = {}
        # Try the cheap path first: fetch by deterministic chunk0 id
        ids_to_try = [f"grant#{gid}-chunk0" for gid in grant_ids]
        try:
            resp = self.index.fetch(ids=ids_to_try, namespace=self.namespace)
            vectors = getattr(resp, "vectors", None)
            if vectors is None and isinstance(resp, dict):
                vectors = resp.get("vectors", {})
            if vectors:
                for _, vec in (vectors.items() if hasattr(vectors, "items") else vectors):
                    md = getattr(vec, "metadata", None)
                    if md is None and isinstance(vec, dict):
                        md = vec.get("metadata")
                    if md and md.get("grant_id") is not None:
                        results[int(md["grant_id"])] = dict(md)
        except Exception as e:
            logger.warning(f"Pinecone fetch by chunk0 id failed: {e}")

        # For any grant still missing, fall back to a metadata-filtered query
        missing = [gid for gid in grant_ids if gid not in results]
        for gid in missing:
            try:
                qresp = self.index.query(
                    namespace=self.namespace,
                    vector=[1e-5] * 1024,
                    top_k=1,
                    include_metadata=True,
                    filter={"grant_id": {"$eq": gid}},
                )
                for match in qresp.get("matches", []):
                    md = match.get("metadata") or {}
                    if md.get("grant_id") is not None:
                        results[int(md["grant_id"])] = dict(md)
                        break
            except Exception as e:
                logger.warning(f"Pinecone metadata fallback fetch failed for grant {gid}: {e}")

        return results

    def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        top_n: int,
        text_field: str = "text",
    ) -> List[Dict[str, Any]]:
        """
        Rerank documents against a query using bge-reranker-v2-m3 via Pinecone Inference.

        Each document must contain a `text` field with the passage to rank.
        Returns documents in reranked order, each augmented with `_rerank_score` and
        `_rerank_rank` (1-indexed). Custom fields on the input docs (e.g. `_grant_id`)
        are preserved by mapping back through the SDK's `index` attribute, since the
        SDK only round-trips the declared `rank_fields` plus `id`.
        """
        if not documents:
            return []

        try:
            response = self.pc.inference.rerank(
                model=settings.pinecone_rerank_model,
                query=query,
                documents=documents,
                top_n=min(top_n, len(documents)),
                rank_fields=[text_field],
                return_documents=True,
                parameters={"truncate": "END"},
            )
        except Exception as e:
            logger.error(f"Pinecone rerank failed, falling back to original order: {e}")
            return documents[:top_n]

        data = getattr(response, "data", None)
        if data is None and isinstance(response, dict):
            data = response.get("data", [])
        if not data:
            return documents[:top_n]

        ranked: List[Dict[str, Any]] = []
        for rank_idx, item in enumerate(data, start=1):
            # Read score
            score = getattr(item, "score", None)
            if score is None and isinstance(item, dict):
                score = item.get("score")

            # Read source index — most reliable way to recover the original doc
            src_idx = getattr(item, "index", None)
            if src_idx is None and isinstance(item, dict):
                src_idx = item.get("index")

            base_doc: Optional[Dict[str, Any]] = None
            if src_idx is not None and 0 <= int(src_idx) < len(documents):
                base_doc = documents[int(src_idx)]
            else:
                # Fallback: try to convert the SDK-returned document to a dict
                sdk_doc = getattr(item, "document", None)
                if sdk_doc is None and isinstance(item, dict):
                    sdk_doc = item.get("document")
                if sdk_doc is not None:
                    if isinstance(sdk_doc, dict):
                        base_doc = sdk_doc
                    elif hasattr(sdk_doc, "to_dict"):
                        try:
                            base_doc = sdk_doc.to_dict()
                        except Exception:
                            base_doc = None

            if base_doc is None:
                continue

            ranked.append({
                **base_doc,
                "_rerank_score": float(score or 0.0),
                "_rerank_rank": rank_idx,
            })

        return ranked or documents[:top_n]
