import hmac
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import json
import traceback
from jwt.exceptions import InvalidTokenError, ExpiredSignatureError

from rag.config import settings
from rag.routes import router as rag_router
from proposal.routes import router as proposal_router
from rag.m2m_auth import verify_m2m_token

app = FastAPI(title="FundSphere AI Service")

if settings.require_internal_api_key and not settings.internal_api_key:
    raise RuntimeError("INTERNAL_API_KEY or SPRING_BOOT_API_KEY must be set when REQUIRE_INTERNAL_API_KEY=true")

app.include_router(rag_router)
app.include_router(proposal_router)


def _is_exempt_path(path: str) -> bool:
    """Paths that do not require authentication (health checks and docs)."""
    return path in {"/", "/health", "/openapi.json", "/docs", "/redoc"}


@app.middleware("http")
async def internal_m2m_auth_middleware(request: Request, call_next):
    """
    ==============================================================================
    Internal Authentication Middleware (Level 2 Asymmetric M2M Security)
    ==============================================================================

    1. PRIMARY CHECK: Level 2 M2M JWT (RS256 Bearer Token)
       - Checks 'Authorization: Bearer <token>'
       - Verified using Spring Boot's Public Key (m2m_public_key.pem)
       - Fast, cryptographic, and automatically rejects expired tokens (>5 mins).

    2. FALLBACK CHECK: Shared X-API-KEY
       - Preserved for backward-compatibility with offline scripts (e.g., scraper/eval).
    ==============================================================================
    """
    if settings.require_internal_api_key and not _is_exempt_path(request.url.path):
        auth_header = request.headers.get("Authorization", "")

        # 1. Try Level 2 Asymmetric M2M Bearer Token
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            try:
                claims = verify_m2m_token(token)
                request.state.m2m_claims = claims
                request.state.m2m_token = token
                return await call_next(request)
            except ExpiredSignatureError:
                return JSONResponse(status_code=401, content={"detail": "M2M JWT token has expired"})
            except InvalidTokenError as exc:
                return JSONResponse(status_code=401, content={"detail": f"Invalid M2M JWT token: {str(exc)}"})

        # 2. Fallback to X-API-KEY (for offline scripts or legacy callers)
        received_key = request.headers.get("X-API-KEY", "")
        if settings.internal_api_key and received_key:
            if hmac.compare_digest(received_key, settings.internal_api_key):
                return await call_next(request)

        # Fail-closed: Deny access if neither credential is valid
        return JSONResponse(
            status_code=401,
            content={"detail": "Unauthorized: Missing or invalid M2M token / API key"}
        )

    return await call_next(request)


@app.get("/")
def root():
    return {"message": "FundSphere AI service running"}


@app.get("/health")
def health():
    return {"status": "ok"}
