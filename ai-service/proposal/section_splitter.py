"""LLM-based proposal section splitter.

Sends the full proposal text to Gemini and asks it to identify the
component sections, mapping them to a canonical set of names so the
analyzer's prompts can refer to consistent labels.
"""
from __future__ import annotations

import logging
from typing import Dict

from .gemini_client import generate_json

logger = logging.getLogger("proposal.section_splitter")

CANONICAL_SECTIONS = [
    "Title / Cover Page",
    "Abstract",
    "Introduction",
    "Background",
    "Literature Review",
    "Problem Statement",
    "Objectives",
    "Research Questions",
    "Methodology",
    "Work Plan",
    "Timeline",
    "Expected Outcomes",
    "Impact",
    "Budget",
    "Budget Justification",
    "Team",
    "References",
    "Appendix",
]

SPLITTER_PROMPT = """You are an academic document parser. Split the grant proposal
below into its component sections.

Return ONLY a valid JSON object where keys are section names and values
are the FULL text of that section (do not summarize, copy verbatim).

Use these canonical section names whenever the content matches their
intent, even if the proposal uses different wording:
{canonical}

Rules:
- Map "Aims & Goals" -> "Objectives", "Approach" -> "Methodology", etc.
- If a section truly doesn't exist, omit it. Don't fabricate.
- Preserve the original ordering as much as possible.
- Do not include section headings inside the values; just the body.

PROPOSAL TEXT:
\"\"\"
{proposal_text}
\"\"\"
"""


async def split_into_sections(proposal_text: str) -> Dict[str, str]:
    """Split proposal text into a {section_name: section_body} mapping."""
    if not proposal_text.strip():
        return {}

    prompt = SPLITTER_PROMPT.format(
        canonical=", ".join(CANONICAL_SECTIONS),
        proposal_text=proposal_text,
    )

    try:
        result = await generate_json(prompt, temperature=0.1, max_output_tokens=16384)
    except Exception as exc:
        logger.error("Section splitter LLM call failed: %s", exc)
        return {"Full Proposal": proposal_text}

    # Models occasionally wrap the response: {"sections": {...}} or
    # {"data": {...}}. Unwrap one level if the top object has a single
    # dict-valued key whose value looks like our intended map.
    if isinstance(result, dict) and len(result) == 1:
        only_key = next(iter(result))
        only_val = result[only_key]
        if isinstance(only_val, dict) and only_val:
            logger.info("Splitter returned wrapped response under key %r; unwrapping.", only_key)
            result = only_val
        elif isinstance(only_val, list) and only_val:
            logger.info("Splitter returned wrapped list under key %r; unwrapping.", only_key)
            result = only_val

    # Some models return a LIST of section objects instead of a flat dict:
    # [{"Abstract": "..."}, {"Methodology": "..."}]  OR
    # [{"name": "Abstract", "body": "..."}, ...]
    # Merge either pattern into a single dict.
    if isinstance(result, list):
        merged: Dict[str, str] = {}
        for item in result:
            if not isinstance(item, dict) or not item:
                continue
            if len(item) == 1:
                k, v = next(iter(item.items()))
                if isinstance(k, str):
                    merged[k] = v if isinstance(v, str) else str(v)
                continue
            name = (
                item.get("name")
                or item.get("section_name")
                or item.get("section")
                or item.get("title")
            )
            body = (
                item.get("body")
                or item.get("content")
                or item.get("text")
            )
            if isinstance(name, str) and body is not None:
                merged[name] = body if isinstance(body, str) else str(body)
        if merged:
            logger.info(
                "Splitter returned list of %d items; merged into dict with %d sections.",
                len(result), len(merged),
            )
            result = merged

    if not isinstance(result, dict) or not result:
        logger.warning(
            "Section splitter returned unusable shape (type=%s, len=%s); "
            "preview=%r",
            type(result).__name__,
            len(result) if hasattr(result, "__len__") else "n/a",
            (str(result)[:200] if result else result),
        )
        return {"Full Proposal": proposal_text}

    cleaned: Dict[str, str] = {}
    skipped_non_string = 0
    for name, body in result.items():
        if not isinstance(name, str):
            skipped_non_string += 1
            continue
        # Accept list-of-strings bodies (some models split paragraphs into arrays).
        if isinstance(body, list):
            body = "\n".join(str(x) for x in body if isinstance(x, (str, int, float)))
        if not isinstance(body, str):
            skipped_non_string += 1
            continue
        body = body.strip()
        if body:
            cleaned[name.strip()] = body

    if not cleaned:
        logger.warning(
            "Section splitter produced empty cleaned dict (raw keys=%s, "
            "skipped non-string entries=%d).",
            list(result.keys())[:10],
            skipped_non_string,
        )
        return {"Full Proposal": proposal_text}

    logger.info("Section splitter produced %d sections: %s", len(cleaned), list(cleaned.keys()))
    return cleaned
