from fastapi import APIRouter, HTTPException
import asyncio
from .indexer import GrantIndexer
from .pinecone_client import PineconeService
from .recommender import RecommenderService
from .schemas import (
    IndexBatchRequest,
    IndexGrantRequest,
    RecommendationRequest,
)
from .springboot_client import SpringBootClient

router = APIRouter(prefix="/rag", tags=["rag"])

spring_client = SpringBootClient()
pinecone_service = PineconeService()
indexer = GrantIndexer(spring_client, pinecone_service)
recommender = RecommenderService(spring_client, pinecone_service)


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.post("/index-grant")
async def index_grant(request: IndexGrantRequest) -> dict:
    try:
        return await asyncio.to_thread(indexer.index_grant, request.grantId)
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Pinecone timeout getting embedding or indexing grant.")
    except Exception as exc:
        if "embedding" in str(exc).lower() and ("empty" in str(exc).lower() or "none" in str(exc).lower()):
            raise HTTPException(status_code=422, detail="Embedding failure missing dense or sparse vector generation.")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/index-grants")
async def index_grants(request: IndexBatchRequest) -> dict:
    try:
        return await asyncio.to_thread(indexer.index_many, request.grantIds)
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Pinecone timeout processing batch.")
    except Exception as exc:
        if "embedding" in str(exc).lower() and ("empty" in str(exc).lower() or "none" in str(exc).lower()):
            raise HTTPException(status_code=422, detail="Embedding failure missing dense or sparse vector generation.")
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/grant/{grant_id}")
async def delete_grant(grant_id: int) -> dict:
    try:
        return await asyncio.to_thread(indexer.delete_grant, grant_id)
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Pinecone deletion timed out.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/recommend")
async def recommend(request: RecommendationRequest):
    try:
        result = await asyncio.to_thread(recommender.recommend, request)
        if not result.results:
            return {"queryText": result.queryText, "results": [], "no_results": True}
        return result
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Search inference timeout fetching semantic query.")
    except Exception as exc:
        if "embedding" in str(exc).lower() and ("empty" in str(exc).lower() or "none" in str(exc).lower()):
            raise HTTPException(status_code=422, detail="Embedding extraction failed.")
        raise HTTPException(status_code=500, detail=str(exc))