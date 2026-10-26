"""Read a funding call into the admin's "Add a grant" form (2nd.md, Part B).

For calls the scraper can't reach (sites that block crawlers), an admin
uploads the call's PDF, pastes its link or pastes its text. One LLM call
copies each grant detail exactly as printed, with the sentence it came from.
Code then does everything that has a right answer, the same way as the
sanction-order reader:
  * fills a value only when its quote is found in the call and the value
    (words, number or date) appears in that quote; anything else is left
    empty with a note, so a misread value is never filled silently;
  * reads the dates and converts lakh and crore amounts to rupees itself;
  * decides the deadline type: a date makes it FIXED, a sentence saying
    applications are accepted all year makes it ROLLING.
The admin still checks every value before saving.

Results are cached by content hash, like checklists and sanction orders.
"""
from __future__ import annotations

import hashlib
import logging
import re
from typing import Any, Dict, Optional, Sequence, Tuple

from award.schemas import SourcedField
from award.sanction_reader import numbers_in, parse_date, to_rupees
from llm.gateway import generate_json
from proposal import analysis_cache
from workspace.extractor import build_page_text
from workspace.quote_check import QuoteLocator, normalise

from .schemas import GRANT_TYPES, CallReading

logger = logging.getLogger("intake.reader")

# Bump when the prompt or the checks change so old cached readings aren't served.
_CACHE_VERSION = "call-reading-v3"
_LONG_TEXT = 2000
_SHORT_TEXT = 500
_FOREIGN_MONEY = re.compile(r"\$|\busd\b|us dollars?|€|\beur\b|euros?|£|\bgbp\b|pounds? sterling", re.IGNORECASE)
_RUPEES = re.compile(r"\brs\b\.?|₹|\binr\b|rupees?|\blakhs?\b|\blacs?\b|\bcrores?\b", re.IGNORECASE)
_ALL_YEAR = re.compile(
    r"throughout the year|all (the )?year|round the year|year[- ]round|any ?time|at any point|rolling|"
    r"no (fixed |last )?(deadline|last date)|open (all|throughout)|continuous(ly)?",
    re.IGNORECASE,
)
# A citizenship counts only from a sentence about citizenship: "the Indian Principal Investigator" isn't one.
_CITIZENSHIP = re.compile(r"citizens?(hip)?\b|nationality|nationals\b|national of\b", re.IGNORECASE)
_PERIODIC_CALLS = re.compile(r"\bcalls?\b|announced|advertised|invited (once|twice|every)|annual(ly)?|every year",
                             re.IGNORECASE)
_LABELS = {"title": "Title", "agency": "Agency", "programme": "Programme", "purpose": "What it funds",
           "deadline": "Deadline", "opening_date": "Opening date", "amount_min": "Minimum amount",
           "amount_max": "Maximum amount", "duration": "Duration", "eligibility": "Eligibility",
           "themes": "Research areas", "application_link": "Application link", "requires_phd": "PhD required",
           "citizenship": "Citizenship", "grant_type": "Grant type"}

