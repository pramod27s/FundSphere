"""Stage E: scores, computed in code from the rule and criterion results.

* Quality (0-100): the criteria weighted by their marks in the guidelines
  (equal weights when the guidelines give none). A criterion scored 5/5
  earns all its marks.
* Overall: quality, capped at 49 while a critical rule fails that code
  verified (a measured limit, a missing section, a forbidden item), because a
  proposal that breaks a rule that gets it returned can't be "good"; capped
  at 20 when the project is outside the call's scope. Critical rules failed
  by AI judgement are reported but don't cap the score, since the judgement
  may be wrong.
* Rules marked "manual" (can't be judged from a PDF) are shown, not scored.
* Nothing that wasn't evaluated is turned into a number: a missing criterion
  score leaves quality empty instead of guessing.
"""
from __future__ import annotations

from typing import List

from .models import CriterionResult, RuleResult, Scores
from .sections import LABELS

CRITICAL_CAP = 49
OUT_OF_SCOPE_CAP = 20
_NOT_SCORED = {"not_evaluated", "manual"}


def compute_scores(rules: List[RuleResult], criteria: List[CriterionResult], level: str) -> Scores:
    evaluated = [r for r in rules if r.verdict not in _NOT_SCORED]
    critical_failed = sum(1 for r in evaluated if r.severity == "critical" and r.verdict == "fail")
    scores = Scores(
        rules_met=sum(1 for r in evaluated if r.verdict == "pass"),
        rules_partial=sum(1 for r in evaluated if r.verdict == "partial"),
        rules_total=len(evaluated),
        critical_failed=critical_failed,
    )
    if level != "full" or not criteria or any(c.score is None for c in criteria):
        return scores

    weights = [c.marks if c.marks else 1.0 for c in criteria]
    quality = round(100 * sum(w * c.score / 5 for w, c in zip(weights, criteria)) / sum(weights))
    scores.quality = quality
    out_of_scope = any(r.kind == "scope" and r.verdict == "fail" for r in rules)
    cap = OUT_OF_SCOPE_CAP if out_of_scope else CRITICAL_CAP if verified_critical_failures(rules) else 100
    scores.overall = min(quality, cap)
    scores.capped = quality > cap
    return scores


def verified_critical_failures(rules: List[RuleResult]) -> List[RuleResult]:
    """Critical failures that code verified; these are what make a proposal likely to be returned."""
    return [r for r in rules if r.severity == "critical" and r.verdict == "fail" and r.checked_by == "code"]


def is_complete(rules: List[RuleResult], criteria: List[CriterionResult], level: str) -> bool:
    if any(r.verdict == "not_evaluated" for r in rules):
        return False
    return level != "full" or all(c.score is not None for c in criteria)


def summary_from_rules(rules: List[RuleResult], scores: Scores) -> str:
    """Plain summary used for the Instant check and when the AI summary is missing."""
    if not scores.rules_total:
        return "No rules could be checked yet."
    text = f"{scores.rules_met} of {scores.rules_total} rules met."
    critical = verified_critical_failures(rules)
    if critical:
        names = "; ".join(_short(r) for r in critical[:3])
        more = f" and {len(critical) - 3} more" if len(critical) > 3 else ""
        text += f" Likely to be returned: {len(critical)} rule(s) that cause rejection are not met ({names}{more})."
    elif scores.rules_met == scores.rules_total:
        text += " Nothing found that would get the proposal returned."
    return text


def _short(rule: RuleResult) -> str:
    if rule.kind == "section_required" and rule.section:
        return f"missing {LABELS.get(rule.section, rule.section).lower()}"
    return rule.text[:60].rstrip(".")
