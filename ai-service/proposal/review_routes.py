"""FastAPI route for proposal reviews (Proposal Assistant v2).

The ai-service stays stateless: CoreBackend sends the stored guideline rules,
and for a revision or a re-run the previous review, and stores the result.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import ValidationError

from workspace.schemas import ProposalGuidance

from .models import ProposalDocument, ReviewResult
from .pipeline import UnreadableProposalError, run_review

logger = logging.getLogger("proposal.review_routes")

router = APIRouter(prefix="/proposal", tags=["proposal-review"])

MAX_FILE_BYTES = 25 * 1024 * 1024


@router.post("/review", response_model=ReviewResult)
async def review_proposal(
    guidance_json: str = Form(...),
    extraction_hash: str = Form(...),
    level: str = Form(default="instant"),
    grant_title: str = Form(default=""),
    proposal_pdf: Optional[UploadFile] = File(default=None),
    document_json: str = Form(default=""),
    previous_json: str = Form(default=""),
):
    """Review a proposal against the call's rules.

    Send the proposal as `proposal_pdf`, or as `document_json` (the document
    from an earlier review of the same draft, e.g. to upgrade an Instant
    check to a Full review without re-uploading). `previous_json` is the last
    review of this application, used to reuse unchanged work.
    """
    level = (level or "instant").strip().lower()
    if level not in {"instant", "full"}:
        raise HTTPException(status_code=400, detail="level must be 'instant' or 'full'.")
    try:
        guidance = ProposalGuidance.model_validate_json(guidance_json)
        previous = ReviewResult.model_validate_json(previous_json) if previous_json.strip() else None
        document = ProposalDocument.model_validate_json(document_json) if document_json.strip() else None
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid review input: {exc.errors()[:3]}")

    pdf_bytes = None
    if proposal_pdf is not None and proposal_pdf.filename:
        if not proposal_pdf.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="The proposal must be a PDF.")
        pdf_bytes = await proposal_pdf.read()
        if not pdf_bytes:
            raise HTTPException(status_code=400, detail="The proposal PDF is empty.")
        if len(pdf_bytes) > MAX_FILE_BYTES:
            raise HTTPException(status_code=413, detail="The proposal PDF is larger than 25 MB.")
    if pdf_bytes is None and document is None:
        raise HTTPException(status_code=400, detail="Send the proposal PDF.")

    try:
        result = await run_review(
            guidance=guidance, extraction_hash=extraction_hash, level=level, title=grant_title.strip(),
            pdf_bytes=pdf_bytes, document=document, previous=previous,
        )
    except UnreadableProposalError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    logger.info(
        "Proposal review level=%s status=%s overall=%s rules=%d/%d usage=%s reused=%s",
        result.level, result.status, result.scores.overall, result.scores.rules_met,
        result.scores.rules_total, result.usage, result.reused,
    )
    return result
