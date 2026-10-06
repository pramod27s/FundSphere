"""Read a call's guidelines once: the application checklist and the proposal rules.

One LLM call over the page-marked text returns
  * the application checklist (Objective 3): every document, limit and
    sign-off, with the sentence and page it came from;
  * how the proposal will be judged (Proposal Assistant): required sections,
    evaluation criteria with marks, and rules typed so code can check the
    countable ones (pages, words, fonts, budget caps, forbidden items).
Code then cleans the output and checks every quote against the extracted
text, so the PI can see which sources are verified.

Results are cached by content hash, like proposal analyses: the same
guidelines give the same checklist instantly, with no tokens spent.
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import date
from typing import Any, Dict, List, Optional, Sequence

from proposal import analysis_cache
from llm.gateway import generate_json

from proposal.sections import CANONICAL_SECTIONS, normalise_section_key

from .quote_check import QuoteLocator, normalise
from .schemas import (
    ChecklistExtractionResponse,
    ChecklistItem,
    ProposalCriterion,
    ProposalGuidance,
    ProposalRule,
)

logger = logging.getLogger("workspace.extractor")

# Bump when the prompt or post-processing changes so old cached results
# aren't served for the new logic.
_CACHE_VERSION = "guidelines-v7"
# ~40k tokens. Guideline documents rarely come close; anything beyond is
# cut and the user is warned.
MAX_PROMPT_CHARS = 160_000
MAX_ITEMS = 80

CATEGORY_ORDER = ["documents", "format", "eligibility", "budget", "submission", "key_dates"]
_CATEGORY_ALIASES = {
    "document": "documents", "annexure": "documents", "annexures": "documents",
    "attachments": "documents", "formatting": "format", "format_limits": "format",
    "eligibility_proofs": "eligibility", "budget_rules": "budget", "finance": "budget",
    "submission_details": "submission", "dates": "key_dates", "key_date": "key_dates",
    "deadlines": "key_dates", "timeline": "key_dates",
}

_PROMPT = """You are helping an Indian research team prepare a funding application. Read the call guidelines below and list EVERY requirement an applicant must meet or prepare, so that nothing is missed at submission.

Call title (may be empty): {title}

Return JSON exactly in this shape:
{{
  "call_deadline": "YYYY-MM-DD or null — the final date for submitting the application, only if the text states it",
  "items": [
    {{
      "category": "documents | format | eligibility | budget | submission | key_dates",
      "text": "one short, actionable requirement in plain English (max 25 words)",
      "mandatory": true,
      "needs_signoff": false,
      "date": "YYYY-MM-DD or null",
      "source_quote": "the sentence from the text that states this requirement, copied EXACTLY",
      "source_page": 1
    }}
  ],
  "proposal": {{
    "scope": "one or two sentences: which disciplines or kinds of projects this call funds, and any it explicitly excludes; or null",
    "required_sections": ["section keys the proposal must contain, from: {section_keys}"],
    "criteria": [
      {{"name": "what proposals are marked on, e.g. Novelty and scientific merit", "marks": 25, "source_quote": "copied exactly", "source_page": 1}}
    ],
    "rules": [
      {{
        "text": "a rule the proposal document itself must follow (max 25 words)",
        "severity": "critical | important | minor",
        "kind": "limit | forbidden_item | needs_evidence | judgement",
        "metric": "pages | words | font_size | font_family | paper_size | line_spacing | budget_total | overhead_percent | overhead_amount | duration_months | item_cost | null",
        "operator": "max | min | equals | null",
        "value": 15,
        "unit": "pages | words | pt | lakh | crore | rupees | percent | months | null",
        "section": "section key the rule is about, or null for the whole proposal",
        "keywords": [],
        "source_quote": "copied exactly",
        "source_page": 1
      }}
    ]
  }}
}}

