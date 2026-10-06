"""Canonical proposal sections, shared by the guidelines extractor and the
proposal reader so both sides use the same names.

The set is deliberately coarse ("work_plan" covers timeline and Gantt chart,
"budget" covers its justification): guidelines rarely distinguish these, and
finer names produced false "missing section" reports in the old pipeline.
"""
from __future__ import annotations

import re
from typing import Optional

CANONICAL_SECTIONS = [
    "title",
    "abstract",
    "introduction",
    "objectives",
    "methodology",
    "work_plan",
    "expected_outcomes",
    "budget",
    "team",
    "references",
]

LABELS = {
    "title": "Title",
    "abstract": "Abstract",
    "introduction": "Introduction",
    "objectives": "Objectives",
    "methodology": "Methodology",
    "work_plan": "Work plan and timeline",
    "expected_outcomes": "Expected outcomes",
    "budget": "Budget",
    "team": "Investigators",
    "references": "References",
}

# Heading wording that maps to each section (matched at the start of a heading,
# after any numbering). Order matters: more specific patterns first.
_SYNONYMS = [
    ("budget", r"budget|financial (requirements?|estimates?|support)|cost (estimates?|break-?up)|estimated cost|funds? required"),
    ("work_plan", r"work ?plan|time ?line|time ?frame|schedule|gantt|milestones?|plan of (work|action)|activity (chart|plan)"),
    ("expected_outcomes", r"expected (outcomes?|results?|outputs?|deliverables?)|deliverables?|outcomes?|anticipated (results?|outcomes?)|impact"),
    ("objectives", r"objectives?|aims?( and objectives?)?|specific aims?|goals?|research questions?"),
    ("methodology", r"methodology|methods?|approach|research (design|plan)|materials and methods|work ?flow|experimental (design|plan)"),
    ("introduction", r"introduction|background|origin of (the )?proposal|rationale|literature (review|survey)|review of literature|state of (the )?art|problem statement|motivation|(national and international )?status of research"),
    ("abstract", r"abstract|summary|executive summary|project summary"),
    ("team", r"investigators?|(project |research )?team|principal investigator|details of (the )?(pi|investigators?)|personnel|bio-?data|curriculum vitae|cv"),
    ("references", r"references|bibliography|works cited|literature cited"),
    ("title", r"title( of (the )?project)?"),
]
_SYNONYM_RE = [(key, re.compile(rf"^(?:{pattern})\b", re.IGNORECASE)) for key, pattern in _SYNONYMS]
_NUMBERING = re.compile(r"^\s*(?:section\s+)?(?:\d+(?:\.\d+)*|[ivxlc]+|[a-h])[.):\-\s]\s*", re.IGNORECASE)


def canonical_for_heading(text: str) -> Optional[str]:
    """Map a heading line to a canonical section, or None."""
    cleaned = _NUMBERING.sub("", (text or "").strip(), count=1).strip(" :-–")
    for key, pattern in _SYNONYM_RE:
        if pattern.match(cleaned):
            return key
    return None


def normalise_section_key(value: object) -> Optional[str]:
    """Accept a canonical key, a label, or loose wording from the LLM."""
    if not isinstance(value, str) or not value.strip():
        return None
    v = value.strip().lower().replace("-", "_").replace(" ", "_")
    if v in CANONICAL_SECTIONS:
        return v
    return canonical_for_heading(value.replace("_", " "))
