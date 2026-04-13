import hmac

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from rag.config import settings
from scrape.scrape import crawl_site_for_grants
from scrape.extractor import extract_grant_items
from scrape.schemas import ScrapeResponse

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


class ScrapeRequest(BaseModel):
    url: str


@app.get("/")
def root():
    return {"message": "FundSphere AI service running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/scrape", response_model=ScrapeResponse)
def scrape_and_extract(req: ScrapeRequest):
    if not req.url or not req.url.strip():
        raise HTTPException(status_code=400, detail="URL is required")

    scraped_items = crawl_site_for_grants(req.url.strip())
    grants = extract_grant_items(scraped_items)

    return {
        "sourceUrl": req.url.strip(),
        "grants": grants
    }