_PROMPT = """You are reading a research funding call published by an Indian agency, so an admin doesn't have to type it into a form. Copy every value EXACTLY as the call prints it. Do not calculate, convert, summarise, round or guess: code reads the dates and amounts afterwards.

Return JSON exactly in this shape (use null for anything the call doesn't state):
{{
  "title": {{"value": "the name of the call, scheme or fellowship as printed", "source_quote": "...", "source_page": 1}},
  "agency": {{"value": "the funding agency, e.g. Indian Council of Medical Research", "source_quote": "...", "source_page": 1}},
  "programme": {{"value": "the larger programme or scheme this call belongs to, only if it is named separately from the title", "source_quote": "...", "source_page": 1}},
  "purpose": {{"value": "one or two sentences copied from the call that say what it funds", "source_page": 1}},
  "deadline": {{"as_written": "the last date for applications as printed, e.g. 31 October 2026", "source_quote": "...", "source_page": 1}},
  "opening_date": {{"as_written": "the date applications open, as printed", "source_quote": "...", "source_page": 1}},
  "open_all_year": {{"value": true, "source_quote": "the sentence saying applications are accepted throughout the year or at any time", "source_page": 1}},
  "periodic_calls": {{"value": true, "source_quote": "the sentence saying the scheme opens through calls announced from time to time", "source_page": 1}},
  "amount_min": {{"as_written": "the smallest amount per project as printed", "unit": "rupees | lakh | crore", "source_quote": "...", "source_page": 1}},
  "amount_max": {{"as_written": "the largest amount per project or award as printed, e.g. 60 or 50,00,000", "unit": "rupees | lakh | crore", "source_quote": "...", "source_page": 1}},
  "duration": {{"value": "how long the support lasts as printed, e.g. 3 years", "source_quote": "...", "source_page": 1}},
  "eligibility": {{"value": "the sentences copied from the call that say who can apply", "source_page": 1}},
  "themes": {{"value": "the research areas or themes as printed", "source_quote": "...", "source_page": 1}},
  "application_link": {{"value": "the web address where applications are submitted, exactly as printed", "source_quote": "...", "source_page": 1}},
  "requires_phd": {{"value": true, "source_quote": "the sentence that says a PhD is or isn't required", "source_page": 1}},
  "citizenship": {{"value": "the nationality applicants must hold, e.g. Indian", "source_quote": "the sentence that says applicants must be citizens or nationals of that country", "source_page": 1}},
  "grant_type": {{"value": "one of: {grant_types}", "source_quote": "the sentence that shows what kind of support it is", "source_page": 1}}
}}

Rules:
- Only use what the call states. Never fill anything from general knowledge.
- "source_quote" is copied character for character from the text and must contain the value. One sentence, or one table row. Max 60 words.
- "purpose" and "eligibility" are copied text themselves (up to 3 sentences), so they have no separate quote.
- "source_page" is the number from the [Page N] marker above the quote.
- "unit" is how the call writes that number: "Rs. 60 lakh" is lakh, "Rs. 50,00,000" is rupees, "up to 1 crore" is crore.
- "deadline" is the last date to apply, not a date for results, interviews or the project start.
- "open_all_year" only when the call says applications are accepted throughout the year, at any time or on a rolling basis; otherwise null.
- "periodic_calls" only when the call says it opens through calls announced from time to time and gives no date; otherwise null.
- "requires_phd" true when a PhD is required to apply, false when the call says it isn't; null when the call doesn't say.
- "citizenship" only when the call says applicants must be citizens or nationals of a country. "The Indian Principal Investigator" or "an Indian institution" is not a citizenship rule: use null.

CALL TEXT:
{text}
"""


async def read_call(
    pages: Sequence[str], *, has_page_numbers: bool, source_kind: str, source_name: str = "",
    source_url: str = "", force: bool = False,
) -> CallReading:
    key = cache_key(pages)
    if not force:
        cached = analysis_cache.get(key)
        if cached is not None:
            reading = CallReading(**cached)
            reading.source_kind, reading.source_name, reading.source_url = source_kind, source_name, source_url
            return reading

    text, truncated = build_page_text(pages, has_page_numbers)
    raw = await generate_json(
        _PROMPT.format(text=text, grant_types=" | ".join(GRANT_TYPES)),
        task="call_reading", temperature=0.0, max_output_tokens=4096, retries=1, thinking_budget=1024,
    )
    reading = clean_reading(raw if isinstance(raw, dict) else {}, pages, has_page_numbers)
    if truncated:
        reading.warnings.append("The call is very long, so only the first part was read.")
    reading.page_count = len(pages)

    analysis_cache.put(key, reading.model_dump())
    reading.source_kind, reading.source_name, reading.source_url = source_kind, source_name, source_url
    return reading


def cache_key(pages: Sequence[str]) -> str:
    h = hashlib.sha256()
    h.update(_CACHE_VERSION.encode("utf-8"))
    for page in pages:
        h.update(b"\x0c")
        h.update(page.encode("utf-8", errors="replace"))
    return h.hexdigest()


