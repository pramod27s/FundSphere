"""Stage D: one AI call for everything that needs judgement.

It receives the judgement rules, the evaluation criteria, the measured facts,
what code has already decided, and the proposal (each section once). For a
revision, unchanged sections are sent as one-line summaries from the previous
review, so only changed text is paid for again.

The large shared content comes first and the instructions last, so Gemini's
implicit context caching can reuse the shared part across calls.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from llm.gateway import generate_json
from workspace.schemas import ProposalGuidance, ProposalRule

from .models import ConsistencyIssue, CriterionResult, Facts, RuleResult, Section, SectionNote

logger = logging.getLogger("proposal.review")

DEFAULT_CRITERIA = [
    ("Novelty and scientific merit", 25.0),
    ("Methodology and feasibility", 30.0),
    ("Relevance and impact", 15.0),
    ("Competence of the team", 15.0),
    ("Budget justification", 15.0),
]
SCOPE_RULE_ID = "SCOPE"


@dataclass
class SectionInput:
    section: Section
    full: bool               # False: send only `summary` (unchanged since the last review)
    summary: str = ""


@dataclass
class AIReview:
    rules: List[RuleResult]
    criteria: List[CriterionResult]
    consistency_issues: List[ConsistencyIssue]
    section_notes: List[SectionNote]
    summary: str
    top_fixes: List[str]


def criteria_for(guidance: ProposalGuidance) -> List[CriterionResult]:
    if guidance.criteria:
        return [CriterionResult(id=f"C{i}", name=c.name, marks=c.marks) for i, c in enumerate(guidance.criteria, 1)]
    return [CriterionResult(id=f"C{i}", name=n, marks=m, is_default=True) for i, (n, m) in enumerate(DEFAULT_CRITERIA, 1)]


def scope_rule(guidance: ProposalGuidance) -> Optional[ProposalRule]:
    if not guidance.scope:
        return None
    return ProposalRule(
        id=SCOPE_RULE_ID, text=f"The project fits the call's scope: {guidance.scope}",
        severity="critical", kind="judgement",
    )


_PROMPT = """You are an experienced reviewer on an Indian research funding committee. Review the proposal below against the call's rules and marking criteria.

## CALL
{call}

## RULES TO JUDGE
{rules}

## MARKING CRITERIA
{criteria}

## FACTS MEASURED FROM THE PROPOSAL
{facts}

## ALREADY CHECKED BY CODE (do not re-judge these; use them as context)
{code_results}

## PROPOSAL{incremental_note}
{sections}

## YOUR TASK
Return JSON exactly in this shape:
{{
  "rules": [{{"id": "R7", "verdict": "pass | partial | fail | manual", "evidence": "short quote from the proposal, or what is missing (max 40 words)", "section": "section key"}}],
  "criteria": [{{"id": "C1", "score": 1, "reason": "why, citing the proposal (max 40 words)", "fix": "the single most useful change (max 30 words)"}}],
  "consistency_issues": [{{"issue": "one sentence", "sections_involved": ["work_plan", "methodology"], "severity": "critical | important | minor", "suggestion": "concrete fix"}}],
  "sections": [{{"key": "methodology", "summary": "what this section says (max 20 words)", "strength": "max 20 words", "improvement": "max 25 words"}}],
  "summary": "two sentences on the proposal's chances and its biggest problem",
  "top_fixes": ["the 3-5 changes that would most improve the proposal, most important first"]
}}

