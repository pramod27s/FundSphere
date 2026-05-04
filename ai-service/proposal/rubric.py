"""Structured rubric extracted once from a guidelines document.

Why this exists: previously every section eval re-sent the full guidelines
text to the LLM (10k+ tokens each). For an 8-section deep analysis that's
~80k of duplicated guideline tokens per run. Here we extract a structured
rubric ONCE per grant, cache by content hash, and feed only the relevant
slice into each section eval. Same accuracy, ~70% fewer tokens on deep mode.

The rubric also subsumes `_detect_missing_sections` — once we know the
required sections from extraction, "missing" is set arithmetic, not an
LLM call.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
from collections import OrderedDict
from typing import List, Optional

from pydantic import BaseModel, Field

from .gemini_client import generate_json

logger = logging.getLogger("proposal.rubric")


# Canonical section keys (lowercase) — must align with section_splitter.CANONICAL_SECTIONS.
CANONICAL_SECTION_KEYS = [
    "title / cover page",
    "abstract",
    "introduction",
    "background",
    "literature review",
    "problem statement",
    "objectives",
    "research questions",
    "methodology",
    "work plan",
    "timeline",
    "expected outcomes",
    "impact",
    "budget",
    "budget justification",
    "team",
    "references",
    "appendix",
]


class RubricRequirement(BaseModel):
    requirement: str
    # Lowercase canonical section names this requirement applies to, or ["all"].
    applies_to: List[str] = Field(default_factory=lambda: ["all"])


class GrantRubric(BaseModel):
    required_sections: List[str] = Field(default_factory=list)
    requirements: List[RubricRequirement] = Field(default_factory=list)
    formatting_rules: List[str] = Field(default_factory=list)
    eligibility: List[str] = Field(default_factory=list)

    def is_usable(self) -> bool:
        # If extraction came back nearly empty the caller should fall back to
        # raw-guidelines prompts rather than feeding a useless rubric.
        return len(self.requirements) >= 3 or len(self.required_sections) >= 3

    def for_section(self, section_name: str) -> List[RubricRequirement]:
        """Requirements that apply to a given proposal section.

        Substring match in either direction so splitter-produced names like
        "Introduction/Background" still pick up rubric tags like "introduction".
        """
        n = (section_name or "").strip().lower()
        out: List[RubricRequirement] = []
        for r in self.requirements:
            for tag in r.applies_to:
                if tag == "all" or tag in n or n in tag:
                    out.append(r)
                    break
        return out

    def render_section_requirements(self, section_name: str) -> str:
        reqs = self.for_section(section_name)
        if not reqs:
            return "(no rubric requirements specifically target this section — evaluate against general grant-proposal best practices)"
        return "\n".join(f"R{i}. {r.requirement}" for i, r in enumerate(reqs, 1))

    def render_full_brief(self) -> str:
        parts: List[str] = []
        if self.required_sections:
            parts.append("REQUIRED SECTIONS:\n- " + "\n- ".join(self.required_sections))
        if self.requirements:
            lines = ["REQUIREMENTS:"]
            for i, r in enumerate(self.requirements, 1):
                applies = ", ".join(r.applies_to) or "all"
                lines.append(f"R{i} [{applies}]: {r.requirement}")
            parts.append("\n".join(lines))
        if self.formatting_rules:
            parts.append("FORMATTING:\n- " + "\n- ".join(self.formatting_rules))
        if self.eligibility:
            parts.append("ELIGIBILITY:\n- " + "\n- ".join(self.eligibility))
        return "\n\n".join(parts) if parts else "(empty rubric)"


# --- cache --------------------------------------------------------------------

_MAX_RUBRICS = int(os.getenv("PROPOSAL_RUBRIC_CACHE_MAX", "50"))
_rubric_cache: "OrderedDict[str, GrantRubric]" = OrderedDict()
_rubric_locks: "dict[str, asyncio.Lock]" = {}


def _hash_guidelines(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


async def get_rubric(guidelines_text: str) -> Optional[GrantRubric]:
    """Return cached rubric for these guidelines or extract a fresh one.

    Returns None if extraction fails or yields a rubric too sparse to be
    useful — callers should fall back to raw-guidelines prompts in that case.
    Concurrent calls for the same guidelines coalesce on a per-key lock so
    we don't pay the extraction cost more than once.
    """
    if not guidelines_text or not guidelines_text.strip():
        return None

    key = _hash_guidelines(guidelines_text)
    cached = _rubric_cache.get(key)
    if cached is not None:
        _rubric_cache.move_to_end(key)
        return cached

    lock = _rubric_locks.setdefault(key, asyncio.Lock())
    async with lock:
        # Re-check under lock — another coroutine may have populated it.
        cached = _rubric_cache.get(key)
        if cached is not None:
            _rubric_cache.move_to_end(key)
            return cached

        try:
            rubric = await _extract_rubric(guidelines_text)
        except Exception as exc:
            logger.warning("Rubric extraction failed; caller will use raw guidelines: %s", exc)
            _rubric_locks.pop(key, None)
            return None

        if not rubric.is_usable():
            logger.info("Extracted rubric too sparse (reqs=%d, required_sections=%d); skipping cache.",
                        len(rubric.requirements), len(rubric.required_sections))
            _rubric_locks.pop(key, None)
            return None

        _rubric_cache[key] = rubric
        _rubric_cache.move_to_end(key)
        while len(_rubric_cache) > _MAX_RUBRICS:
            _rubric_cache.popitem(last=False)
        _rubric_locks.pop(key, None)
        logger.info("Rubric extracted and cached (reqs=%d, required_sections=%d).",
                    len(rubric.requirements), len(rubric.required_sections))
        return rubric


def clear_cache() -> None:
    _rubric_cache.clear()


# --- extraction ---------------------------------------------------------------

RUBRIC_PROMPT = """You are extracting a structured evaluation rubric from a
grant guidelines document so that grant proposals can be assessed against the
rubric without re-reading the full guidelines text.

