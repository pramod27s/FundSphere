"""Stage C: check the countable rules in code.

Every function here is pure: it takes the guidance from the guidelines, the
measured document and the facts, and returns verdicts with evidence. Rules
that need judgement are left for the AI review (stage D).
"""
from __future__ import annotations

import re
from typing import List, Optional

from workspace.schemas import ProposalGuidance, ProposalRule

from .models import ConsistencyIssue, Facts, ProposalDocument, RuleResult
from .sections import LABELS

CODE_KINDS = {"limit", "forbidden_item", "needs_evidence"}
_FACT_METRICS = {"budget_total", "overhead_percent", "overhead_amount", "duration_months", "item_cost"}
# Words that name the thing being bought, not the proof (extraction sometimes adds them).
_GENERIC_WORDS = {"equipment", "item", "cost", "purchase", "instrument", "asset"}
_FONT_ALIASES = {"times": ("times",), "arial": ("arial", "helvetica"), "helvetica": ("helvetica", "arial"),
                 "calibri": ("calibri",), "cambria": ("cambria",)}


def check_code_rules(guidance: ProposalGuidance, doc: ProposalDocument, facts: Optional[Facts]) -> List[RuleResult]:
    """Required sections plus every limit / forbidden_item / needs_evidence rule."""
    results = [_check_section(key, doc) for key in guidance.required_sections]
    for rule in guidance.rules:
        if rule.kind == "limit":
            results.append(_check_limit(rule, doc, facts))
        elif rule.kind == "forbidden_item":
            results.append(_check_forbidden(rule, doc, facts))
        elif rule.kind == "needs_evidence":
            results.append(_check_evidence(rule, doc, facts))
    return results


def judgement_rules(guidance: ProposalGuidance) -> List[ProposalRule]:
    return [r for r in guidance.rules if r.kind not in CODE_KINDS]


# --- individual checks -------------------------------------------------------------

def _result(rule: ProposalRule, verdict: str, evidence: str) -> RuleResult:
    return RuleResult(
        id=rule.id, text=rule.text, severity=rule.severity, kind=rule.kind, checked_by="code",
        verdict=verdict, evidence=evidence, section=rule.section,
        source_quote=rule.source_quote, source_page=rule.source_page,
    )


def _check_section(key: str, doc: ProposalDocument) -> RuleResult:
    label = LABELS.get(key, key)
    found = doc.sections_for(key)
    if found:
        evidence = f'Found "{found[0].title}" on page {found[0].page_start}.'
        verdict = "pass"
    else:
        evidence = f"No {label.lower()} section was found."
        verdict = "fail"
    return RuleResult(
        id=f"S-{key}", text=f"Include the {label.lower()} section", severity="critical",
        kind="section_required", checked_by="code", verdict=verdict, evidence=evidence, section=key,
    )


def _compare(actual: float, operator: str, limit: float, tolerance: float = 0.0) -> bool:
    if operator == "max":
        return actual <= limit + tolerance
    if operator == "min":
        return actual >= limit - tolerance
    return abs(actual - limit) <= tolerance


def _fmt(value: float) -> str:
    return f"{value:g}"


def _limit_text(rule: ProposalRule) -> str:
    word = {"max": "at most", "min": "at least", "equals": "exactly"}.get(rule.operator or "", "")
    return f"{word} {_fmt(rule.value)} {rule.unit or ''}".strip()


