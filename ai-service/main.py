import hmac

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import json
import traceback

from rag.config import settings
from rag.routes import router as rag_router

app = FastAPI(title="FundSphere AI Service")

if settings.require_internal_api_key and not settings.internal_api_key:
    raise RuntimeError("INTERNAL_API_KEY or SPRING_BOOT_API_KEY must be set when REQUIRE_INTERNAL_API_KEY=true")

app.include_router(rag_router)


def _is_exempt_path(path: str) -> bool:
    return path in {"/", "/health", "/openapi.json", "/docs", "/redoc"}


@app.middleware("http")
async def internal_api_key_middleware(request: Request, call_next):
    if settings.require_internal_api_key and not _is_exempt_path(request.url.path):
        received_key = request.headers.get("X-API-KEY", "")
        if not hmac.compare_digest(received_key, settings.internal_api_key):
            return JSONResponse(status_code=401, content={"detail": "Invalid or missing X-API-KEY"})
    return await call_next(request)


@app.get("/")
def root():
    return {"message": "FundSphere AI service running"}


@app.get("/health")
def health():
    return {"status": "ok"}
