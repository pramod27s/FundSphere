"""FastAPI router for adding a grant by hand (2nd.md, Part B)."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from proposal.pdf_extractor import extract_pages
from workspace.source_fetch import SourceFetchError, fetch_source

from .reader import read_call, summarise
from .schemas import CallReading

logger = logging.getLogger("intake.routes")

router = APIRouter(prefix="/intake", tags=["intake"])

MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB
MAX_TEXT_CHARS = 200_000
# Below this much text we assume a scanned PDF (or a page with no call on it).
MIN_TEXT_CHARS = 200
# Pasted text can be a short notice.
MIN_PASTED_CHARS = 80


@router.post("/read-call", response_model=CallReading)
async def read_call_route(
    call_pdf: Optional[UploadFile] = File(default=None),
    url: str = Form(default=""),
    text: str = Form(default=""),
    force: bool = Form(default=False),
):
    """Read a funding call into the "Add a grant" form.

    Send exactly one of `call_pdf`, `url` or `text`. Nothing is stored: each
    value comes back with the sentence it came from, and the admin checks
    them in the form.
    """
    started = time.monotonic()
    has_file = call_pdf is not None and bool(call_pdf.filename)
    has_url, has_text = bool(url.strip()), bool(text.strip())
    if has_file + has_url + has_text != 1:
        raise HTTPException(status_code=400, detail="Upload the call's PDF, paste its link or paste its text (one of the three).")

    warnings: list[str] = []
    source_url = ""
    if has_file:
        data = await _read_pdf_upload(call_pdf)
        pages = await asyncio.to_thread(extract_pages, data)
        kind, name, has_pages, minimum = "pdf", call_pdf.filename or "call.pdf", True, MIN_TEXT_CHARS
    elif has_url:
        try:
            fetched = await asyncio.to_thread(fetch_source, url)
        except SourceFetchError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"{exc} If the site blocks us, open it in your browser and upload the PDF or paste the text instead.",
            )
        pages, kind, name = fetched.pages, fetched.kind, fetched.name
        has_pages, minimum = kind == "pdf", MIN_TEXT_CHARS
        warnings.extend(w for w in fetched.warnings if not w.startswith("Read from a web page"))
        source_url = url.strip()
    else:
        if len(text) > MAX_TEXT_CHARS:
            raise HTTPException(status_code=413, detail="The pasted text is too long. Paste the part that describes the call.")
        pages, kind, name, has_pages, minimum = [text.strip()], "text", "pasted text", False, MIN_PASTED_CHARS

    if sum(len(p.strip()) for p in pages) < minimum:
        raise HTTPException(
            status_code=422,
            detail=(
                "This looks like a scanned PDF (it has almost no text we can read). Paste the call's text instead."
                if kind == "pdf"
                else "There's too little text to read a call from. Paste the full notice, or upload its PDF."
            ),
        )

    try:
        reading = await read_call(pages, has_page_numbers=has_pages, source_kind=kind, source_name=name,
                                  source_url=source_url, force=force)
    except Exception as exc:
        logger.exception("Call reading failed")
        msg = str(exc).lower()
        if "exhausted" in msg or "resource_exhausted" in msg or "429" in msg or "503" in msg:
            raise HTTPException(status_code=503, detail="The AI service is busy right now (rate limit). Please try again in a minute.")
        raise HTTPException(status_code=502, detail="The AI couldn't read this call. Please try again.")

    reading.warnings = warnings + reading.warnings
    logger.info("Call read in %.1fs from %s (%d pages): %s",
                time.monotonic() - started, kind, len(pages), summarise(reading))
    return reading


async def _read_pdf_upload(upload: UploadFile) -> bytes:
    filename = (upload.filename or "").lower()
    if not filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail=f"The call must be a PDF (got '{upload.filename}').")
    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail="The PDF is empty.")
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="The PDF is too large (limit: 25 MB).")
    return data
