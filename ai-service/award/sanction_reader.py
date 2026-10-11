"""Read a sanction order into the "Add my grant" form (Objective 4, item 4.5).

One LLM call copies values out of the page-marked text: title, agency,
scheme, order number, dates, the total, each budget item, the reporting
portal and what happens to unspent money. The LLM only copies, exactly as
printed. Code then does everything that has a right answer:
  * reads each date and converts each amount (lakh, crore, rupees) itself,
    and adds up year-wise budget tables;
  * fills a value only when its quote is found in the PDF text and the
    value (number, date or words) appears in that quote; anything else is
    left empty with a note, so a misread value is never filled silently;
  * merges items into the standard heads and checks them against the total.
The PI still checks every value before saving: a quote can be the wrong
sentence, and only a person can confirm that an item sits under the right head.

Results are cached by content hash, like checklists.
"""
from __future__ import annotations

import hashlib
import logging
import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Sequence, Tuple

from llm.gateway import generate_json
from proposal import analysis_cache
from workspace.extractor import build_page_text
from workspace.quote_check import QuoteLocator, normalise

from .schemas import BudgetItem, BudgetLineReading, SanctionOrderReading, SourcedField

logger = logging.getLogger("award.sanction_reader")

# Bump when the prompt or the checks change so old cached readings aren't served.
_CACHE_VERSION = "sanction-order-v2"
HEADS = ["EQUIPMENT", "MANPOWER", "CONSUMABLES", "TRAVEL", "CONTINGENCY", "OVERHEAD", "OTHERS"]
POLICIES = {"CARRY_FORWARD", "LAPSES", "DEDUCTED_NEXT_RELEASE"}
MAX_BUDGET_ITEMS = 40
_UNIT_FACTORS = {"rupees": Decimal(1), "lakh": Decimal(100_000), "crore": Decimal(10_000_000)}
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
# Totals and sub-totals would be counted twice ("Sub-total (A)", "Recurring sub-total", "Total cost of the project").
_TOTAL_LABEL = re.compile(r"\b(sub[\s-]*total|grand\s+total)\b|^\s*total\b", re.IGNORECASE)
_MONTHS = {name: number for number, names in enumerate([
    ("january", "jan"), ("february", "feb"), ("march", "mar"), ("april", "apr"), ("may",), ("june", "jun"),
    ("july", "jul"), ("august", "aug"), ("september", "sep", "sept"), ("october", "oct"),
    ("november", "nov"), ("december", "dec"),
], start=1) for name in names}

