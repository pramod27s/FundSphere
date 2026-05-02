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

    if not isinstance(result, dict) or not result:
        return {"Full Proposal": proposal_text}

    cleaned: Dict[str, str] = {}
    for name, body in result.items():
        if not isinstance(name, str) or not isinstance(body, str):
            continue
        body = body.strip()
        if body:
            cleaned[name.strip()] = body
    return cleaned or {"Full Proposal": proposal_text}
