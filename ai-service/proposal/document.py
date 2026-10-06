"""Stage B: read the proposal PDF into sections, word counts and fonts, in code.

Headings are found with rules (known section names, numbered headings,
"Title:" lines). Only when fewer than three sections are recognised is the
AI asked, and then it sees only short candidate lines and returns line
numbers: about a hundred output tokens instead of re-writing the whole
proposal, which is what the old section splitter did.
"""
from __future__ import annotations

import hashlib
import io
import logging
import re
from collections import Counter
from dataclasses import dataclass
from typing import List, Optional, Tuple

from llm.gateway import generate_json
from workspace.quote_check import normalise

from .models import FontInfo, ProposalDocument, Section
from .sections import CANONICAL_SECTIONS, canonical_for_heading, normalise_section_key

logger = logging.getLogger("proposal.document")

try:
    import pdfplumber
except ImportError:  # pragma: no cover - pdfplumber is in requirements.txt
    pdfplumber = None

MAX_HEADING_WORDS = 8
MIN_RULE_SECTIONS = 3
_NUMBERED_HEADING = re.compile(r"^\s*(?:\d+(?:\.\d+)*|[IVXLC]+)[.)]\s+[A-Z][^.]{2,70}$")
_PARENTHETICAL = re.compile(r"\s*\([^)]*\)\s*$")


@dataclass
class _Line:
    page: int
    text: str


def read_document(pdf_bytes: bytes) -> Tuple[ProposalDocument, List[_Line]]:
    """Pages, fonts and rule-based sections. Also returns the raw lines so the
    caller can ask the AI for headings when the rules found too few."""
    pages_text, font, layout = _read_pdf(pdf_bytes)
    lines = [
        _Line(page=index, text=line.strip())
        for index, page_text in enumerate(pages_text, start=1)
        for line in page_text.splitlines()
        if line.strip()
    ]
    headings = _find_headings(lines)
    doc = ProposalDocument(
        page_count=len(pages_text),
        words=sum(len(l.text.split()) for l in lines),
        font=font,
        paper=layout.get("paper"),
        line_spacing=layout.get("line_spacing"),
        line_spacing_ratio=layout.get("line_spacing_ratio"),
        sections=_build_sections(lines, headings),
        headings_found_by="rules",
    )
    return doc, lines


def needs_ai_headings(doc: ProposalDocument) -> bool:
    return len(doc.canonical_sections()) < MIN_RULE_SECTIONS


async def find_headings_with_ai(doc: ProposalDocument, lines: List[_Line]) -> ProposalDocument:
    """Ask the AI which short lines are section headings. Keeps the rule-based
    result if the AI call fails or finds no more sections than the rules did."""
    candidates = [(i, l) for i, l in enumerate(lines) if len(l.text.split()) <= 12 and len(l.text) <= 100]
    if not candidates:
        return doc
    listing = "\n".join(f"{i}: {l.text[:70]}" for i, l in candidates[:400])
    prompt = (
        "Below are short lines from a research proposal, each with its line number. "
        "Pick the lines that are section headings and map each to one of these section keys: "
        f"{', '.join(CANONICAL_SECTIONS)}, or \"other\" for a heading that fits none of them.\n\n"
        f"{listing}\n\n"
        'Return JSON: {"headings": [{"line": 12, "section": "methodology"}]}'
    )
    try:
        raw = await generate_json(prompt, task="headings", temperature=0.0, max_output_tokens=1024, thinking_budget=0)
    except Exception as exc:
        logger.warning("AI heading detection failed; keeping rule-based sections: %s", exc)
        return doc

    headings: List[Tuple[int, Optional[str]]] = []
    for entry in (raw.get("headings") if isinstance(raw, dict) else None) or []:
        if not isinstance(entry, dict):
            continue
        try:
            index = int(entry.get("line"))
        except (TypeError, ValueError):
            continue
        if 0 <= index < len(lines):
            section = entry.get("section")
            headings.append((index, None if section == "other" else normalise_section_key(section)))
    headings.sort()
    ai_doc = doc.model_copy(update={"sections": _build_sections(lines, headings), "headings_found_by": "ai"})
    if len(ai_doc.canonical_sections()) > len(doc.canonical_sections()):
        return ai_doc
    return doc


# --- PDF reading ----------------------------------------------------------------