_PROMPT = """You are reading the sanction order of an Indian research grant, so the Principal Investigator doesn't have to type it into a form. Copy every value EXACTLY as the order prints it. Do not calculate, add, convert, round or guess: code does all arithmetic and reads the dates afterwards.

Return JSON exactly in this shape (use null for anything the order doesn't state):
{{
  "project_title": {{"value": "the project's title, without quotation marks", "source_quote": "...", "source_page": 1}},
  "agency": {{"value": "the funding agency that issued the order", "source_quote": "...", "source_page": 1}},
  "scheme": {{"value": "the scheme the project is sanctioned under, e.g. Core Research Grant", "source_quote": "...", "source_page": 1}},
  "sanction_no": {{"value": "the order's reference number exactly as printed", "source_quote": "...", "source_page": 1}},
  "sanction_date": {{"as_written": "the order's date as printed, e.g. 30 July 2026", "source_quote": "...", "source_page": 1}},
  "start_date": {{"as_written": "the project's start date as printed", "source_quote": "...", "source_page": 1}},
  "end_date": {{"as_written": "the project's end date as printed", "source_quote": "...", "source_page": 1}},
  "total_sanctioned": {{"as_written": "the number as printed, e.g. 39.27 or 30,66,000", "unit": "rupees | lakh | crore", "excludes_overhead": false, "source_quote": "...", "source_page": 1}},
  "unspent_policy": {{"value": "CARRY_FORWARD | LAPSES | DEDUCTED_NEXT_RELEASE", "source_quote": "...", "source_page": 1}},
  "portal_url": {{"value": "the web address where reports, UCs or SEs are submitted, exactly as printed", "source_quote": "...", "source_page": 1}},
  "budget": [
    {{
      "label": "the budget item as printed, e.g. Fellowship (1 JRF for 36 months)",
      "head": "EQUIPMENT | MANPOWER | CONSUMABLES | TRAVEL | CONTINGENCY | OVERHEAD | OTHERS",
      "amount_as_written": "the item's amount for the whole project as printed, or null",
      "year_amounts_as_written": ["each year's amount as printed, only if the order gives a year-wise break-up"],
      "unit": "rupees | lakh | crore",
      "source_quote": "the table row or sentence that holds this item's amounts, copied exactly",
      "source_page": 1
    }}
  ]
}}

Rules:
- Only use what the order states. If a date is not printed (for example "from the date of release of funds"), use null. Never fill anything from general knowledge.
- "source_quote" is copied character for character from the text and must contain the value: one sentence, or for a table the single row (the label and its numbers). Max 60 words.
- "source_page" is the number from the [Page N] marker above the quote.
- "scheme" is the grant scheme named in the subject line or the sanction sentence (e.g. "Sub: ... under the Core Research Grant scheme"). The name of the division, cell or office that issued the letter is not the scheme. If no scheme is named, use null.
- "unit" is how the order writes that number: in a table headed "Rs. in lakh" the unit is lakh; "Rs. 12,50,000" is rupees.
- "total_sanctioned" is everything the agency commits for the whole project, including overhead. If the order gives both a cost that excludes overhead and an overall commitment, use the overall commitment. If it only gives a total that excludes overhead, use it and set "excludes_overhead" to true.
- "budget": one entry per budget item, for the whole project. Skip sub-totals and totals ("Sub-total (A)", "Total", "Grand total"). Overhead stated in a sentence instead of the table is its own OVERHEAD item.
- "head" is the standard head the item belongs to: salaries, fellowships, JRF, SRF, RA, project associates and other staff are MANPOWER; instruments, machines, computers and other non-recurring items are EQUIPMENT; chemicals, reagents, kits, glassware and supplies are CONSUMABLES; travel is TRAVEL; contingency is CONTINGENCY; institutional overhead is OVERHEAD; anything else (field work, publication, services) is OTHERS.
- "unspent_policy" only when the order says what happens to money unspent at the end of a financial year: carried forward to the next year is CARRY_FORWARD; lapses or must be refunded is LAPSES; adjusted against or deducted from the next release is DEDUCTED_NEXT_RELEASE. Otherwise null.

SANCTION ORDER TEXT:
{text}
"""


async def read_sanction_order(
    pages: Sequence[str], *, source_name: str = "", force: bool = False,
) -> SanctionOrderReading:
    key = cache_key(pages)
    if not force:
        cached = analysis_cache.get(key)
        if cached is not None:
            cached["source_name"] = source_name
            return SanctionOrderReading(**cached)

    text, truncated = build_page_text(pages, True)
    raw = await generate_json(
        _PROMPT.format(text=text), task="sanction_order", temperature=0.0, max_output_tokens=8192,
        retries=1, thinking_budget=1024,
    )
    reading = clean_reading(raw if isinstance(raw, dict) else {}, pages)
    if truncated:
        reading.warnings.append("The order is very long, so only the first part was read.")
    reading.page_count = len(pages)

    analysis_cache.put(key, reading.model_dump())
    reading.source_name = source_name
    return reading


def cache_key(pages: Sequence[str]) -> str:
    h = hashlib.sha256()
    h.update(_CACHE_VERSION.encode("utf-8"))
    for page in pages:
        h.update(b"\x0c")
        h.update(page.encode("utf-8", errors="replace"))
    return h.hexdigest()