def _check_limit(rule: ProposalRule, doc: ProposalDocument, facts: Optional[Facts]) -> RuleResult:
    metric, op = rule.metric, rule.operator or "max"

    if metric in _FACT_METRICS and facts is None:
        return _result(rule, "not_evaluated", "The budget and work plan couldn't be read, so this wasn't checked.")

    if metric == "pages":
        pages = doc.page_count
        note = ""
        if "exclud" in rule.text.lower() and "reference" in rule.text.lower():
            refs = doc.sections_for("references")
            if refs:
                pages -= max(0, refs[-1].page_end - refs[0].page_start)
                note = " (not counting reference pages)"
        ok = _compare(pages, op, float(rule.value))
        return _result(rule, "pass" if ok else "fail", f"The proposal has {pages} pages{note}; the rule is {_limit_text(rule)}.")

    if metric == "words":
        if rule.section:
            sections = doc.sections_for(rule.section)
            if not sections:
                return _result(rule, "fail", f"No {LABELS.get(rule.section, rule.section).lower()} section was found to count.")
            words, where = sum(s.words for s in sections), f"The {LABELS.get(rule.section, rule.section).lower()} has"
        else:
            words, where = doc.words, "The proposal has"
        ok = _compare(words, op, float(rule.value))
        return _result(rule, "pass" if ok else "fail", f"{where} {words} words; the limit is {_limit_text(rule)}.")

    if metric == "font_size":
        if doc.font.size is None:
            return _result(rule, "not_evaluated", "The PDF doesn't contain font information.")
        ok = _compare(doc.font.size, op, float(rule.value), tolerance=0.6)
        return _result(rule, "pass" if ok else "fail", f"Most text is {_fmt(doc.font.size)} pt; the rule is {_limit_text(rule)}.")

    if metric == "paper_size":
        if not doc.paper:
            return _result(rule, "manual", "The paper size couldn't be read from the PDF; check it yourself.")
        ok = doc.paper.lower() == str(rule.value).strip().lower()
        return _result(rule, "pass" if ok else "fail", f"The pages are {doc.paper}; the rule asks for {rule.value}.")

    if metric == "line_spacing":
        if doc.line_spacing is None:
            return _result(rule, "manual", "The line spacing couldn't be measured; check it yourself.")
        ok = _compare(doc.line_spacing, op, float(rule.value), tolerance=0.25)
        names = {1.0: "single", 1.5: "1.5 lines", 2.0: "double"}
        return _result(rule, "pass" if ok else "fail",
                       f"Lines are {names.get(doc.line_spacing, doc.line_spacing)}-spaced (line gap {doc.line_spacing_ratio}x the font size); "
                       f"the rule asks for {names.get(float(rule.value), rule.value)} spacing.")

    if metric == "font_family":
        if not doc.font.family:
            return _result(rule, "not_evaluated", "The PDF doesn't contain font information.")
        ok = _same_font(doc.font.family, str(rule.value))
        return _result(rule, "pass" if ok else "fail", f"Most text is in {doc.font.family}; the rule asks for {rule.value}.")

    budget = facts.budget if facts else None
    if metric == "budget_total":
        if not budget or budget.total_lakh is None:
            return _result(rule, "partial", "No budget total was found in the proposal.")
        ok = _compare(budget.total_lakh, op, float(rule.value))
        return _result(rule, "pass" if ok else "fail", f"The budget total is Rs. {_fmt(budget.total_lakh)} lakh; the cap is Rs. {_fmt(rule.value)} lakh.")

    if metric == "overhead_percent":
        percent = budget.overhead_percent if budget else None
        if percent is None and budget and budget.overhead_lakh is not None and budget.total_lakh:
            percent = round(100 * budget.overhead_lakh / budget.total_lakh, 1)
        if percent is None:
            return _result(rule, "partial", "No overhead charge was found in the budget.")
        ok = _compare(percent, op, float(rule.value), tolerance=0.05)
        return _result(rule, "pass" if ok else "fail", f"Overhead is {_fmt(percent)}%; the rule is {_limit_text(rule)}.")

    if metric == "overhead_amount":
        if not budget or budget.overhead_lakh is None:
            return _result(rule, "partial", "No overhead amount was found in the budget.")
        ok = _compare(budget.overhead_lakh, op, float(rule.value))
        return _result(rule, "pass" if ok else "fail", f"Overhead is Rs. {_fmt(budget.overhead_lakh)} lakh; the cap is Rs. {_fmt(rule.value)} lakh.")

    if metric == "duration_months":
        if facts.duration_months is None:
            return _result(rule, "partial", "No project duration was found in the work plan.")
        ok = _compare(facts.duration_months, op, float(rule.value))
        return _result(rule, "pass" if ok else "fail", f"The project runs {_fmt(facts.duration_months)} months; the rule is {_limit_text(rule)}.")

    if metric == "item_cost":
        over = [i for i in _purchases(budget, rule) if i.cost_lakh > float(rule.value)]
        if over:
            listed = ", ".join(f"{i.name} (Rs. {_fmt(i.cost_lakh)} lakh)" for i in over)
            return _result(rule, "fail", f"Above the Rs. {_fmt(rule.value)} lakh limit: {listed}.")
        return _result(rule, "pass", f"No item costs more than Rs. {_fmt(rule.value)} lakh.")

    return _result(rule, "not_evaluated", "This kind of limit can't be measured yet.")


def _check_forbidden(rule: ProposalRule, doc: ProposalDocument, facts: Optional[Facts]) -> RuleResult:
    names = [i.name for i in (facts.budget.items if facts and facts.budget else [])]
    budget_text = " ".join(s.text for s in doc.sections_for("budget"))
    hits = []
    for keyword in rule.keywords:
        pattern = re.compile(rf"\b{re.escape(keyword.rstrip('s'))}s?\b", re.IGNORECASE)
        for name in names:
            if pattern.search(name) and name not in hits:
                hits.append(name)
        if not names and pattern.search(budget_text):
            hits.append(keyword)
    if hits:
        return _result(rule, "fail", f"The budget includes: {', '.join(hits)}.")
    if facts is None and not budget_text:
        return _result(rule, "not_evaluated", "The budget couldn't be read, so this wasn't checked.")
    return _result(rule, "pass", f"Nothing in the budget matches: {', '.join(rule.keywords)}.")


