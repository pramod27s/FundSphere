"""FastAPI router for the Grant Compliance Desk (Objective 4)."""
from __future__ import annotations

import asyncio
import logging
import time

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from proposal.pdf_extractor import extract_pages

from .report_writer import recheck, write_draft
from .sanction_reader import read_sanction_order, summarise
from .schemas import CheckDraftRequest, ReportDraft, ReportInput, SanctionOrderReading

logger = logging.getLogger("award.routes")

router = APIRouter(prefix="/award", tags=["award"])

MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB
# Below this much text we assume a scanned PDF (a sanction order is short, but never this short).
MIN_TEXT_CHARS = 200


@router.post("/read-sanction-order", response_model=SanctionOrderReading)
async def read_sanction_order_route(
    sanction_order_pdf: UploadFile = File(...),
    force: bool = Form(default=False),
):
    """Read a sanction order into the "Add my grant" form (4.5).

    Nothing is stored: the PDF is read, the values are returned with the
    sentence each came from, and the PI checks them in the form.
    """
    started = time.monotonic()
    filename = (sanction_order_pdf.filename or "").lower()
    if not filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail=f"The sanction order must be a PDF (got '{sanction_order_pdf.filename}').")
    data = await sanction_order_pdf.read()
    if not data:
        raise HTTPException(status_code=400, detail="The sanction order PDF is empty.")
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="The sanction order PDF is too large (limit: 25 MB).")

    pages = await asyncio.to_thread(extract_pages, data)
    if sum(len(p.strip()) for p in pages) < MIN_TEXT_CHARS:
        raise HTTPException(
            status_code=422,
            detail=(
                "This looks like a scanned PDF (it has almost no text we can read), so it can't be read "
                "automatically. Type the details from the order into the form instead."
            ),
        )

    try:
        reading = await read_sanction_order(pages, source_name=sanction_order_pdf.filename or "", force=force)
    except Exception as exc:
        logger.exception("Sanction order reading failed")
        msg = str(exc).lower()
        if "exhausted" in msg or "resource_exhausted" in msg or "429" in msg or "503" in msg:
            raise HTTPException(
                status_code=503,
                detail="The AI service is busy right now (rate limit). Please try again in a minute.",
            )
        raise HTTPException(status_code=502, detail="The AI couldn't read this sanction order. Please try again.")

    logger.info("Sanction order read in %.1fs (%d pages): %s",
                time.monotonic() - started, len(pages), summarise(reading))
    return reading


@router.post("/generate-draft", response_model=ReportDraft)
async def generate_draft_route(report: ReportInput):
    """Draft a progress report from the grant's recorded entries (4.4).

    Stateless: Spring Boot sends the records and stores the draft. Every
    sentence comes back with the entries it cites and the result of the
    unsupported-claim check.
    """
    started = time.monotonic()
    try:
        draft = await write_draft(report)
    except Exception as exc:
        logger.exception("Progress report drafting failed")
        msg = str(exc).lower()
        if "exhausted" in msg or "resource_exhausted" in msg or "429" in msg or "503" in msg or "quota" in msg:
            raise HTTPException(
                status_code=503,
                detail="The AI service is busy right now (rate limit). Please try again in a minute.",
            )
        raise HTTPException(status_code=502, detail="The AI couldn't write the draft. Please try again.")

    logger.info("Progress report drafted in %.1fs: %d outputs, %d unsupported, %d to fill in",
                time.monotonic() - started, len(report.outputs), draft.unsupported_count, draft.placeholder_count)
    return draft


@router.post("/check-draft", response_model=ReportDraft)
async def check_draft_route(request: CheckDraftRequest):
    """Re-check a draft after the PI edited it, against the records as they are now. No AI call."""
    return recheck(request)
