"""Core proposal-analysis logic.

Two modes:
* `analyze_simple` — single Gemini call with both full documents in context.
  Fast (~10s), good enough for a quick compliance check.
* `analyze_deep`   — splits the proposal into sections, evaluates each
  against the FULL guidelines, and detects missing required sections.
  Slower (~30-90s) but produces granular per-section feedback.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List

from pydantic import ValidationError

from .gemini_client import generate_json
from .schemas import ProposalAnalysisResponse, SectionFeedback
from .section_splitter import split_into_sections

logger = logging.getLogger("proposal.analyzer")


# ---------------------------------------------------------------------------
# Phase 1: single-prompt analysis
# ---------------------------------------------------------------------------

SIMPLE_ANALYSIS_PROMPT = """You are an expert grant proposal reviewer with deep
experience evaluating academic and applied research proposals.

You will receive two documents:

## GRANT GUIDELINES (the rules the proposal must meet)
\"\"\"
{guidelines}
\"\"\"

## RESEARCHER'S PROPOSAL (the submission to be reviewed)
\"\"\"
{proposal}
\"\"\"

{grant_context}

Carefully analyze the proposal against the guidelines and return ONLY a
single valid JSON object with this exact schema (no markdown, no commentary):

{{
  "overall_score": <integer 0-100, overall compliance percentage>,
  "summary": "<2-3 sentence overall assessment>",
  "section_feedback": [
    {{
      "section_name": "<canonical section name>",
      "status": "strong" | "weak" | "missing",
      "score": <integer 0-100>,
      "feedback": "<2-3 specific sentences citing actual guideline requirements>",
      "suggestions": ["<actionable improvement>", "..."]
    }}
  ],
  "missing_sections": ["<section name required by guidelines but absent from the proposal>"],
  "key_suggestions": ["<top 3-5 highest-impact changes to make>"]
}}

Evaluate at minimum these sections (mark absent ones as "missing" with score 0):
Abstract, Introduction/Background, Objectives, Methodology,
Expected Outcomes/Impact, Budget Justification, Timeline, References.

Be specific — reference exact guideline requirements that the proposal
fails to satisfy. Do not include generic advice. Do not invent sections
that the guidelines do not require.
"""


async def analyze_simple(
    proposal_text: str,
    guidelines_text: str,
    grant_title: str = "",
) -> Dict[str, Any]:
    grant_context = (
        f"## TARGET GRANT\nGrant being applied to: {grant_title}\n"
        if grant_title.strip()
        else ""
    )
    prompt = SIMPLE_ANALYSIS_PROMPT.format(
        guidelines=guidelines_text,
        proposal=proposal_text,
        grant_context=grant_context,
    )

    raw = await generate_json(prompt, temperature=0.2, max_output_tokens=8192, retries=1)

    response = _coerce_to_response(raw, mode="simple", grant_title=grant_title)
    return response.model_dump()


# ---------------------------------------------------------------------------
# Phase 2: section-by-section deep analysis
# ---------------------------------------------------------------------------

SECTION_EVAL_PROMPT = """You are reviewing ONE section of a grant proposal
against the COMPLETE grant guidelines.

## FULL GRANT GUIDELINES
\"\"\"
{guidelines}
\"\"\"

## SECTION BEING REVIEWED: {section_name}
\"\"\"
{section_text}
\"\"\"

{grant_context}

Evaluate this section against EVERY relevant requirement in the guidelines.
Return ONLY one valid JSON object with this exact schema:

{{
  "section_name": "{section_name}",
  "status": "strong" | "weak" | "missing",
  "score": <integer 0-100>,
  "feedback": "<2-4 sentences citing exact guideline requirements that this section does or does not meet>",
  "suggestions": ["<specific actionable improvement>", "..."]
}}

Be precise. Quote or closely paraphrase guideline requirements where useful.
If the section is essentially empty or generic, score it 30 or below and
mark it "weak". Never call a section "missing" — it exists, you're reviewing it.
"""


MISSING_SECTIONS_PROMPT = """Below are the GRANT GUIDELINES and the SECTIONS
that were FOUND in a researcher's proposal.

## GRANT GUIDELINES
\"\"\"
{guidelines}
\"\"\"

## SECTIONS FOUND IN PROPOSAL
{found_sections}

Return ONLY a valid JSON object of the form:
{{ "missing_sections": ["<required section name>", "..."] }}

Only list sections that the guidelines explicitly require or strongly imply.
Do not list "nice to have" extras. If nothing is missing, return an empty list.
"""


SUMMARY_PROMPT = """You are summarizing a multi-section grant-proposal review.

Section results (JSON):
{section_results}

Missing sections: {missing}
Overall score: {overall_score}

