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
from typing import Any, Dict, List, Optional

from pydantic import ValidationError

from .gemini_client import generate_json
from .rubric import GrantRubric, get_rubric, match_section_to_canonical
from .schemas import Citation, ProposalAnalysisResponse, SectionFeedback
from .section_splitter import split_into_sections

logger = logging.getLogger("proposal.analyzer")


# ---------------------------------------------------------------------------
# Phase 1: single-prompt analysis
# ---------------------------------------------------------------------------

SIMPLE_ANALYSIS_PROMPT_RUBRIC = """You are an expert grant proposal reviewer.

You will score the proposal against a STRUCTURED RUBRIC extracted from the
grant guidelines. Every score must be grounded in specific rubric requirements
plus quoted/paraphrased excerpts from the proposal — generic feedback is
unacceptable.

## RUBRIC
{rubric_brief}

## RESEARCHER'S PROPOSAL
\"\"\"
{proposal}
\"\"\"

{grant_context}

Return ONLY a single valid JSON object with this exact schema (no markdown,
no commentary):

{{
  "overall_score": <integer 0-100>,
  "summary": "<2-3 sentence overall assessment>",
  "section_feedback": [
    {{
      "section_name": "<section name>",
      "status": "strong" | "weak" | "missing",
      "score": <integer 0-100>,
      "feedback": "<2-3 specific sentences citing actual rubric/guideline requirements>",
      "suggestions": ["<actionable improvement>", "..."],
      "citations": [
        {{
          "requirement": "<the rubric requirement being addressed, copied or closely paraphrased>",
          "proposal_excerpt": "<short quote/paraphrase from the proposal showing whether the requirement is met, max 200 chars>"
        }}
      ]
    }}
  ],
  "missing_sections": ["<section name required by the rubric/guidelines but absent from the proposal>"],
  "key_suggestions": ["<top 3-5 highest-impact changes to make>"]
}}

Evaluate AT MINIMUM these standard proposal sections (mark absent ones as
"missing" with score 0 and include them in `missing_sections`):
Abstract, Introduction/Background, Objectives, Methodology,
Expected Outcomes/Impact, Budget Justification, Timeline, References.

If the rubric's `required_sections` lists additional sections beyond these,
include those too. Score and give suggestions for EVERY section listed —
do not omit any.

Rules:
- Each non-missing section MUST include at least 2 actionable suggestions
  AND at least one citation. A citation with an empty `proposal_excerpt`
  is invalid — write "(not addressed)" if the requirement is uncovered.
- Be specific — reference exact rubric requirements that the proposal fails
  to satisfy. Do not include generic advice.
- Status "missing" is only valid for absent sections; never for ones that exist.
- Do not invent rubric requirements. Only cite what's in the rubric above.
"""


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

    rubric = await get_rubric(guidelines_text)
    if rubric is not None:
        prompt = SIMPLE_ANALYSIS_PROMPT_RUBRIC.format(
            rubric_brief=rubric.render_full_brief(),
            proposal=proposal_text,
            grant_context=grant_context,
        )
    else:
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

SECTION_EVAL_PROMPT_RUBRIC = """You are reviewing ONE section of a grant
proposal against the rubric requirements that apply to it.

## APPLICABLE RUBRIC REQUIREMENTS
{requirements_text}

## SECTION BEING REVIEWED: {section_name}
\"\"\"
{section_text}
\"\"\"

{grant_context}

Return ONLY one valid JSON object:
{{
  "section_name": "{section_name}",
  "status": "strong" | "weak",
  "score": <integer 0-100>,
  "feedback": "<2-4 sentences citing specific requirements from the list above>",
  "suggestions": ["<specific actionable improvement>", "..."],
  "citations": [
    {{
      "requirement": "<the rubric requirement being addressed (copy or close paraphrase)>",
      "proposal_excerpt": "<short quote or paraphrase from this section showing whether the requirement is met, max 200 chars>"
    }}
  ]
}}

Rules:
- Cite at least one requirement per applicable rubric item, met or unmet.
  Empty citations is invalid.
- A citation's `proposal_excerpt` must be non-empty. If the section omits a
  requirement entirely, write "(not addressed)" as the excerpt.
- Status "missing" is not allowed — the section exists, you're reviewing it.
- Score reflects coverage: meets nearly all = 85+, meets most = 65-84,
  meets some = 40-64, meets few = under 40.
"""


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

    # Step 1: extract the rubric ONCE (cached). Failure → fall back to
    # raw-guidelines prompts; everything below tolerates rubric=None.
    rubric = await get_rubric(guidelines_text)

    # Step 2: split the proposal into named sections.
    sections = await split_into_sections(proposal_text)
    if not sections:
        return await analyze_simple(proposal_text, guidelines_text, grant_title)

    # Step 3: evaluate each section in parallel. With a rubric we send only
    # the slice that applies to that section; without one we fall back to
    # full guidelines (legacy path).
    section_tasks = [
        _evaluate_section(name, text, guidelines_text, grant_context, rubric)
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

    # Step 4: detect missing sections. With a rubric this is set arithmetic
    # (no LLM call). Without one we fall back to the LLM detector.
    if rubric is not None and rubric.required_sections:
        missing_sections = _missing_from_rubric(rubric, list(sections.keys()))
    else:
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

    # Step 5: aggregate score.
    scores = [fb.score for fb in section_feedback] or [0]
    overall_score = max(0, min(100, sum(scores) // len(scores)))

    # Step 6: ask the LLM for a holistic summary + top suggestions.
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
    rubric: Optional[GrantRubric] = None,
) -> SectionFeedback:
    if rubric is not None:
        prompt = SECTION_EVAL_PROMPT_RUBRIC.format(
            requirements_text=rubric.render_section_requirements(section_name),
            section_name=section_name,
            section_text=section_text,
            grant_context=grant_context,
        )
    else:
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
    raw["citations"] = _coerce_citations(raw.get("citations"))

    if raw["status"] == "missing":
        # The section exists (we're reviewing it), so missing is not a valid label here.
        raw["status"] = "weak"

    return SectionFeedback(**raw)


def _missing_from_rubric(rubric: GrantRubric, found_section_names: List[str]) -> List[str]:
    """Compute missing required sections via set arithmetic — no LLM call."""
    required = set(rubric.required_sections)
    if not required:
        return []
    found_canonical = {
        c for c in (match_section_to_canonical(n) for n in found_section_names) if c
    }
    return sorted(required - found_canonical)


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
                    citations=_coerce_citations(entry.get("citations")),
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


def _coerce_citations(value: Any) -> List[Citation]:
    if not isinstance(value, list):
        return []
    out: List[Citation] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        requirement = str(item.get("requirement") or "").strip()
        if not requirement:
            continue
        excerpt = str(item.get("proposal_excerpt") or item.get("excerpt") or "").strip()
        # Cap excerpt length defensively — the prompt asks for ≤200 chars
        # but models occasionally ignore that.
        if len(excerpt) > 400:
            excerpt = excerpt[:397] + "..."
        out.append(Citation(requirement=requirement, proposal_excerpt=excerpt))
    return out


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
