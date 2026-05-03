"""FastAPI router for proposal analysis."""
from __future__ import annotations

import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from . import analysis_cache
from .analyzer import analyze_deep, analyze_simple
from .pdf_extractor import extract_text_from_pdf
from .schemas import ProposalAnalysisResponse

logger = logging.getLogger("proposal.routes")

router = APIRouter(prefix="/proposal", tags=["proposal"])

MAX_FILE_BYTES = 25 * 1024 * 1024  # 25 MB
MIN_TEXT_CHARS = 200


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.post("/analyze", response_model=ProposalAnalysisResponse)
async def analyze_proposal(
    proposal_pdf: UploadFile = File(...),
    guidelines_pdf: UploadFile = File(...),
    grant_title: str = Form(default=""),
    mode: str = Form(default="simple"),
    force: bool = Form(default=False),
):
    """Analyze a grant proposal PDF against a guidelines PDF.

    `mode`:
      - "simple" — single LLM call, ~10s
      - "deep"   — section-by-section analysis, ~30-90s

    `force`:
      - false (default) — return a cached result if the exact same
        (proposal, guidelines, title, mode) tuple was analyzed before.
        Same input → same output, instantly, no tokens spent.
      - true — bypass the cache and re-run analysis (cache is updated
        with the new result).
    """
    mode_normalized = (mode or "simple").strip().lower()
    if mode_normalized not in {"simple", "deep"}:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mode '{mode}'. Use 'simple' or 'deep'.",
        )

    proposal_bytes = await _read_pdf_upload(proposal_pdf, label="proposal")
    guidelines_bytes = await _read_pdf_upload(guidelines_pdf, label="guidelines")

    cache_key = analysis_cache.make_key(
        proposal_bytes, guidelines_bytes, grant_title, mode_normalized
    )
    if not force:
        cached = analysis_cache.get(cache_key)
        if cached is not None:
            return cached

    proposal_text = extract_text_from_pdf(proposal_bytes)
    guidelines_text = extract_text_from_pdf(guidelines_bytes)

    if len(proposal_text) < MIN_TEXT_CHARS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not extract enough text from the proposal PDF "
                f"(got {len(proposal_text)} characters). The file may be "
                "scanned/image-based — try running OCR first."
            ),
        )
    if len(guidelines_text) < MIN_TEXT_CHARS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not extract enough text from the guidelines PDF "
                f"(got {len(guidelines_text)} characters). The file may be "
                "scanned/image-based — try running OCR first."
            ),
        )

    try:
        if mode_normalized == "deep":
            result = await analyze_deep(proposal_text, guidelines_text, grant_title.strip())
        else:
            result = await analyze_simple(proposal_text, guidelines_text, grant_title.strip())
    except Exception as exc:
        logger.exception("Proposal analysis failed")
        msg = str(exc).lower()
        # Detect "all LLM providers exhausted" and surface a meaningful 503 so
        # the frontend can show a useful message instead of "Bad Gateway".
        if (
            "gemini + groq exhausted" in msg
            or "resource_exhausted" in msg
            or ("429" in msg and "groq" in msg)
        ):
            raise HTTPException(
                status_code=503,
                detail=(
                    "AI providers are temporarily rate-limited "
                    "(daily quota reached). Please try again in a few minutes "
                    "or switch to Quick mode which uses fewer calls."
                ),
            )
        raise HTTPException(status_code=500, detail=f"Proposal analysis failed: {exc}")

    analysis_cache.put(cache_key, result)
    return result


async def _read_pdf_upload(upload: UploadFile, *, label: str) -> bytes:
    filename = (upload.filename or "").lower()
    if not filename.endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail=f"The {label} file must be a PDF (got '{upload.filename}').",
        )

    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail=f"The {label} PDF is empty.")
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"The {label} PDF is too large (limit: 25 MB).",
        )
    return data