def _read_pdf(pdf_bytes: bytes) -> Tuple[List[str], FontInfo, dict]:
    """Page texts, the dominant font, and layout (paper size, line spacing)."""
    if pdfplumber is not None:
        try:
            fonts: Counter = Counter()
            pages: List[str] = []
            gaps: List[float] = []
            paper = None
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                for page in pdf.pages:
                    if paper is None:
                        paper = _paper_name(float(page.width), float(page.height))
                    pages.append(page.extract_text() or "")
                    for ch in page.chars:
                        if ch.get("text", "").strip():
                            fonts[(_font_family(ch.get("fontname", "")), round(float(ch.get("size", 0)) * 2) / 2)] += 1
                    tops = sorted({round(float(w["top"]), 1) for w in page.extract_words()})
                    gaps.extend(b - a for a, b in zip(tops, tops[1:]))
            font = _dominant_font(fonts)
            return pages, font, {"paper": paper, **_line_spacing(gaps, font.size)}
        except Exception as exc:
            logger.warning("pdfplumber failed (%s); trying pypdf without font data", exc)
    from proposal.pdf_extractor import extract_pages
    return extract_pages(pdf_bytes), FontInfo(), {}


_PAPERS = {"A4": (595, 842), "Letter": (612, 792), "Legal": (612, 1008)}


def _paper_name(width: float, height: float) -> str:
    short, long_ = sorted((width, height))
    for name, (w, h) in _PAPERS.items():
        if abs(short - w) <= 6 and abs(long_ - h) <= 6:
            return name
    return f"{round(width)}x{round(height)} pt"


def _line_spacing(gaps: List[float], size: Optional[float]) -> dict:
    """Median gap between consecutive text lines, relative to the font size.
    Single spacing is about 1.15-1.4 times the font size, 1.5 lines about 1.7,
    double about 2.3."""
    if not size:
        return {}
    usable = sorted(g for g in gaps if 0.8 * size <= g <= 3.5 * size)
    if len(usable) < 10:
        return {}
    ratio = round(usable[len(usable) // 2] / size, 2)
    spacing = 1.0 if ratio < 1.5 else 1.5 if ratio < 2.0 else 2.0
    return {"line_spacing": spacing, "line_spacing_ratio": ratio}


def _font_family(fontname: str) -> str:
    """'ABCDEF+TimesNewRomanPSMT' -> 'TimesNewRomanPSMT'."""
    return fontname.split("+", 1)[-1] if fontname else ""


def _dominant_font(fonts: Counter) -> FontInfo:
    total = sum(fonts.values())
    if not total:
        return FontInfo()
    (family, size), count = fonts.most_common(1)[0]
    return FontInfo(family=family or None, size=size or None, share=round(count / total, 3))


# --- Headings and sections ----------------------------------------------------------

def _find_headings(lines: List[_Line]) -> List[Tuple[int, Optional[str]]]:
    headings: List[Tuple[int, Optional[str]]] = []
    for index, line in enumerate(lines):
        text = line.text
        if text.lower().startswith("title:"):
            headings.append((index, "title"))
            continue
        bare = _PARENTHETICAL.sub("", text).strip().rstrip(":").strip()
        if not bare or len(bare.split()) > MAX_HEADING_WORDS + 2:
            continue
        stripped_numbering = re.sub(r"^\s*(?:\d+(?:\.\d+)*|[IVXLC]+)[.)]\s*", "", bare)
        if len(stripped_numbering.split()) > MAX_HEADING_WORDS or stripped_numbering.endswith("."):
            continue
        canonical = canonical_for_heading(bare)
        if canonical:
            headings.append((index, canonical))
        elif _NUMBERED_HEADING.match(text) and not text.rstrip().endswith("."):
            headings.append((index, None))
    return headings


def _build_sections(lines: List[_Line], headings: List[Tuple[int, Optional[str]]]) -> List[Section]:
    sections: List[Section] = []
    used_keys: Counter = Counter()
    boundaries = sorted(headings)

    def add(title: str, canonical: Optional[str], body_lines: List[_Line], fallback_page: int) -> None:
        text = "\n".join(l.text for l in body_lines).strip()
        if not text and canonical != "title":
            return
        base = canonical or "other"
        used_keys[base] += 1
        key = base if used_keys[base] == 1 else f"{base}-{used_keys[base]}"
        pages = [l.page for l in body_lines] or [fallback_page]
        sections.append(Section(
            key=key, canonical=canonical, title=title[:200],
            page_start=min(pages), page_end=max(pages),
            words=len(text.split()), text=text,
            hash=hashlib.sha256(normalise(text).encode("utf-8")).hexdigest()[:16],
        ))

    if not boundaries:
        if lines:
            add("Full proposal", None, lines, lines[0].page)
        return sections

    first = boundaries[0][0]
    if first > 0:
        add(lines[0].text, "title", lines[:first], lines[0].page)

    for n, (index, canonical) in enumerate(boundaries):
        end = boundaries[n + 1][0] if n + 1 < len(boundaries) else len(lines)
        heading = lines[index]
        body = lines[index + 1 : end]
        if canonical == "title" and heading.text.lower().startswith("title:"):
            body = [_Line(heading.page, heading.text.split(":", 1)[1].strip())] + body
        add(heading.text, canonical, body, heading.page)
    return sections