Categories:
- documents: every document, annexure, certificate, letter, CV, undertaking, declaration, photo, ID or proof to attach (e.g. endorsement from the Head of Institution, PI's biodata, plagiarism undertaking, list of publications, previous UC/SE).
- format: page limits, word or character limits, font, font size, margins, file type and file size, required sections and their order, language.
- eligibility: who may apply and the proof they need (age limit, regular position, PhD, years of service, nationality, institution type, one application per PI, etc.).
- budget: total or per-head caps, allowed and disallowed items, overhead or contingency percentages, equipment rules, manpower norms.
- submission: portal or address, online vs hard copy, number of copies, how to send, who must submit or forward.
- key_dates: dates other than the final submission deadline (LOI, pre-proposal, hard copy arrival, presentations). The final submission deadline goes in "call_deadline", not in items.

Rules:
- One item per thing the team must prepare, check or do. Keep a limit together with the thing it limits, e.g. "PI and Co-PI biodata, max 2 pages each" or "Overhead: 10% of project cost, max Rs. 5 lakh". Split a sentence only when it asks for separate things to prepare.
- Never list the same action twice (e.g. "forward through the Head of Institution" and "attach the HoI endorsement certificate" are one item).
- Only include requirements stated in the text. Never add requirements from your general knowledge.
- "source_quote" must be copied character-for-character from the text (one sentence or bullet, max 60 words). Do not paraphrase, merge or fix it.
- "source_page" is the number from the [Page N] marker above the quote{page_note}.
- "mandatory": false only when the text says optional, desirable, preferred or "if applicable".
- "needs_signoff": true when the item needs a signature, endorsement, forwarding or certificate from someone outside the research team (Head of Institution, Registrar, Principal, Finance or Accounts Officer, Ethics Committee).
- "date": only when the text sets a date by which this item must be done or must arrive (e.g. "hard copy must reach by 27 November"); otherwise null. A reference date is not a due date: for "age not more than 45 as on 1 November" use null. Use the year stated in the text.
- Skip general background, the agency's mission, and contact details unless they are needed to submit.
- At most {max_items} items. If there are more, keep the mandatory ones.

Fill BOTH parts. "items" is the applicant's complete checklist, exactly as described above, even when the same limit also appears under "proposal.rules" (for example a page limit or budget cap belongs in both).

The "proposal" part describes how the proposal document will be judged:
- "required_sections": only sections the text asks the proposal to contain.
- "criteria": only if the text says how proposals are evaluated or marked; "marks": null if no marks are given.
- "rules": rules about the proposal's length, format, content and budget (not documents to attach; those are items). Do not repeat required sections as rules.
  * "limit" when a number can be checked, with metric/operator/value/unit. Examples: "not exceed 15 pages" -> pages max 15 pages; "abstract of not more than 250 words" -> words max 250 words, section abstract; "12 point font" -> font_size equals 12 pt; "Times New Roman" -> font_family equals "Times New Roman"; "A4 paper" -> paper_size equals "A4"; "single line spacing" -> line_spacing equals 1 (1.5 spacing -> 1.5, double -> 2); "total budget shall not exceed Rs. 60 lakh" -> budget_total max 60 lakh; "overhead 10% subject to a maximum of Rs. 5 lakh" -> two rules: overhead_percent max 10 percent, and overhead_amount max 5 lakh; "maximum duration of three years" -> duration_months max 36 months.
  * "forbidden_item" for things that may not be bought or charged, with "keywords" naming them (e.g. ["vehicle", "furniture"]).
  * "needs_evidence" when something must be supported by proof, e.g. "equipment above Rs. 10 lakh needs three quotations" -> metric item_cost, operator max, value 10, unit lakh, keywords ["quotation"]. "keywords" here are only the words that prove the evidence is there (quotation, quote); never the item itself (not "equipment").
  * "judgement" for qualitative expectations, e.g. "objectives must be specific and measurable".
  * Give every format requirement its own rule: page limit, paper size, font, font size, line spacing, margins.
  * "severity": critical if breaking it gets the proposal returned or rejected (limits, caps, forbidden items, scope); important if it costs marks; minor for polish.

GUIDELINES TEXT:
{text}
"""


def cache_key(pages: Sequence[str], title: str) -> str:
    h = hashlib.sha256()
    h.update(_CACHE_VERSION.encode("utf-8"))
    for page in pages:
        h.update(b"\x0c")
        h.update(page.encode("utf-8", errors="replace"))
    h.update(b"\x00")
    h.update((title or "").strip().lower().encode("utf-8"))
    return h.hexdigest()


def build_page_text(pages: Sequence[str], has_page_numbers: bool) -> tuple[str, bool]:
    """Join pages with [Page N] markers. Returns (text, truncated)."""
    parts: List[str] = []
    total = 0
    for index, page in enumerate(pages, start=1):
        chunk = f"[Page {index}]\n{page.strip()}\n" if has_page_numbers else page.strip()
        if total + len(chunk) > MAX_PROMPT_CHARS:
            remaining = MAX_PROMPT_CHARS - total
            if remaining > 500:
                parts.append(chunk[:remaining])
            return "\n".join(parts), True
        parts.append(chunk)
        total += len(chunk)
    return "\n".join(parts), False


async def extract_checklist(
    pages: Sequence[str],
    *,
    title: str = "",
    source_kind: str = "pdf",
    source_name: str = "",
    warnings: Optional[List[str]] = None,
    force: bool = False,
) -> ChecklistExtractionResponse:
    warnings = list(warnings or [])
    has_page_numbers = source_kind == "pdf"

    key = cache_key(pages, title)
    if not force:
        cached = analysis_cache.get(key)
        if cached is not None:
            cached["source_name"] = source_name
            return ChecklistExtractionResponse(**cached)

    text, truncated = build_page_text(pages, has_page_numbers)
    if truncated:
        warnings.append(
            "The document is very long, so only the first part was read. "
            "Check the later pages for anything missing."
        )

    prompt = _PROMPT.format(
        section_keys=", ".join(CANONICAL_SECTIONS),
        title=(title or "").strip(),
        text=text,
        max_items=MAX_ITEMS,
        page_note="" if has_page_numbers else " (this text has no page markers, so use null)",
    )
    raw = await generate_json(
        prompt, task="guidelines", temperature=0.1, max_output_tokens=16384, retries=1, thinking_budget=1024,
    )

    locator = QuoteLocator(pages)
    items = clean_items(raw, pages, has_page_numbers, locator=locator)
    guidance = clean_proposal_guidance(raw.get("proposal") if isinstance(raw, dict) else None, locator, has_page_numbers)
    result = ChecklistExtractionResponse(
        items=items + items_from_rules(guidance.rules, items),
        proposal=guidance,
        content_hash=content_hash(pages),
        call_deadline=_iso_date((raw or {}).get("call_deadline") if isinstance(raw, dict) else None),
        source_kind="pdf" if has_page_numbers else "web",
        source_name=source_name,
        page_count=len(pages) if has_page_numbers else 0,
        warnings=warnings,
    )
    unverified = sum(1 for item in result.items if not item.source_verified)
    if unverified:
        result.warnings.append(
            f"{unverified} item(s) have a source quote that couldn't be found in the document. "
            "They're marked \"Unverified source\" — check them against the guidelines."
        )

    analysis_cache.put(key, result.model_dump())
    return result


def content_hash(pages: Sequence[str]) -> str:
    """Identity of a guidelines document by its text (same for upload and link)."""
    h = hashlib.sha256()
    for page in pages:
        h.update(normalise(page).encode("utf-8"))
        h.update(b"\x0c")
    return h.hexdigest()


def clean_items(
    raw: Any, pages: Sequence[str], has_page_numbers: bool, *, locator: Optional[QuoteLocator] = None,
) -> List[ChecklistItem]:
    """Validate the LLM output and verify every quote against the pages."""
    raw_items = raw.get("items") if isinstance(raw, dict) else raw
    if not isinstance(raw_items, list):
        raise ValueError("LLM returned no items list")

    locator = locator or QuoteLocator(pages)
    seen: set[str] = set()
    items: List[ChecklistItem] = []
    for entry in raw_items:
        if not isinstance(entry, dict):
            continue
        text = str(entry.get("text") or "").strip()
        category = _category(entry.get("category"))
        if not text or category is None:
            continue
        dedupe_key = normalise(text)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        quote = str(entry.get("source_quote") or "").strip()
        cited_page = _int_or_none(entry.get("source_page")) if has_page_numbers else None
        verified, page = locator.locate(quote, cited_page)

        items.append(ChecklistItem(
            category=category,
            text=text[:500],
            mandatory=_bool(entry.get("mandatory"), default=True),
            needs_signoff=_bool(entry.get("needs_signoff"), default=False),
            date=_iso_date(entry.get("date")),
            source_quote=quote[:1000],
            source_page=page if has_page_numbers else None,
            source_verified=verified,
        ))
        if len(items) >= MAX_ITEMS:
            break

    # Stable sort: grouped by category, LLM order kept inside each group.
    items.sort(key=lambda item: CATEGORY_ORDER.index(item.category))
    return items


_RULE_KINDS = {"limit", "forbidden_item", "needs_evidence", "judgement"}
_METRICS = {"pages", "words", "font_size", "font_family", "paper_size", "line_spacing", "budget_total",
            "overhead_percent", "overhead_amount", "duration_months", "item_cost"}
_MONEY_METRICS = {"budget_total", "overhead_amount", "item_cost"}
_OPERATORS = {"max", "min", "equals"}
_SEVERITIES = {"critical", "important", "minor"}
MAX_RULES = 40
MAX_CRITERIA = 12


def clean_proposal_guidance(raw: Any, locator: QuoteLocator, has_page_numbers: bool) -> ProposalGuidance:
    """Validate the "proposal" part: known section keys, typed rules, amounts in lakh."""
    if not isinstance(raw, dict):
        return ProposalGuidance()

    required: List[str] = []
    for value in raw.get("required_sections") or []:
        key = normalise_section_key(value)
        if key and key not in required:
            required.append(key)

    criteria: List[ProposalCriterion] = []
    for entry in (raw.get("criteria") or [])[:MAX_CRITERIA]:
        if not isinstance(entry, dict) or not str(entry.get("name") or "").strip():
            continue
        quote = str(entry.get("source_quote") or "").strip()
        verified, page = locator.locate(quote, _int_or_none(entry.get("source_page")) if has_page_numbers else None)
        marks = _number(entry.get("marks"))
        criteria.append(ProposalCriterion(
            name=str(entry["name"]).strip()[:200],
            marks=marks if marks and marks > 0 else None,
            source_quote=quote[:1000],
            source_page=page if has_page_numbers else None,
            source_verified=verified,
        ))

    rules: List[ProposalRule] = []
    seen: set = set()
    for entry in (raw.get("rules") or [])[: MAX_RULES * 2]:
        if not isinstance(entry, dict):
            continue
        text = str(entry.get("text") or "").strip()
        if not text or normalise(text) in seen:
            continue
        seen.add(normalise(text))
        rule = _clean_rule(entry, text, len(rules) + 1)
        quote = str(entry.get("source_quote") or "").strip()
        verified, page = locator.locate(quote, _int_or_none(entry.get("source_page")) if has_page_numbers else None)
        rule.source_quote, rule.source_verified = quote[:1000], verified
        rule.source_page = page if has_page_numbers else None
        rules.append(rule)
        if len(rules) >= MAX_RULES:
            break

    scope = str(raw.get("scope") or "").strip() or None
    return ProposalGuidance(scope=scope, required_sections=required, criteria=criteria, rules=rules)


_RULE_CATEGORY = {
    "pages": "format", "words": "format", "font_size": "format", "font_family": "format",
    "paper_size": "format", "line_spacing": "format", "duration_months": "eligibility",
    "budget_total": "budget", "overhead_percent": "budget", "overhead_amount": "budget", "item_cost": "budget",
}
_STOPWORDS = {"the", "a", "an", "of", "to", "and", "or", "for", "in", "on", "be", "must", "shall", "should",
              "not", "is", "are", "with", "by", "each", "any", "all", "than", "more", "less", "per"}


def items_from_rules(rules: List[ProposalRule], items: List[ChecklistItem]) -> List[ChecklistItem]:
    """Checklist items for checkable proposal rules the checklist doesn't already cover.

    The model tends to put format and budget limits only under proposal.rules,
    but the applicant's checklist needs them too. Copying them here costs no
    tokens and keeps the checklist complete.
    """
    def words(text: str) -> set:
        return {w for w in normalise(text).split() if w not in _STOPWORDS and len(w) > 1}

    def numbers(text: str) -> set:
        return set(re.findall(r"\d+(?:\.\d+)?", text))

    added: List[ChecklistItem] = []
    for rule in rules:
        if rule.kind not in {"limit", "forbidden_item", "needs_evidence"}:
            continue
        rule_words, rule_numbers = words(rule.text), numbers(rule.text)
        quote = normalise(rule.source_quote)
        # Covered only if an item says the same thing, including every number:
        # one sentence often holds two limits ("10%, max Rs. 5 lakh").
        covered = any(
            ((quote and quote == normalise(item.source_quote))
             or (rule_words and len(rule_words & words(item.text)) / len(rule_words) >= 0.6))
            and rule_numbers <= numbers(item.text)
            for item in items + added
        )
        if covered:
            continue
        category = "budget" if rule.kind != "limit" else _RULE_CATEGORY.get(rule.metric or "", "format")
        added.append(ChecklistItem(
            category=category, text=rule.text[:500], mandatory=True,
            source_quote=rule.source_quote, source_page=rule.source_page, source_verified=rule.source_verified,
        ))
    return added


def _clean_rule(entry: Dict[str, Any], text: str, number: int) -> ProposalRule:
    kind = str(entry.get("kind") or "judgement").strip().lower()
    kind = kind if kind in _RULE_KINDS else "judgement"
    metric = str(entry.get("metric") or "").strip().lower() or None
    metric = metric if metric in _METRICS else None
    operator = str(entry.get("operator") or "").strip().lower() or None
    operator = operator if operator in _OPERATORS else None
    unit = str(entry.get("unit") or "").strip().lower() or None
    if unit in {"null", "none"}:
        unit = None
    keywords = [str(k).strip().lower() for k in (entry.get("keywords") or []) if str(k).strip()][:10]
    severity = str(entry.get("severity") or "important").strip().lower()
    severity = severity if severity in _SEVERITIES else "important"

    value: Any = entry.get("value")
    if metric in {"font_family", "paper_size"}:
        value = str(value).strip() if value not in (None, "") else None
    elif metric is not None:
        value = _number(value)
        if value is not None and metric in _MONEY_METRICS:
            value, unit = _to_lakh(value, unit), "lakh"

    # A rule code can't measure goes to the AI review as a judgement.
    if kind == "limit" and (metric is None or value is None or operator is None):
        kind, metric, operator, value = "judgement", None, None, None
    if kind == "forbidden_item" and not keywords:
        kind = "judgement"
    if kind == "needs_evidence" and (metric != "item_cost" or value is None or not keywords):
        kind, metric, operator, value = "judgement", None, None, None

    return ProposalRule(
        id=f"R{number}", text=text[:400], severity=severity, kind=kind, metric=metric,
        operator=operator, value=value, unit=unit,
        section=normalise_section_key(entry.get("section")), keywords=keywords,
    )


def _number(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        match = re.search(r"-?\d+(?:\.\d+)?", value.replace(",", ""))
        return float(match.group()) if match else None
    return None


def _to_lakh(value: float, unit: Optional[str]) -> float:
    """Guidelines state money in rupees, lakh or crore; rules store lakh."""
    unit = (unit or "lakh").lower()
    if "crore" in unit:
        return round(value * 100, 4)
    if unit in {"rupees", "rupee", "rs", "inr"} or (value >= 100000 and "lakh" not in unit):
        return round(value / 100000, 4)
    return value


def _category(value: Any) -> Optional[str]:
    key = str(value or "").strip().lower().replace(" ", "_").replace("-", "_")
    key = _CATEGORY_ALIASES.get(key, key)
    return key if key in CATEGORY_ORDER else None


def _bool(value: Any, *, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "yes", "1"}:
            return True
        if lowered in {"false", "no", "0"}:
            return False
    return default


def _int_or_none(value: Any) -> Optional[int]:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _iso_date(value: Any) -> Optional[str]:
    if not value or not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip()[:10]).isoformat()
    except ValueError:
        return None


def summarise(result: ChecklistExtractionResponse) -> Dict[str, int]:
    """Counts for logs: total, verified, per category."""
    counts: Dict[str, int] = {"total": len(result.items)}
    counts["verified"] = sum(1 for i in result.items if i.source_verified)
    for item in result.items:
        counts[item.category] = counts.get(item.category, 0) + 1
    return counts