Rules for your answer:
- SCOPE: "fail" when the project's main discipline or type of work isn't among what the call funds, or is explicitly excluded, even if it uses some technical methods.
- Give a verdict for EVERY rule listed under RULES TO JUDGE, using its id. Use "manual" only when the rule can't be judged from the text at all (e.g. margins, binding, signatures on paper); never fail a rule just because the text doesn't show it.
- Score EVERY criterion from 1 (poor) to 5 (excellent), as a strict committee member would. A proposal that breaks critical rules should not get 5s.
- consistency_issues: contradictions BETWEEN sections that are not already listed under ALREADY CHECKED BY CODE. Check in particular: the duration in the facts against the work described (seasons, years, field campaigns); every objective has a method, an outcome and budget support; every person given a role in the methodology appears in the team; budget items are needed by the methodology and allowed by the rules. Use the facts for numbers. Report only real contradictions; return an empty list if there are none.
- "sections": one entry for each section shown in full above.
- Never invent requirements that are not in the rules or criteria.
"""


async def review_with_ai(
    *,
    title: str,
    guidance: ProposalGuidance,
    rules: List[ProposalRule],
    criteria: List[CriterionResult],
    facts: Optional[Facts],
    code_results: List[RuleResult],
    sections: List[SectionInput],
) -> AIReview:
    """Raises if the call fails; the pipeline then reports these parts as not evaluated."""
    incremental = any(not s.full for s in sections)
    prompt = _PROMPT.format(
        call=_call_text(title, guidance),
        rules="\n".join(f"{r.id} [{r.severity}]: {r.text}" for r in rules) or "(none)",
        criteria="\n".join(f"{c.id}: {c.name}" + (f" ({c.marks:g} marks)" if c.marks else "") for c in criteria),
        facts=json.dumps(facts.model_dump(exclude_none=True), ensure_ascii=False) if facts else "(not available)",
        code_results="\n".join(f"{r.id} {r.verdict.upper()}: {r.text}. {r.evidence}" for r in code_results) or "(none)",
        incremental_note=(
            "\n(Sections marked UNCHANGED were reviewed before; only their summary is shown. Judge the whole proposal using them.)"
            if incremental else ""
        ),
        sections="\n\n".join(_section_text(s) for s in sections),
    )
    raw = await generate_json(
        prompt, task="review", temperature=0.2, max_output_tokens=8192, retries=1, thinking_budget=1024,
    )
    if not isinstance(raw, dict):
        raise ValueError("Review response was not an object")
    return _parse(raw, rules, criteria, [s.section for s in sections if s.full])


def _call_text(title: str, guidance: ProposalGuidance) -> str:
    lines = []
    if title:
        lines.append(f"Call: {title}")
    if guidance.scope:
        lines.append(f"Scope: {guidance.scope}")
    return "\n".join(lines) or "(not stated)"


def _section_text(item: SectionInput) -> str:
    s = item.section
    head = f"### [{s.key}] {s.title} (pages {s.page_start}-{s.page_end}, {s.words} words)"
    if item.full:
        return f"{head}\n{s.text}"
    return f"{head} UNCHANGED\nSummary: {item.summary or '(no summary)'}"


def _parse(raw: Dict[str, Any], rules: List[ProposalRule], criteria: List[CriterionResult],
           full_sections: List[Section]) -> AIReview:
    by_id = {r.id: r for r in rules}
    rule_results: Dict[str, RuleResult] = {}
    for entry in raw.get("rules") or []:
        if not isinstance(entry, dict):
            continue
        rule = by_id.get(str(entry.get("id") or "").strip())
        verdict = str(entry.get("verdict") or "").strip().lower()
        if rule is None or verdict not in {"pass", "partial", "fail", "manual"}:
            continue
        rule_results[rule.id] = RuleResult(
            id=rule.id, text=rule.text, severity=rule.severity,
            kind="scope" if rule.id == SCOPE_RULE_ID else rule.kind, checked_by="ai",
            verdict=verdict, evidence=str(entry.get("evidence") or "").strip()[:500],
            section=rule.section or (str(entry.get("section")).strip() if entry.get("section") else None),
            source_quote=rule.source_quote, source_page=rule.source_page,
        )
    # A rule the model skipped is reported, not guessed.
    for rule in rules:
        rule_results.setdefault(rule.id, RuleResult(
            id=rule.id, text=rule.text, severity=rule.severity,
            kind="scope" if rule.id == SCOPE_RULE_ID else rule.kind, checked_by="ai",
            verdict="not_evaluated", evidence="The AI review didn't return a verdict for this rule.",
            section=rule.section, source_quote=rule.source_quote, source_page=rule.source_page,
        ))

    scores = {}
    for entry in raw.get("criteria") or []:
        if isinstance(entry, dict):
            try:
                scores[str(entry.get("id")).strip()] = (
                    max(1, min(5, int(round(float(entry.get("score")))))),
                    str(entry.get("reason") or "").strip()[:500],
                    str(entry.get("fix") or "").strip()[:400],
                )
            except (TypeError, ValueError):
                continue
    criteria_results = []
    for c in criteria:
        score, reason, fix = scores.get(c.id, (None, "Not evaluated.", ""))
        criteria_results.append(c.model_copy(update={"score": score, "reason": reason, "fix": fix}))

    issues = []
    for entry in raw.get("consistency_issues") or []:
        if isinstance(entry, dict) and str(entry.get("issue") or "").strip():
            severity = str(entry.get("severity") or "important").lower()
            issues.append(ConsistencyIssue(
                issue=str(entry["issue"]).strip()[:500],
                sections_involved=[str(s) for s in entry.get("sections_involved") or []][:6],
                severity=severity if severity in {"critical", "important", "minor"} else "important",
                suggestion=str(entry.get("suggestion") or "").strip()[:400],
                found_by="ai",
            ))

    valid_keys = {s.key for s in full_sections}
    notes = [
        SectionNote(key=str(e.get("key")), summary=str(e.get("summary") or "")[:300],
                    strength=str(e.get("strength") or "")[:300], improvement=str(e.get("improvement") or "")[:300])
        for e in raw.get("sections") or [] if isinstance(e, dict) and str(e.get("key")) in valid_keys
    ]
    top_fixes = [str(f).strip() for f in raw.get("top_fixes") or [] if str(f).strip()][:5]
    return AIReview(
        rules=list(rule_results.values()), criteria=criteria_results, consistency_issues=issues,
        section_notes=notes, summary=str(raw.get("summary") or "").strip()[:800], top_fixes=top_fixes,
    )
