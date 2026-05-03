import io
import logging

logger = logging.getLogger("proposal.pdf_extractor")

try:
    import pdfplumber
    _HAS_PDFPLUMBER = True
except ImportError:
    _HAS_PDFPLUMBER = False
    logger.warning("pdfplumber not installed; falling back to pypdf if available")

try:
    from pypdf import PdfReader
    _HAS_PYPDF = True
except ImportError:
    _HAS_PYPDF = False


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract all text from a PDF file's raw bytes.

    Tries pdfplumber first (best for academic / multi-column PDFs),
    falls back to pypdf if pdfplumber isn't installed. Returns an
    empty string on extraction failure rather than raising — the
    caller decides how to handle empty / image-only PDFs.
    """
    if not file_bytes:
        return ""

    if _HAS_PDFPLUMBER:
        try:
            return _extract_with_pdfplumber(file_bytes)
        except Exception as exc:
            logger.warning("pdfplumber failed (%s); trying pypdf fallback", exc)

    if _HAS_PYPDF:
        try:
            return _extract_with_pypdf(file_bytes)
        except Exception as exc:
            logger.error("pypdf extraction also failed: %s", exc)

    return ""


def _extract_with_pdfplumber(file_bytes: bytes) -> str:
    out = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            if page_text.strip():
                out.append(page_text)
    return "\n\n".join(out).strip()


def _extract_with_pypdf(file_bytes: bytes) -> str:
    out = []
    reader = PdfReader(io.BytesIO(file_bytes))
    for page in reader.pages:
        text = page.extract_text() or ""
        if text.strip():
            out.append(text)
    return "\n\n".join(out).strip()
