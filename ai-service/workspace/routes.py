"""FastAPI router for the Application Readiness Workspace (Objective 3)."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from proposal.pdf_extractor import extract_pages

from .extractor import extract_checklist, summarise
from .schemas import ChecklistExtractionResponse
from .source_fetch import SourceFetchError, fetch_source

logger = logging.getLogger("workspace.routes")

router = APIRouter(prefix="/workspace", tags=["workspace"])

MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB
# Below this much text across the whole document we assume a scanned PDF.
MIN_TEXT_CHARS = 200


@router.post("/extract-checklist", response_model=ChecklistExtractionResponse)
async def extract_checklist_route(
    guidelines_pdf: Optional[UploadFile] = File(default=None),
    url: str = Form(default=""),
    grant_title: str = Form(default=""),
    force: bool = Form(default=False),
):
    """Build a requirements checklist from a guidelines PDF or a link.

    Send exactly one of `guidelines_pdf` or `url`. Every item carries the
    sentence (and, for PDFs, the page) it came from, plus whether that
    quote was found in the document.
    """
    started = time.monotonic()
    has_file = guidelines_pdf is not None and bool(guidelines_pdf.filename)
    has_url = bool(url.strip())
    if has_file == has_url:
        raise HTTPException(status_code=400, detail="Upload the guidelines PDF or paste a link (one of the two).")

    warnings: list[str] = []
    if has_file:
        data = await _read_pdf_upload(guidelines_pdf)
        pages = await asyncio.to_thread(extract_pages, data)
        source_kind, source_name = "pdf", guidelines_pdf.filename or "guidelines.pdf"
    else:
        try:
            fetched = await asyncio.to_thread(fetch_source, url)
        except SourceFetchError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        pages, source_kind, source_name = fetched.pages, fetched.kind, fetched.name
        warnings.extend(fetched.warnings)

    if sum(len(p.strip()) for p in pages) < MIN_TEXT_CHARS:
        raise HTTPException(
            status_code=422,
            detail=(
                "This looks like a scanned PDF (it has almost no text we can read). "
                "Paste the call's link or upload a text-based copy of the guidelines instead."
                if source_kind == "pdf"
                else "Couldn't find any guideline text on that page. Upload the guidelines PDF instead."
            ),
        )

    try:
        result = await extract_checklist(
            pages,
            title=grant_title,
            source_kind=source_kind,
            source_name=source_name,
            warnings=warnings,
            force=force,
        )
    except Exception as exc:
        logger.exception("Checklist extraction failed")
        msg = str(exc).lower()
        if "exhausted" in msg or "resource_exhausted" in msg or "429" in msg or "503" in msg:
            raise HTTPException(
                status_code=503,
                detail="The AI service is busy right now (rate limit). Please try again in a minute.",
            )
        raise HTTPException(status_code=502, detail="The AI couldn't read these guidelines. Please try again.")

    logger.info(
        "Checklist extracted in %.1fs from %s (%d pages): %s",
        time.monotonic() - started, source_kind, len(pages), summarise(result),
    )
    return result


async def _read_pdf_upload(upload: UploadFile) -> bytes:
    filename = (upload.filename or "").lower()
    if not filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail=f"The guidelines file must be a PDF (got '{upload.filename}').")
    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail="The guidelines PDF is empty.")
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="The guidelines PDF is too large (limit: 25 MB).")
    return data