def clean_reading(raw: Dict[str, Any], pages: Sequence[str], has_page_numbers: bool = True) -> CallReading:
    """Confirm every value against the call's text; only confirmed values are filled."""
    check = _Checker(pages, has_page_numbers)
    reading = CallReading(
        title=check.text(raw.get("title")),
        agency=check.text(raw.get("agency")),
        programme=check.text(raw.get("programme")),
        purpose=check.copied(raw.get("purpose")),
        deadline=check.date(raw.get("deadline")),
        opening_date=check.date(raw.get("opening_date")),
        open_all_year=check.cue(raw.get("open_all_year"), _ALL_YEAR),
        amount_min=check.amount(raw.get("amount_min")),
        amount_max=check.amount(raw.get("amount_max")),
        duration=check.text(raw.get("duration")),
        eligibility=check.copied(raw.get("eligibility")),
        themes=check.text(raw.get("themes"), max_len=_LONG_TEXT),
        application_link=check.url(raw.get("application_link")),
        requires_phd=check.yes_no(raw.get("requires_phd")),
        citizenship=check.text(raw.get("citizenship")),
        grant_type=check.choice(raw.get("grant_type"), GRANT_TYPES),
    )

    if reading.citizenship.value is not None and not _CITIZENSHIP.search(reading.citizenship.source_quote):
        reading.citizenship = _reject(reading.citizenship, "its sentence isn't about citizenship")
    low, high = reading.amount_min.value, reading.amount_max.value
    if isinstance(low, int) and isinstance(high, int) and low > high:
        reading.amount_min = _reject(reading.amount_min, "it's larger than the maximum amount")
    start, end = reading.opening_date.value, reading.deadline.value
    if isinstance(start, str) and isinstance(end, str) and end < start:
        reading.opening_date = _reject(reading.opening_date, "it's after the deadline")

    if reading.deadline.value is not None:
        reading.deadline_type = "FIXED"
    elif reading.open_all_year.value == "YES":
        reading.deadline_type = "ROLLING"
    elif check.cue(raw.get("periodic_calls"), _PERIODIC_CALLS).value == "YES":
        reading.deadline_type = "CALL_BASED"

    for name, label in _LABELS.items():
        field: SourcedField = getattr(reading, name)
        if field.value is None and field.note:
            reading.warnings.append(f"{label} was left empty: {field.note}.")
    if reading.title.value is None:
        reading.warnings.append("No title was read. Type the call's name before saving.")
    return reading