def clean_reading(raw: Dict[str, Any], pages: Sequence[str]) -> SanctionOrderReading:
    """Confirm every value against the pages; only confirmed values are filled."""
    locator = QuoteLocator(pages)
    full_text = "\n".join(pages)
    reading = SanctionOrderReading(
        project_title=_text_field(raw.get("project_title"), locator),
        agency=_text_field(raw.get("agency"), locator),
        scheme=_text_field(raw.get("scheme"), locator),
        sanction_no=_text_field(raw.get("sanction_no"), locator),
        sanction_date=_date_field(raw.get("sanction_date"), locator),
        start_date=_date_field(raw.get("start_date"), locator),
        end_date=_date_field(raw.get("end_date"), locator),
        total_sanctioned=_amount_field(raw.get("total_sanctioned"), locator),
        unspent_policy=_policy_field(raw.get("unspent_policy"), locator),
        portal_url=_url_field(raw.get("portal_url"), locator, full_text),
    )
    lines, budget_warnings = _budget(raw.get("budget"), locator)
    reading.budget_lines = lines
    reading.warnings.extend(budget_warnings)

    start, end = reading.start_date.value, reading.end_date.value
    if isinstance(start, str) and isinstance(end, str) and end <= start:
        reading.end_date = _reject(reading.end_date, "The end date read from the order isn't after the start date")

    labels = {"project_title": "Project title", "agency": "Agency", "scheme": "Scheme",
              "sanction_no": "Sanction order number", "sanction_date": "Sanction date", "start_date": "Start date",
              "end_date": "End date", "total_sanctioned": "Total sanctioned", "portal_url": "Portal link",
              "unspent_policy": "Money unspent on 31 March"}
    for name, label in labels.items():
        field: SourcedField = getattr(reading, name)
        if field.value is None and field.note:
            reading.warnings.append(f"{label} was left empty: {field.note}.")

    total = reading.total_sanctioned
    if isinstance(total.value, int) and isinstance(raw.get("total_sanctioned"), dict) \
            and raw["total_sanctioned"].get("excludes_overhead") is True:
        reading.warnings.append(
            "The total read from the order leaves out overhead. The total sanctioned usually includes it, so check it.")
    heads_sum = sum(line.amount for line in reading.budget_lines)
    if isinstance(total.value, int) and heads_sum and heads_sum != total.value:
        reading.warnings.append(
            f"The heads add up to {_rupees_text(heads_sum)} but the total is {_rupees_text(total.value)}. "
            "Check both against the order.")
    return reading


# ---------------------------------------------------------------------------
# Fields
# ---------------------------------------------------------------------------

def _source(entry: Any, locator: QuoteLocator) -> Tuple[Dict[str, Any], SourcedField, bool]:
    """The raw entry, a field carrying its quote and page, and whether the quote was found."""
    entry = entry if isinstance(entry, dict) else {}
    quote = str(entry.get("source_quote") or "").strip()[:1000]
    cited = _int_or_none(entry.get("source_page"))
    found, page = locator.locate(quote, cited) if quote else (False, cited)
    return entry, SourcedField(source_quote=quote, source_page=page), found


def _reject(field: SourcedField, note: str) -> SourcedField:
    field.value, field.verified, field.note = None, False, note
    return field


def _text_field(entry: Any, locator: QuoteLocator) -> SourcedField:
    entry, field, found = _source(entry, locator)
    value = _clean_text(entry.get("value"))
    if value is None:
        return field
    field.as_written = value
    if not found:
        return _reject(field, "its sentence wasn't found in the PDF")
    if normalise(value) not in normalise(field.source_quote):
        return _reject(field, "the value isn't in the sentence it came from")
    field.value, field.verified = value[:500], True
    return field


def _date_field(entry: Any, locator: QuoteLocator) -> SourcedField:
    entry, field, found = _source(entry, locator)
    written = _clean_text(entry.get("as_written"))
    if written is None:
        return field
    field.as_written = written
    parsed = parse_date(written)
    if parsed is None:
        return _reject(field, f"\"{written}\" couldn't be read as a date")
    if not found:
        return _reject(field, "its sentence wasn't found in the PDF")
    if normalise(written) not in normalise(field.source_quote):
        return _reject(field, "the date isn't in the sentence it came from")
    field.value, field.verified = parsed.isoformat(), True
    return field


