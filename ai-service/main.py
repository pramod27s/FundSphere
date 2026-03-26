from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from scrape.scrape import crawl_site_for_grants
from scrape.extractor import extract_grant_items
from scrape.schemas import ScrapeResponse

from rag.routes import router as rag_router

app = FastAPI(title="FundSphere AI Service")

app.include_router(rag_router)


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