## GRANT GUIDELINES
\"\"\"
{guidelines}
\"\"\"

## CANONICAL SECTION NAMES
Use these exact lowercase names in `applies_to` and `required_sections`:
{canonical_sections}

Return ONLY a valid JSON object with this exact schema:
{{
  "required_sections": ["<canonical lowercase section name>", "..."],
  "requirements": [
    {{
      "requirement": "<one concise imperative sentence stating what the proposal must do>",
      "applies_to": ["<canonical section name>", "..."]
    }}
  ],
  "formatting_rules": ["<page limit, font, margins, file format, etc.>"],
  "eligibility": ["<who can apply, geographic/institutional/career-stage restrictions>"]
}}

Rules:
- "applies_to" must contain ONLY canonical lowercase section names from the
  list above, OR the literal "all" if the requirement applies proposal-wide
  (e.g. "must be written in English"). Never invent section names.
- Each requirement is one imperative sentence: "Budget must itemize personnel
  costs by role" — not "The budget should consider that...".
- Do NOT invent requirements. If guidelines are silent on something, omit it.
- Aim for 8-25 requirements total — be thorough but avoid redundancy.
- "required_sections" is the canonical-name list of sections every proposal
  MUST contain (explicitly required or strongly implied by guidelines).
"""


async def _extract_rubric(guidelines_text: str) -> GrantRubric:
    prompt = RUBRIC_PROMPT.format(
        guidelines=guidelines_text,
        canonical_sections=", ".join(CANONICAL_SECTION_KEYS),
    )
    raw = await generate_json(prompt, temperature=0.1, max_output_tokens=4096, retries=1)
    if not isinstance(raw, dict):
        raise ValueError(f"rubric response was {type(raw).__name__}, expected object")

    return GrantRubric(
        required_sections=_clean_canonical_list(raw.get("required_sections")),
        requirements=_clean_requirements(raw.get("requirements")),
        formatting_rules=_clean_string_list(raw.get("formatting_rules")),
        eligibility=_clean_string_list(raw.get("eligibility")),
    )


def _clean_string_list(value) -> List[str]:
    if not isinstance(value, list):
        return []
    out: List[str] = []
    for item in value:
        if isinstance(item, str):
            s = item.strip()
            if s:
                out.append(s)
    return out


def _clean_canonical_list(value) -> List[str]:
    """Lowercase, strip, drop anything not in the canonical list."""
    canonical_set = set(CANONICAL_SECTION_KEYS)
    out: List[str] = []
    for s in _clean_string_list(value):
        norm = s.lower().strip()
        # Tolerate light variants (e.g. "intro" -> "introduction") via substring.
        if norm in canonical_set:
            out.append(norm)
            continue
        match = next((c for c in CANONICAL_SECTION_KEYS if c in norm or norm in c), None)
        if match:
            out.append(match)
    # Dedupe preserving order.
    seen = set()
    deduped = []
    for s in out:
        if s not in seen:
            seen.add(s)
            deduped.append(s)
    return deduped


def _clean_requirements(value) -> List[RubricRequirement]:
    if not isinstance(value, list):
        return []
    out: List[RubricRequirement] = []
    canonical_set = set(CANONICAL_SECTION_KEYS) | {"all"}
    for item in value:
        if not isinstance(item, dict):
            continue
        text = str(item.get("requirement") or "").strip()
        if not text:
            continue
        applies_raw = item.get("applies_to")
        if not isinstance(applies_raw, list):
            applies_raw = ["all"]
        applies: List[str] = []
        for tag in applies_raw:
            if not isinstance(tag, str):
                continue
            t = tag.strip().lower()
            if not t:
                continue
            if t in canonical_set:
                applies.append(t)
            else:
                match = next((c for c in CANONICAL_SECTION_KEYS if c in t or t in c), None)
                if match:
                    applies.append(match)
        if not applies:
            applies = ["all"]
        out.append(RubricRequirement(requirement=text, applies_to=applies))
    return out


def match_section_to_canonical(splitter_name: str) -> Optional[str]:
    """Map a splitter-produced section name to a canonical rubric key.

    Used to compute missing-sections from the rubric without an LLM call.
    Returns None if no canonical key matches.
    """
    n = (splitter_name or "").strip().lower()
    if not n:
        return None
    for c in CANONICAL_SECTION_KEYS:
        if c == n or c in n or n in c:
            return c
    return None