def _amount_field(entry: Any, locator: QuoteLocator) -> SourcedField:
    entry, field, found = _source(entry, locator)
    written = _clean_text(entry.get("as_written"))
    if written is None:
        return field
    field.as_written = written
    rupees, number = to_rupees(written, entry.get("unit"))
    if rupees is None or rupees <= 0:
        return _reject(field, f"\"{written}\" couldn't be read as an amount")
    if not found:
        return _reject(field, "its sentence wasn't found in the PDF")
    if number not in numbers_in(field.source_quote):
        return _reject(field, "the amount isn't in the sentence it came from")
    field.value, field.verified = rupees, True
    return field


def _policy_field(entry: Any, locator: QuoteLocator) -> SourcedField:
    entry, field, found = _source(entry, locator)
    value = str(entry.get("value") or "").strip().upper().replace(" ", "_")
    if value not in POLICIES:
        return field
    field.as_written = value
    if not found:
        return _reject(field, "its sentence wasn't found in the PDF")
    field.value, field.verified = value, True
    return field


def _url_field(entry: Any, locator: QuoteLocator, full_text: str) -> SourcedField:
    entry, field, found = _source(entry, locator)
    value = _clean_text(entry.get("value"))
    if value is None:
        return field
    value = value.rstrip(".,;)")
    field.as_written = value
    if not re.match(r"^(https?://)?[\w-]+(\.[\w-]+)+(/\S*)?$", value, re.IGNORECASE):
        return _reject(field, f"\"{value}\" isn't a web address")
    # Links must be copied exactly, so compare with the raw text, not the normalised quote.
    if not found or value.lower() not in re.sub(r"\s+", "", full_text.lower()):
        return _reject(field, "the link wasn't found in the PDF")
    field.value, field.verified = value, True
    return field


# ---------------------------------------------------------------------------
# Budget
# ---------------------------------------------------------------------------

def _budget(raw_items: Any, locator: QuoteLocator) -> Tuple[List[BudgetLineReading], List[str]]:
    """Confirmed items grouped into the standard heads, plus a warning for each item left out."""
    grouped: Dict[str, List[BudgetItem]] = {}
    warnings: List[str] = []
    for entry in (raw_items if isinstance(raw_items, list) else [])[:MAX_BUDGET_ITEMS]:
        if not isinstance(entry, dict):
            continue
        label = _clean_text(entry.get("label")) or "A budget item"
        if _TOTAL_LABEL.match(label):
            continue
        head = str(entry.get("head") or "").strip().upper()
        if head not in HEADS:
            head = "OTHERS"
        quote = str(entry.get("source_quote") or "").strip()[:1000]
        found, page = locator.locate(quote, _int_or_none(entry.get("source_page"))) if quote else (False, None)
        amount, problem = _item_amount(entry, quote)
        if problem is None and not found:
            problem = "its row wasn't found in the PDF"
        if problem is not None:
            warnings.append(f"{label} wasn't filled in: {problem}.")
            continue
        if amount == 0:
            continue
        grouped.setdefault(head, []).append(BudgetItem(label=label[:200], amount=amount, source_quote=quote, source_page=page))

    lines = [BudgetLineReading(head=head, amount=sum(i.amount for i in grouped[head]), items=grouped[head])
             for head in HEADS if head in grouped]
    return lines, warnings


def _item_amount(entry: Dict[str, Any], quote: str) -> Tuple[Optional[int], Optional[str]]:
    """The item's whole-project amount in rupees, or why it can't be trusted.

    A year-wise row is added up here; when the row also prints its own total,
    the two must agree.
    """
    unit = entry.get("unit")
    in_quote = numbers_in(quote)
    years = [y for y in (entry.get("year_amounts_as_written") or []) if _clean_text(y) is not None]
    year_total = None
    if years:
        year_total = 0
        for written in years:
            rupees, number = to_rupees(str(written), unit)
            if rupees is None:
                return None, f"\"{written}\" couldn't be read as an amount"
            if number not in in_quote:
                return None, f"the amount {written} isn't in its row"
            year_total += rupees

    written_total = _clean_text(entry.get("amount_as_written"))
    if written_total is None:
        if year_total is None:
            return None, "no amount was found for it"
        return year_total, None
    rupees, number = to_rupees(written_total, unit)
    if rupees is None:
        return None, f"\"{written_total}\" couldn't be read as an amount"
    if number not in in_quote:
        return None, f"the amount {written_total} isn't in its row"
    if year_total is not None and year_total != rupees:
        return None, f"its years add up to {_rupees_text(year_total)}, not the {_rupees_text(rupees)} printed"
    return rupees, None


