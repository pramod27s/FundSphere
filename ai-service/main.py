import hmac

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import json
import traceback

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
    maxListing: Optional[int] = None
    maxLinks: Optional[int] = None
    maxWorkers: Optional[int] = None
    maxDetailDepth: Optional[int] = None
    seleniumDriverPath: Optional[str] = None


@app.get("/")
def root():
    return {"message": "FundSphere AI service running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/scrape", response_model=ScrapeResponse)
def scrape_and_extract(req: ScrapeRequest):
    url = (req.url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    try:
        crawl_kwargs = {}
        if req.maxListing is not None:
            crawl_kwargs["max_listing"] = req.maxListing
        if req.maxLinks is not None:
            crawl_kwargs["max_links"] = req.maxLinks
        if req.maxWorkers is not None:
            crawl_kwargs["max_workers"] = req.maxWorkers
        if req.maxDetailDepth is not None:
            crawl_kwargs["max_detail_depth"] = req.maxDetailDepth
        if req.seleniumDriverPath:
            crawl_kwargs["selenium_driver_path"] = req.seleniumDriverPath

        scraped_items = crawl_site_for_grants(url, **crawl_kwargs)

        print("\n=== RAW SCRAPED ITEMS ===")
        print(json.dumps(scraped_items, indent=2, ensure_ascii=False))

        grants = extract_grant_items(scraped_items)

        print("\n=== EXTRACTED GRANTS ===")
        print(json.dumps(grants, indent=2, ensure_ascii=False))

        return {
            "sourceUrl": url,
            "grants": grants
        }

    except Exception as e:
        print("\n=== SCRAPE ERROR ===")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))