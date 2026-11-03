from fastapi import APIRouter, HTTPException
import asyncio
import logging
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
logger = logging.getLogger("rag.routes")

# An unexpected failure is logged in full here; the reply gives no exception
# text, which can include internal hosts or library details.
UNEXPECTED_ERROR = "Something went wrong in the AI service. Please try again."

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
        logger.exception("Indexing grant %s failed", request.grantId)
        raise HTTPException(status_code=500, detail=UNEXPECTED_ERROR)


@router.post("/index-grants")
async def index_grants(request: IndexBatchRequest) -> dict:
    try:
        return await asyncio.to_thread(indexer.index_many, request.grantIds)
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Pinecone timeout processing batch.")
    except Exception as exc:
        if "embedding" in str(exc).lower() and ("empty" in str(exc).lower() or "none" in str(exc).lower()):
            raise HTTPException(status_code=422, detail="Embedding failure missing dense or sparse vector generation.")
        logger.exception("Indexing a batch of %d grants failed", len(request.grantIds))
        raise HTTPException(status_code=500, detail=UNEXPECTED_ERROR)


@router.delete("/grant/{grant_id}")
async def delete_grant(grant_id: int) -> dict:
    try:
        return await asyncio.to_thread(indexer.delete_grant, grant_id)
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Pinecone deletion timed out.")
    except Exception:
        logger.exception("Removing grant %s from the index failed", grant_id)
        raise HTTPException(status_code=500, detail=UNEXPECTED_ERROR)


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
        logger.exception("Finding matches failed")
        raise HTTPException(status_code=500, detail=UNEXPECTED_ERROR)