class _Checker:
    """Field rules: each returns a SourcedField, filled only when the value is confirmed in the call."""

    def __init__(self, pages: Sequence[str], has_page_numbers: bool):
        self.locator = QuoteLocator(pages)
        self.full_text = "\n".join(pages)
        self.has_page_numbers = has_page_numbers

    def _source(self, entry: Any) -> Tuple[Dict[str, Any], SourcedField, bool]:
        entry = entry if isinstance(entry, dict) else {}
        quote = str(entry.get("source_quote") or "").strip()[:1000]
        cited = _int_or_none(entry.get("source_page"))
        found, page = self.locator.locate(quote, cited) if quote else (False, cited)
        return entry, SourcedField(source_quote=quote, source_page=page if self.has_page_numbers else None), found

    def text(self, entry: Any, max_len: int = _SHORT_TEXT) -> SourcedField:
        entry, field, found = self._source(entry)
        value = _clean_text(entry.get("value"))
        if value is None:
            return field
        field.as_written = value
        if not found:
            return _reject(field, "its sentence wasn't found in the call")
        if normalise(value) not in normalise(field.source_quote):
            return _reject(field, "the value isn't in the sentence it came from")
        field.value, field.verified = value[:max_len], True
        return field

    def copied(self, entry: Any) -> SourcedField:
        """Text that is itself a copy from the call (purpose, eligibility): the text must be found."""
        entry = entry if isinstance(entry, dict) else {}
        value = _clean_text(entry.get("value"))
        if value is None:
            return SourcedField()
        found, page = self.locator.locate(value, _int_or_none(entry.get("source_page")))
        field = SourcedField(as_written=value, source_quote=value[:1000],
                             source_page=page if self.has_page_numbers else None)
        if not found:
            return _reject(field, "this text wasn't found in the call")
        field.value, field.verified = value[:_LONG_TEXT], True
        return field

    def date(self, entry: Any) -> SourcedField:
        entry, field, found = self._source(entry)
        written = _clean_text(entry.get("as_written"))
        if written is None:
            return field
        field.as_written = written
        parsed = parse_date(written)
        if parsed is None:
            return _reject(field, f"\"{written}\" couldn't be read as a date")
        if not found:
            return _reject(field, "its sentence wasn't found in the call")
        if normalise(written) not in normalise(field.source_quote):
            return _reject(field, "the date isn't in the sentence it came from")
        field.value, field.verified = parsed.isoformat(), True
        return field

    def amount(self, entry: Any) -> SourcedField:
        entry, field, found = self._source(entry)
        written = _clean_text(entry.get("as_written"))
        if written is None:
            return field
        field.as_written = written
        rupees, number = to_rupees(written, entry.get("unit"))
        if rupees is None or rupees <= 0:
            return _reject(field, f"\"{written}\" couldn't be read as an amount")
        if _FOREIGN_MONEY.search(written) or _foreign_clause(field.source_quote, number):
            return _reject(field, "the amount isn't in rupees")
        if not found:
            return _reject(field, "its sentence wasn't found in the call")
        if number not in numbers_in(field.source_quote):
            return _reject(field, "the amount isn't in the sentence it came from")
        field.value, field.verified = rupees, True
        return field

    def url(self, entry: Any) -> SourcedField:
        entry, field, found = self._source(entry)
        value = _clean_text(entry.get("value"))
        if value is None:
            return field
        value = value.rstrip(".,;)")
        field.as_written = value
        if not re.match(r"^(https?://)?[\w-]+(\.[\w-]+)+(/\S*)?$", value, re.IGNORECASE):
            return _reject(field, f"\"{value}\" isn't a web address")
        # Links must be copied exactly, so compare with the raw text, not the normalised quote.
        if not found or value.lower() not in re.sub(r"\s+", "", self.full_text.lower()):
            return _reject(field, "the link wasn't found in the call")
        field.value = value if re.match(r"^https?://", value, re.IGNORECASE) else "https://" + value
        field.verified = True
        return field

    def yes_no(self, entry: Any) -> SourcedField:
        entry, field, found = self._source(entry)
        value = entry.get("value")
        if not isinstance(value, bool):
            return field
        field.as_written = "YES" if value else "NO"
        if not found:
            return _reject(field, "its sentence wasn't found in the call")
        field.value, field.verified = field.as_written, True
        return field

    def cue(self, entry: Any, cue: re.Pattern) -> SourcedField:
        """A yes that counts only when its sentence is found and actually says so (e.g. "throughout the year")."""
        entry, field, found = self._source(entry)
        if entry.get("value") is not True:
            return field
        field.as_written = "YES"
        if not found:
            return _reject(field, "its sentence wasn't found in the call")
        if not cue.search(field.source_quote):
            return _reject(field, "its sentence doesn't say so")
        field.value, field.verified = "YES", True
        return field

    def choice(self, entry: Any, allowed: Sequence[str]) -> SourcedField:
        entry, field, found = self._source(entry)
        value = _clean_text(entry.get("value"))
        if value is None:
            return field
        match = next((option for option in allowed if option.lower() == value.lower()), None)
        if match is None:
            return field
        field.as_written = match
        if not found:
            return _reject(field, "its sentence wasn't found in the call")
        field.value, field.verified = match, True
        return field


def _reject(field: SourcedField, note: str) -> SourcedField:
    field.value, field.verified, field.note = None, False, note
    return field


def _foreign_clause(quote: str, number: Any) -> bool:
    """Whether the part of the quote holding the amount is in another currency.

    Judged clause by clause, so "up to Rs. 25 lakh; the partner gets up to EUR 50,000" keeps the 25 lakh.
    """
    clauses = [c for c in re.split(r";|\.\s|\n", quote or "") if c.strip()] or [quote or ""]
    holding = next((c for c in clauses if number in numbers_in(c)), quote or "")
    return bool(_FOREIGN_MONEY.search(holding)) and not _RUPEES.search(holding)


def _clean_text(value: Any) -> Optional[str]:
    if value is None or isinstance(value, (bool, dict, list)):
        return None
    text = str(value).strip().strip('"“”').strip()
    return None if not text or text.lower() in {"null", "none", "n/a"} else text


def _int_or_none(value: Any) -> Optional[int]:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def summarise(reading: CallReading) -> Dict[str, Any]:
    """Counts for logs: fields filled, deadline type, warnings."""
    return {
        "filled": sum(1 for name in _LABELS if getattr(reading, name).value is not None),
        "deadline_type": reading.deadline_type,
        "warnings": len(reading.warnings),
    }