Return ONLY a JSON object of the form:
{{
  "summary": "<2-3 sentence executive summary of the proposal's compliance, strengths, and biggest gaps>",
  "key_suggestions": ["<top 3-5 highest-impact actions the researcher should take>"]
}}
"""


async def analyze_deep(
    proposal_text: str,
    guidelines_text: str,
    grant_title: str = "",
) -> Dict[str, Any]:
    grant_context = (
        f"## TARGET GRANT\nGrant being applied to: {grant_title}\n"
        if grant_title.strip()
        else ""
    )

    # Step 1: split the proposal into named sections.
    sections = await split_into_sections(proposal_text)
    if not sections:
        return await analyze_simple(proposal_text, guidelines_text, grant_title)

    # Step 2: evaluate each section in parallel against the full guidelines.
    section_tasks = [
        _evaluate_section(name, text, guidelines_text, grant_context)
        for name, text in sections.items()
    ]
    section_results = await asyncio.gather(*section_tasks, return_exceptions=True)

    section_feedback: List[SectionFeedback] = []
    for name, result in zip(sections.keys(), section_results):
        if isinstance(result, Exception):
            logger.warning("Section eval failed for '%s': %s", name, result)
            section_feedback.append(
                SectionFeedback(
                    section_name=name,
                    status="weak",
                    score=40,
                    feedback="Automated evaluation failed for this section. A reviewer should inspect it manually.",
                    suggestions=[
                        "Re-run the analysis or review this section manually for compliance.",
                    ],
                )
            )
        else:
            section_feedback.append(result)

    # Step 3: detect missing sections required by the guidelines.
    missing_sections = await _detect_missing_sections(
        guidelines_text, list(sections.keys())
    )
    for ms in missing_sections:
        if any(fb.section_name.lower() == ms.lower() for fb in section_feedback):
            continue
        section_feedback.append(
            SectionFeedback(
                section_name=ms,
                status="missing",
                score=0,
                feedback=f"The guidelines require a '{ms}' section but it was not found in the proposal.",
                suggestions=[
                    f"Add a '{ms}' section addressing the relevant guideline requirements.",
                ],
            )
        )

    # Step 4: aggregate score.
    scores = [fb.score for fb in section_feedback] or [0]
    overall_score = max(0, min(100, sum(scores) // len(scores)))

    # Step 5: ask the LLM for a holistic summary + top suggestions.
    summary, key_suggestions = await _summarize(
        section_feedback, missing_sections, overall_score
    )

    return ProposalAnalysisResponse(
        overall_score=overall_score,
        summary=summary,
        section_feedback=section_feedback,
        missing_sections=missing_sections,
        key_suggestions=key_suggestions,
        mode="deep",
        grant_title=grant_title,
    ).model_dump()


async def _evaluate_section(
    section_name: str,
    section_text: str,
    guidelines_text: str,
    grant_context: str,
) -> SectionFeedback:
    prompt = SECTION_EVAL_PROMPT.format(
        guidelines=guidelines_text,
        section_name=section_name,
        section_text=section_text,
        grant_context=grant_context,
    )
    raw = await generate_json(prompt, temperature=0.2, max_output_tokens=2048, retries=1)
    if not isinstance(raw, dict):
        raise ValueError(f"Section eval returned non-object: {type(raw).__name__}")

    raw.setdefault("section_name", section_name)
    raw["status"] = _normalize_status(raw.get("status"))
    raw["score"] = _clamp_int(raw.get("score"), default=50)
    raw["suggestions"] = _coerce_string_list(raw.get("suggestions"))
    raw["feedback"] = str(raw.get("feedback") or "").strip() or "No detailed feedback returned."

    if raw["status"] == "missing":
        # The section exists (we're reviewing it), so missing is not a valid label here.
        raw["status"] = "weak"

    return SectionFeedback(**raw)


async def _detect_missing_sections(
    guidelines_text: str, found_section_names: List[str]
) -> List[str]:
    prompt = MISSING_SECTIONS_PROMPT.format(
        guidelines=guidelines_text,
        found_sections=", ".join(found_section_names) or "(none)",
    )
    try:
        raw = await generate_json(prompt, temperature=0.1, max_output_tokens=1024)
    except Exception as exc:
        logger.warning("Missing-section detection failed: %s", exc)
        return []

    if isinstance(raw, list):
        return _coerce_string_list(raw)
    if isinstance(raw, dict):
        return _coerce_string_list(raw.get("missing_sections"))
    return []


async def _summarize(
    section_feedback: List[SectionFeedback],
    missing: List[str],
    overall_score: int,
) -> tuple[str, List[str]]:
    payload = [
        {
            "section": fb.section_name,
            "status": fb.status,
            "score": fb.score,
            "feedback": fb.feedback,
        }
        for fb in section_feedback
    ]
    prompt = SUMMARY_PROMPT.format(
        section_results=payload,
        missing=missing or "(none)",
        overall_score=overall_score,
    )

    try:
        raw = await generate_json(prompt, temperature=0.3, max_output_tokens=1024)
    except Exception as exc:
        logger.warning("Summary generation failed, falling back to deterministic text: %s", exc)
        return _deterministic_summary(section_feedback, missing, overall_score), _fallback_suggestions(
            section_feedback
        )

    summary = ""
    suggestions: List[str] = []
    if isinstance(raw, dict):
        summary = str(raw.get("summary") or "").strip()
        suggestions = _coerce_string_list(raw.get("key_suggestions"))

    if not summary:
        summary = _deterministic_summary(section_feedback, missing, overall_score)
    if not suggestions:
        suggestions = _fallback_suggestions(section_feedback)
    return summary, suggestions[:5]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _coerce_to_response(
    raw: Any, *, mode: str, grant_title: str
) -> ProposalAnalysisResponse:
    if not isinstance(raw, dict):
        raise ValueError("Analyzer LLM returned a non-object response")

    section_feedback_in = raw.get("section_feedback") or []
    section_feedback: List[SectionFeedback] = []
    for entry in section_feedback_in:
        if not isinstance(entry, dict):
            continue
        try:
            section_feedback.append(
                SectionFeedback(
                    section_name=str(entry.get("section_name") or "Unnamed Section"),
                    status=_normalize_status(entry.get("status")),
                    score=_clamp_int(entry.get("score"), default=50),
                    feedback=str(entry.get("feedback") or "").strip()
                    or "No specific feedback returned.",
                    suggestions=_coerce_string_list(entry.get("suggestions")),
                )
            )
        except ValidationError as exc:
            logger.debug("Skipping malformed section_feedback entry: %s", exc)

    missing_sections = _coerce_string_list(raw.get("missing_sections"))
    for ms in missing_sections:
        if any(fb.section_name.lower() == ms.lower() for fb in section_feedback):
            continue
        section_feedback.append(
            SectionFeedback(
                section_name=ms,
                status="missing",
                score=0,
                feedback=f"The guidelines require a '{ms}' section but it was not found in the proposal.",
                suggestions=[f"Add a '{ms}' section addressing the relevant guideline requirements."],
            )
        )

    overall_score = _clamp_int(raw.get("overall_score"), default=0)
    if overall_score == 0 and section_feedback:
        overall_score = sum(fb.score for fb in section_feedback) // len(section_feedback)

    summary = str(raw.get("summary") or "").strip() or _deterministic_summary(
        section_feedback, missing_sections, overall_score
    )

    key_suggestions = _coerce_string_list(raw.get("key_suggestions"))
    if not key_suggestions:
        key_suggestions = _fallback_suggestions(section_feedback)

    return ProposalAnalysisResponse(
        overall_score=overall_score,
        summary=summary,
        section_feedback=section_feedback,
        missing_sections=missing_sections,
        key_suggestions=key_suggestions[:5],
        mode=mode,
        grant_title=grant_title,
    )


def _normalize_status(value: Any) -> str:
    if not isinstance(value, str):
        return "weak"
    v = value.strip().lower()
    if v in {"strong", "weak", "missing"}:
        return v
    if v in {"good", "excellent", "great"}:
        return "strong"
    if v in {"poor", "bad", "needs improvement", "needs_improvement"}:
        return "weak"
    if v in {"absent", "not present", "not_present"}:
        return "missing"
    return "weak"


def _clamp_int(value: Any, *, default: int) -> int:
    try:
        n = int(round(float(value)))
    except (TypeError, ValueError):
        return default
    return max(0, min(100, n))


def _coerce_string_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    out: List[str] = []
    for item in value:
        if isinstance(item, str):
            cleaned = item.strip()
            if cleaned:
                out.append(cleaned)
        elif isinstance(item, dict):
            text = item.get("text") or item.get("suggestion") or item.get("name")
            if isinstance(text, str) and text.strip():
                out.append(text.strip())
    return out


def _deterministic_summary(
    section_feedback: List[SectionFeedback],
    missing: List[str],
    overall_score: int,
) -> str:
    strong = sum(1 for fb in section_feedback if fb.status == "strong")
    weak = sum(1 for fb in section_feedback if fb.status == "weak")
    miss = len(missing)
    tail = (
        "Focus on adding the missing sections first."
        if miss > 0
        else "Focus on strengthening the weakest sections."
    )
    return (
        f"The proposal scores {overall_score}% overall compliance. "
        f"{strong} sections are strong, {weak} need improvement, "
        f"and {miss} required sections are missing. {tail}"
    )


def _fallback_suggestions(section_feedback: List[SectionFeedback]) -> List[str]:
    out: List[str] = []
    for fb in section_feedback:
        if fb.status in {"weak", "missing"}:
            out.extend(fb.suggestions[:2])
    # Dedupe while preserving order.
    seen = set()
    deduped = []
    for s in out:
        if s not in seen:
            seen.add(s)
            deduped.append(s)
    return deduped[:5]
