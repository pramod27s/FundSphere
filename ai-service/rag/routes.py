from fastapi import APIRouter, HTTPException
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
def health() -> dict:
    return {"status": "ok"}


@router.post("/index-grant")
def index_grant(request: IndexGrantRequest) -> dict:
    try:
        return indexer.index_grant(request.grantId)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/index-grants")
def index_grants(request: IndexBatchRequest) -> dict:
    try:
        return indexer.index_many(request.grantIds)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/grant/{grant_id}")
def delete_grant(grant_id: int) -> dict:
    try:
        return indexer.delete_grant(grant_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/recommend")
def recommend(request: RecommendationRequest):
    try:
        return recommender.recommend(request)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))