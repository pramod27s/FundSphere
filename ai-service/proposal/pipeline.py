"""Runs a proposal review: read (B), facts (B2), rule checks (C), AI review (D), scores (E).

Levels:
  * instant: everything except the AI review. One small AI call (facts),
    or none when the facts sections haven't changed since the last review.
  * full: adds the single AI review call.

With a previous review of the same draft series, unchanged work is reused:
the facts when their sections are unchanged, the whole AI review when no
section changed, and otherwise unchanged sections are sent as summaries.

Nothing is ever faked: a stage that fails is listed in `not_evaluated`,
its results are marked as such, and the review's status is "partial".
"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional

from llm.gateway import track_usage
from workspace.schemas import ProposalGuidance

from .document import find_headings_with_ai, needs_ai_headings, read_document
from .facts import extract_facts, fact_sections_hash
from .models import ProposalDocument, ReviewResult, RuleResult
from .review import SectionInput, criteria_for, review_with_ai, scope_rule
from .rules import check_code_rules, judgement_rules, structural_issues
from .scoring import compute_scores, is_complete, summary_from_rules

logger = logging.getLogger("proposal.pipeline")

# Above this share of changed words, a revision is reviewed in full.
INCREMENTAL_MAX_CHANGED_SHARE = 0.6
# Fewer words than this means a scanned or empty PDF.
MIN_PROPOSAL_WORDS = 50


class UnreadableProposalError(ValueError):
    """The PDF has (almost) no text: scanned or empty."""


async def run_review(
    *,
    guidance: ProposalGuidance,
    extraction_hash: str,
    level: str,
    title: str = "",
    pdf_bytes: Optional[bytes] = None,
    document: Optional[ProposalDocument] = None,
    previous: Optional[ReviewResult] = None,
) -> ReviewResult:
    if level not in {"instant", "full"}:
        raise ValueError("level must be 'instant' or 'full'")
    not_evaluated: List[str] = []
    reused: Dict[str, bool] = {"facts": False, "ai_review": False, "incremental": False}
    same_rules = previous is not None and previous.extraction_hash == extraction_hash

    with track_usage() as usage:
        # B. Read the proposal.
        if document is None:
            if pdf_bytes is None:
                raise ValueError("Send the proposal PDF or a previously read document")
            document, lines = read_document(pdf_bytes)
            if document.words < MIN_PROPOSAL_WORDS:
                raise UnreadableProposalError(
                    "This proposal PDF has almost no text we can read; it looks scanned. "
                    "Upload a PDF exported from Word or LaTeX instead."
                )
            if needs_ai_headings(document):
                document = await find_headings_with_ai(document, lines)

        # B2. Facts (reused when their sections didn't change).
        facts = None
        if same_rules and previous.facts is not None and fact_sections_hash(previous.document) == fact_sections_hash(document):
            facts = previous.facts
            reused["facts"] = True
        else:
            try:
                facts = await extract_facts(document)
            except Exception as exc:
                logger.warning("Facts extraction failed: %s", exc)
                not_evaluated.append("Budget, duration and team facts couldn't be read, so budget rules weren't checked.")

        # C. Rules code can check.
        rule_results: List[RuleResult] = check_code_rules(guidance, document, facts)
        issues = structural_issues(document, facts)

        # D. AI review.
        criteria = criteria_for(guidance)
        ai_rules = judgement_rules(guidance)
        scope = scope_rule(guidance)
        if scope:
            ai_rules.append(scope)
        notes, summary, top_fixes = [], "", []

        if level == "full":
            changed = _changed_sections(previous, document) if same_rules else None
            can_reuse_ai = (
                same_rules and previous.level == "full" and previous.status == "complete"
                and reused["facts"] and changed == []
            )
            if can_reuse_ai:
                rule_results += [r for r in previous.rules if r.checked_by == "ai"]
                criteria = previous.criteria
                issues += [i for i in previous.consistency_issues if i.found_by == "ai"]
                notes, summary, top_fixes = previous.section_notes, previous.summary, previous.top_fixes
                reused["ai_review"] = True
            else:
                sections = _section_inputs(document, previous if same_rules else None, changed)
                reused["incremental"] = any(not s.full for s in sections)
                try:
                    ai = await review_with_ai(
                        title=title, guidance=guidance, rules=ai_rules, criteria=criteria,
                        facts=facts, code_results=rule_results, sections=sections,
                    )
                    rule_results += ai.rules
                    criteria = ai.criteria
                    issues += ai.consistency_issues
                    notes = _merge_notes(previous, ai.section_notes, sections)
                    summary, top_fixes = ai.summary, ai.top_fixes
                except Exception as exc:
                    logger.warning("AI review failed: %s", exc)
                    not_evaluated.append("The AI review couldn't run (the AI service is busy or out of quota). Retry to get the quality score and judgement rules.")
                    rule_results += [_not_evaluated(r) for r in ai_rules]
                    criteria = [c.model_copy(update={"score": None, "reason": "Not evaluated."}) for c in criteria]
        else:
            criteria = [c.model_copy(update={"score": None, "reason": ""}) for c in criteria]

        scores = compute_scores(rule_results, criteria, level)
        if any(r.verdict == "not_evaluated" for r in rule_results) and not not_evaluated:
            not_evaluated.append("Some rules couldn't be checked; they're marked \"not evaluated\".")

    return ReviewResult(
        level=level,
        status="complete" if is_complete(rule_results, criteria, level) else "partial",
        extraction_hash=extraction_hash,
        document=document,
        facts=facts,
        rules=rule_results,
        criteria=criteria,
        consistency_issues=issues,
        section_notes=notes,
        summary=summary or summary_from_rules(rule_results, scores),
        top_fixes=top_fixes,
        scores=scores,
        not_evaluated=not_evaluated,
        reused=reused,
        usage=usage.summary(),
    )


def _not_evaluated(rule) -> RuleResult:
    return RuleResult(
        id=rule.id, text=rule.text, severity=rule.severity,
        kind="scope" if rule.id == "SCOPE" else rule.kind, checked_by="ai", verdict="not_evaluated",
        evidence="Not evaluated: the AI review didn't run.", section=rule.section,
        source_quote=rule.source_quote, source_page=rule.source_page,
    )


def _changed_sections(previous: Optional[ReviewResult], document: ProposalDocument) -> Optional[List[str]]:
    """Keys of sections that are new or changed since `previous`; None without one."""
    if previous is None:
        return None
    old = {s.key: s.hash for s in previous.document.sections}
    new = {s.key: s.hash for s in document.sections}
    changed = [k for k, h in new.items() if old.get(k) != h]
    removed = [k for k in old if k not in new]
    return changed + removed


def _section_inputs(document: ProposalDocument, previous: Optional[ReviewResult],
                    changed: Optional[List[str]]) -> List[SectionInput]:
    usable = previous is not None and previous.level == "full" and previous.status == "complete" and changed is not None
    if usable:
        changed_words = sum(s.words for s in document.sections if s.key in changed)
        if document.words and changed_words / document.words <= INCREMENTAL_MAX_CHANGED_SHARE:
            summaries = {n.key: n.summary for n in previous.section_notes}
            return [
                SectionInput(section=s, full=s.key in changed or not summaries.get(s.key), summary=summaries.get(s.key, ""))
                for s in document.sections
            ]
    return [SectionInput(section=s, full=True) for s in document.sections]


def _merge_notes(previous: Optional[ReviewResult], new_notes, sections: List[SectionInput]):
    if previous is None or all(s.full for s in sections):
        return new_notes
    by_key = {n.key: n for n in previous.section_notes}
    by_key.update({n.key: n for n in new_notes})
    return [by_key[s.section.key] for s in sections if s.section.key in by_key]