# ---------------------------------------------------------------------------
# Reading numbers and dates (code, not the LLM)
# ---------------------------------------------------------------------------

def numbers_in(text: str) -> List[Decimal]:
    """Every number in the text, Indian or Western grouping: "30,66,000" -> 3066000, "12.00" -> 12."""
    found = []
    for match in _NUMBER.findall(text or ""):
        try:
            found.append(Decimal(match.rstrip(",").replace(",", "")))
        except InvalidOperation:
            continue
    return found


def to_rupees(written: str, unit: Any) -> Tuple[Optional[int], Optional[Decimal]]:
    """("39.27", "lakh") -> (3927000, 39.27). A unit word in the text itself ("Rs. 5 lakh") wins."""
    numbers = numbers_in(written)
    if not numbers:
        return None, None
    number = numbers[0]
    lowered = (written or "").lower()
    if "crore" in lowered or re.search(r"\bcr\b", lowered):
        unit = "crore"
    elif "lakh" in lowered or "lac" in lowered:
        unit = "lakh"
    unit = str(unit or "rupees").strip().lower()
    unit = "lakh" if unit.startswith(("lakh", "lac")) else "crore" if unit.startswith("cr") else "rupees"
    rupees = number * _UNIT_FACTORS[unit]
    return int(rupees.to_integral_value()), number


def parse_date(written: str) -> Optional[date]:
    """Indian date styles: "15 August 2026", "15th Aug, 2026", "August 15, 2026",
    "15.08.2026", "15/08/2026", "15-08-2026" (day first) and "2026-08-15"."""
    text = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", (written or "").strip().lower())
    text = re.sub(r"[,]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    try:
        match = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", text)
        if match:
            return date(int(match[1]), int(match[2]), int(match[3]))
        match = re.fullmatch(r"(\d{1,2})[./-](\d{1,2})[./-](\d{4})", text)
        if match:
            return date(int(match[3]), int(match[2]), int(match[1]))
        match = re.fullmatch(r"(\d{1,2})[ -]([a-z]+)\.?[ -](\d{4})", text)
        if match and match[2] in _MONTHS:
            return date(int(match[3]), _MONTHS[match[2]], int(match[1]))
        match = re.fullmatch(r"([a-z]+)\.? (\d{1,2}) (\d{4})", text)
        if match and match[1] in _MONTHS:
            return date(int(match[3]), _MONTHS[match[1]], int(match[2]))
    except ValueError:  # e.g. 31 June, or 29 February in a non-leap year
        return None
    return None


def _rupees_text(amount: int) -> str:
    return f"Rs. {amount / 100_000:.2f} lakh"


def _clean_text(value: Any) -> Optional[str]:
    if value is None or isinstance(value, (dict, list)):
        return None
    text = str(value).strip().strip('"“”').strip()
    return None if not text or text.lower() in {"null", "none", "n/a"} else text


def _int_or_none(value: Any) -> Optional[int]:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def summarise(reading: SanctionOrderReading) -> Dict[str, int]:
    """Counts for logs: fields filled, budget heads, warnings."""
    fields = ["project_title", "agency", "scheme", "sanction_no", "sanction_date", "start_date", "end_date",
              "total_sanctioned", "unspent_policy", "portal_url"]
    return {
        "filled": sum(1 for name in fields if getattr(reading, name).value is not None),
        "heads": len(reading.budget_lines),
        "warnings": len(reading.warnings),
    }