def _check_evidence(rule: ProposalRule, doc: ProposalDocument, facts: Optional[Facts]) -> RuleResult:
    if facts is None:
        return _result(rule, "not_evaluated", "The budget couldn't be read, so this wasn't checked.")
    threshold = float(rule.value)
    over = [i for i in _purchases(facts.budget, rule) if i.cost_lakh > threshold]
    if not over:
        return _result(rule, "pass", f"No item costs more than Rs. {_fmt(threshold)} lakh, so no extra evidence is needed.")
    text = doc.full_text().lower()
    proof_words = [k for k in rule.keywords if k.rstrip("s") not in _GENERIC_WORDS] or ["quotation"]
    found = [k for k in proof_words if k.rstrip("s") in text]
    listed = ", ".join(f"{i.name} (Rs. {_fmt(i.cost_lakh)} lakh)" for i in over)
    if found:
        return _result(rule, "pass", f"{listed} is above Rs. {_fmt(threshold)} lakh, and the proposal mentions {found[0]}.")
    return _result(rule, "fail", f"{listed} is above Rs. {_fmt(threshold)} lakh, but the proposal doesn't mention {' or '.join(proof_words)}.")


_NOT_A_PURCHASE = re.compile(
    r"\b(jrf|srf|fellow(ship)?|salary|salaries|stipend|manpower|associate|assistant|staff|personnel|"
    r"overhead|travel|contingency|honorarium|wages?)\b", re.IGNORECASE)


def _purchases(budget, rule: ProposalRule):
    """Budget items that are things bought, with a cost. For an equipment rule,
    only equipment (by head, when heads are given)."""
    items = [i for i in (budget.items if budget else []) if i.cost_lakh is not None]
    items = [i for i in items if not _NOT_A_PURCHASE.search(f"{i.name} {i.head or ''}")]
    if "equipment" in rule.text.lower() and any(i.head for i in items):
        items = [i for i in items if not i.head or "equip" in i.head.lower() or "instrument" in i.head.lower()]
    return items


def _same_font(actual: str, wanted: str) -> bool:
    actual_l = re.sub(r"[^a-z]", "", actual.lower())
    first = re.sub(r"[^a-z]", "", (wanted.split() or [""])[0].lower())
    return any(alias in actual_l for alias in _FONT_ALIASES.get(first, (first,)))


def structural_issues(doc: ProposalDocument, facts: Optional[Facts]) -> List[ConsistencyIssue]:
    """Contradictions code can find from the document and facts alone:
    a numbered objective with no method, and a Co-PI referred to in the text
    but missing from the team."""
    issues: List[ConsistencyIssue] = []
    issues.extend(_objectives_without_method(doc, facts))
    issues.extend(_co_pi_missing(doc, facts))
    return issues


_OBJECTIVE_LABEL = re.compile(r"\bobjective\s*(\d+)\b", re.IGNORECASE)
_NUMBERED_ITEM = re.compile(r"^\s*(\d+)[.)]\s+\S", re.MULTILINE)


def _objectives_without_method(doc: ProposalDocument, facts: Optional[Facts]) -> List[ConsistencyIssue]:
    objective_sections = doc.sections_for("objectives")
    methods = " ".join(s.text for s in doc.sections_for("methodology"))
    if not objective_sections or not methods:
        return []
    numbers = {int(n) for n in _NUMBERED_ITEM.findall(objective_sections[0].text)}
    if facts and facts.objectives:
        numbers |= set(range(1, len(facts.objectives) + 1))
    covered = {int(n) for n in _OBJECTIVE_LABEL.findall(methods)}
    # Only meaningful when the methodology is organised by objective.
    if len(covered) < 2 or not numbers:
        return []
    missing = sorted(n for n in numbers if n not in covered and n <= max(numbers))
    return [ConsistencyIssue(
        issue=f"Objective {n} has no matching part in the methodology (it covers objectives {', '.join(map(str, sorted(covered)))}).",
        sections_involved=["objectives", "methodology"],
        severity="important",
        suggestion=f"Describe how objective {n} will be achieved, or drop it.",
        found_by="code",
    ) for n in missing]


_CO_PI = re.compile(r"\bco-?\s?(?:pi|investigator)s?\b", re.IGNORECASE)


def _co_pi_missing(doc: ProposalDocument, facts: Optional[Facts]) -> List[ConsistencyIssue]:
    team_text = " ".join(s.text for s in doc.sections_for("team"))
    if not team_text:
        return []
    mentioned_in = [s.canonical or s.key for s in doc.sections
                    if s.canonical not in ("team", "references") and _CO_PI.search(s.text)]
    team_has_co_pi = bool(_CO_PI.search(team_text)) or any(
        m.role and _CO_PI.search(m.role) for m in (facts.team if facts else []))
    if not mentioned_in or team_has_co_pi:
        return []
    return [ConsistencyIssue(
        issue=f"The {mentioned_in[0].replace('_', ' ')} refers to a Co-PI, but no Co-PI is listed among the investigators.",
        sections_involved=[mentioned_in[0], "team"],
        severity="important",
        suggestion="Add the Co-PI with their role to the investigators section, or reassign that work.",
        found_by="code",
    )]
