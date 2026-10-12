"""The unsupported-claim check for progress-report drafts (4.4).

Every sentence of a draft lists the entries it relies on (see
report_entries). Code, never the LLM, then decides whether it is supported:
  * every entry it cites exists;
  * every amount, date, number, quoted title and name in it appears in at
    least one cited entry: amounts are compared in rupees after reading
    lakh and crore (to the precision written, so "₹8.5 lakh" matches
    8,47,000), and dates at the precision written ("March 2027" matches
    14 March 2027, but "14 March 2027" doesn't match "March 2027");
  * a count ("2 papers") may instead equal the number of cited entries, or
    of cited entries of one kind;
  * a sentence citing nothing states no facts at all.
Text wholly in [square brackets] is an instruction for the PI, not a claim.

What it can't see is a claim with no number, date, name or title in it
("the sensor worked well"), or a one-word name opening a sentence ("Ravi
joined …", where "Ravi" reads like any capitalised first word; "Ravi Kumar
joined …" is caught by "Kumar"). The evaluation has a person read each draft.
The same extraction runs on sentences and on entries, so an identifier
such as a DOI or a sanction number matches itself.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Sequence, Set, Tuple

from workspace.quote_check import normalise

from .report_entries import CRORE, LAKH, OUTPUT_LABEL, Entry
from .schemas import DraftSection

_MONTH_NUMBERS = {name: number for number, names in enumerate([
    ("january", "jan"), ("february", "feb"), ("march", "mar"), ("april", "apr"), ("may",), ("june", "jun"),
    ("july", "jul"), ("august", "aug"), ("september", "sept", "sep"), ("october", "oct"),
    ("november", "nov"), ("december", "dec"),
], start=1) for name in names}
# Longest first, so "june" is tried before "jun" and "sept" before "sep".
_MONTH = "(?:" + "|".join(sorted(_MONTH_NUMBERS, key=len, reverse=True)) + r")\.?"
_NUM = r"\d[\d,]*(?:\.\d+)?"

_QUOTE = re.compile(r'"([^"\n]{3,})"|“([^”\n]{3,})”')
_AMOUNT_SYMBOL = re.compile(rf"(?:₹|\brs\.?|\binr\b)\s*({_NUM})(?:\s*(lakhs?|lacs?|crores?|cr)\b)?", re.I)
_AMOUNT_UNIT = re.compile(rf"\b({_NUM})\s*(lakhs?|lacs?|crores?)\b", re.I)
# Ranges that share one year: "June to August 2027" is June 2027 to August 2027; "1 to 15 March 2027" likewise.
_RANGE_JOIN = r"\s*(?:to|until|till|through|and|-|–|—)\s*"
_MONTH_RANGE = re.compile(rf"\b({_MONTH}){_RANGE_JOIN}({_MONTH}),?\s+(\d{{4}})\b", re.I)
_DAY_RANGE = re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?{_RANGE_JOIN}(\d{{1,2}})(?:st|nd|rd|th)?\s+({_MONTH}),?\s+(\d{{4}})\b", re.I)
_DATE_DMY = re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s+({_MONTH}),?\s+(\d{{4}})\b", re.I)
_DATE_MDY = re.compile(rf"\b({_MONTH})\s+(\d{{1,2}})(?:st|nd|rd|th)?,\s*(\d{{4}})\b", re.I)
_DATE_NUMERIC = re.compile(r"\b(\d{1,2})([./-])(\d{1,2})\2(\d{4})\b")
_DATE_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_ISO_MONTH_OR_FY = re.compile(r"\b(\d{4})-(\d{2})\b")
_MONTH_YEAR = re.compile(rf"\b({_MONTH}),?\s+(\d{{4}})\b", re.I)
_PERCENT = re.compile(r"(\d+(?:\.\d+)?)\s*(?:%|per\s?cent\b)", re.I)
_YEAR = re.compile(r"\b(19\d{2}|20\d{2})\b")
_NUMBER = re.compile(_NUM)
# "one" is left out: "one of the objectives" is rarely a count.
_NUMBER_WORDS = {word: number for number, word in enumerate(
    ["two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
     "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"], start=2)}
_NUMBER_WORD = re.compile(r"\b(" + "|".join(_NUMBER_WORDS) + r")\b", re.I)
_TOKEN = re.compile(r"[A-Za-z](?:[A-Za-z'’\-]|\.(?=[A-Za-z]))*")
_PLACEHOLDER = re.compile(r"\[[^\[\]]+\]")

_UNIT_FACTOR = {"lakh": Decimal(LAKH), "crore": Decimal(CRORE), "rupees": Decimal(1)}
_HONORIFICS = {"dr", "prof", "mr", "ms", "mrs", "shri", "smt", "sri"}
# Words whose full stop doesn't end a sentence ("Dr. Rao", "an M.Sc. student", "Rs. 5 lakh"). Initials count too.
ABBREVIATIONS = _HONORIFICS | {"no", "nos", "rs", "vs", "fig", "approx", "e.g", "i.e", "al", "m.sc", "b.sc", "ph.d",
                               "m.tech", "b.tech", "m.phil", "m.e", "b.e", "dept", "univ", "st"}
# Capitalised words a report uses without naming anyone or anything in particular.
_GENERIC_WORDS = set(_MONTH_NUMBERS) | _HONORIFICS | {
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "jrf", "srf", "ra", "pa", "phd", "ph.d", "m.tech", "mtech", "b.tech", "btech", "tech", "msc", "m.sc", "bsc",
    "b.sc", "mphil", "m.phil", "me", "m.e", "pi", "co-pi", "copi", "principal", "investigator", "investigators",
    "objective", "objectives", "year", "years", "phase", "work", "package", "project", "projects", "report",
    "annual", "progress", "final", "technical", "summary", "deviation", "deviations", "output", "outputs",
    "utilization", "utilisation", "fund", "funds", "budget", "head", "heads", "equipment", "manpower",
    "consumables", "consumable", "travel", "contingency", "overhead", "others", "grant", "scheme", "sanction",
    "order", "certificate", "uc", "se", "doi", "orcid", "rs", "inr", "lakh", "lakhs", "crore", "crores", "india",
    "indian", "government", "note", "period", "total", "milestone", "milestones", "paper", "papers", "patent",
    "patents", "student", "students", "journal", "conference", "proceedings", "fy", "no",
    # Positions ("Junior Research Fellow" is JRF spelt out) and kinds of organisation. A named
    # institution still has its distinctive word checked: "Kanpur" in "Indian Institute of Technology Kanpur".
    "junior", "senior", "research", "fellow", "fellows", "fellowship", "associate", "assistant", "scientist",
    "scientists", "technician", "postdoctoral", "post-doctoral", "doctoral", "intern", "trainee", "professor",
    "lecturer", "faculty", "laboratory", "lab", "department", "institute", "university", "college", "school",
    "centre", "center", "thesis", "master", "masters", "bachelor",
}
_SENTENCE_END = (".", "!", "?")


@dataclass
class Facts:
    """What a piece of text states, each kept with the words it was written as."""
    amounts: List[Tuple[int, Decimal, str]] = field(default_factory=list)  # rupees, tolerance, as written
    dates: List[Tuple[str, str]] = field(default_factory=list)  # "2027", "2027-03" or "2027-03-14"
    numbers: List[Tuple[Decimal, str]] = field(default_factory=list)
    quotes: List[str] = field(default_factory=list)
    names: List[str] = field(default_factory=list)

    def written(self) -> List[str]:
        return ([w for _, _, w in self.amounts] + [w for _, w in self.dates] + [w for _, w in self.numbers]
                + self.quotes + self.names)


def extract_facts(text: str) -> Facts:
    """Amounts, dates, numbers, quoted titles and names in `text`.

    Matched spans are blanked as they're read (amounts before dates before
    plain numbers), so "14 March 2027" is one date, not two numbers.
    """
    facts = Facts()
    work = text or ""

    def take(pattern: re.Pattern, handle) -> None:
        nonlocal work
        for match in list(pattern.finditer(work)):
            if handle(match) is not False:
                start, end = match.span()
                work = work[:start] + " " * (end - start) + work[end:]

    def quote(m: re.Match) -> None:
        facts.quotes.append((m.group(1) or m.group(2)).strip())

    def amount(m: re.Match) -> bool:
        parsed = _amount(m.group(1), m.group(2))
        if parsed is None:
            return False
        facts.amounts.append((*parsed, m.group(0).strip()))

    def month_range(m: re.Match) -> bool:
        first = _MONTH_NUMBERS[m.group(1).lower().rstrip(".")]
        last = _MONTH_NUMBERS[m.group(2).lower().rstrip(".")]
        return (_add_date(facts, m.group(3), first, None, m.group(0))
                and _add_date(facts, m.group(3), last, None, m.group(0)))

    def day_range(m: re.Match) -> bool:
        month = _MONTH_NUMBERS[m.group(3).lower().rstrip(".")]
        return (_add_date(facts, m.group(4), month, m.group(1), m.group(0))
                and _add_date(facts, m.group(4), month, m.group(2), m.group(0)))

    def dmy(m: re.Match) -> bool:
        return _add_date(facts, m.group(3), _MONTH_NUMBERS[m.group(2).lower().rstrip(".")], m.group(1), m.group(0))

    def mdy(m: re.Match) -> bool:
        return _add_date(facts, m.group(3), _MONTH_NUMBERS[m.group(1).lower().rstrip(".")], m.group(2), m.group(0))

    def numeric(m: re.Match) -> bool:
        return _add_date(facts, m.group(4), int(m.group(3)), m.group(1), m.group(0))

    def iso_day(m: re.Match) -> bool:
        return _add_date(facts, m.group(1), int(m.group(2)), m.group(3), m.group(0))

    def iso_month_or_fy(m: re.Match) -> bool:
        year, second = int(m.group(1)), int(m.group(2))
        if 1 <= second <= 12:
            return _add_date(facts, m.group(1), second, None, m.group(0))
        if second == (year + 1) % 100:  # a financial year, "2026-27"
            facts.dates.append((str(year), m.group(0)))
            facts.dates.append((str(year + 1), m.group(0)))
            return True
        return False

    def month_year(m: re.Match) -> bool:
        return _add_date(facts, m.group(2), _MONTH_NUMBERS[m.group(1).lower().rstrip(".")], None, m.group(0))

    def percent(m: re.Match) -> None:
        facts.numbers.append((Decimal(m.group(1)), m.group(0).strip()))

    def year(m: re.Match) -> None:
        facts.dates.append((m.group(1), m.group(1)))

    def number(m: re.Match) -> bool:
        written = m.group(0).rstrip(",")
        try:
            facts.numbers.append((Decimal(written.replace(",", "")), written))
        except InvalidOperation:
            return False

    def number_word(m: re.Match) -> None:
        facts.numbers.append((Decimal(_NUMBER_WORDS[m.group(1).lower()]), m.group(1)))

    take(_QUOTE, quote)
    take(_AMOUNT_SYMBOL, amount)
    take(_AMOUNT_UNIT, amount)
    for pattern, handle in ((_MONTH_RANGE, month_range), (_DAY_RANGE, day_range),
                            (_DATE_DMY, dmy), (_DATE_MDY, mdy), (_DATE_NUMERIC, numeric), (_DATE_ISO, iso_day),
                            (_ISO_MONTH_OR_FY, iso_month_or_fy), (_MONTH_YEAR, month_year)):
        take(pattern, handle)
    take(_PERCENT, percent)
    take(_YEAR, year)
    take(_NUMBER, number)
    take(_NUMBER_WORD, number_word)
    facts.names = _names(text or "", work)
    return facts


def _amount(written: str, unit_word: str | None) -> Tuple[int, Decimal] | None:
    try:
        number = Decimal(written.rstrip(",").replace(",", ""))
    except InvalidOperation:
        return None
    unit = (unit_word or "").lower()
    unit = "lakh" if unit.startswith(("lakh", "lac")) else "crore" if unit.startswith("cr") else "rupees"
    factor = _UNIT_FACTOR[unit]
    decimals = len(written.split(".")[1]) if "." in written else 0
    tolerance = max(factor * Decimal(10) ** -decimals / 2, Decimal("0.5"))
    return int((number * factor).to_integral_value()), tolerance


def _add_date(facts: Facts, year: str, month: int, day: str | None, written: str) -> bool:
    try:
        y = int(year)
        if day is None:
            date(y, month, 1)
            facts.dates.append((f"{y:04d}-{month:02d}", written.strip()))
        else:
            d = int(day)
            date(y, month, d)
            facts.dates.append((f"{y:04d}-{month:02d}-{d:02d}", written.strip()))
        return True
    except ValueError:  # 31 June, a month 13
        return False


def _names(original: str, work: str) -> List[str]:
    """Capitalised words that aren't generic report words or the first word of a sentence.

    `work` is `original` with quotes, amounts and dates blanked out, at the
    same offsets, so words inside a quoted title aren't counted twice.
    """
    names: List[str] = []
    previous_token = ""
    for match in _TOKEN.finditer(work):
        token = re.sub(r"(['’]s|['’\-])$", "", match.group(0))
        before = original[:match.start()].rstrip()
        after_abbreviation = previous_token.lower() in ABBREVIATIONS or len(previous_token) == 1  # "K. M. Bopanna"
        sentence_start = not before or (before.endswith(_SENTENCE_END) and not after_abbreviation)
        previous_token = token
        # A capitalised first word is usually just a first word; an acronym ("IIT …") is still a name.
        if len(token) < 2 or not token[0].isupper() or (sentence_start and not token.isupper()):
            continue
        lower = token.lower()
        parts = [p for p in re.split(r"[.\-]", lower) if p]
        if lower in _GENERIC_WORDS or (parts and all(p in _GENERIC_WORDS for p in parts)):
            continue
        names.append(token)
    return names


@dataclass
class _Pool:
    """The facts of the entries a sentence cites, merged."""
    numbers: Set[Decimal] = field(default_factory=set)
    amounts: List[int] = field(default_factory=list)
    dates: Set[str] = field(default_factory=set)
    text: str = ""
    words: Set[str] = field(default_factory=set)
    counts: Set[int] = field(default_factory=set)


def _pool(cited: Sequence[Entry]) -> _Pool:
    pool = _Pool()
    texts = []
    for entry in cited:
        facts = extract_facts(entry.text)
        pool.amounts.extend([a for a, _, _ in facts.amounts] + list(entry.amounts))
        pool.dates.update([d for d, _ in facts.dates] + list(entry.dates))
        pool.numbers.update(n for n, _ in facts.numbers)
        for written in _NUMBER.findall(entry.text):  # every number as printed, dates and amounts included
            try:
                pool.numbers.add(Decimal(written.rstrip(",").replace(",", "")))
            except InvalidOperation:
                pass
        texts.append(entry.text)
        for match in _TOKEN.finditer(entry.text):
            word = match.group(0).lower().rstrip("'’-")
            pool.words.add(word)
            pool.words.update(p for p in re.split(r"[.\-]", word) if p)
    for amount in pool.amounts:
        pool.numbers.update({Decimal(amount), Decimal(amount) / LAKH, Decimal(amount) / CRORE})
    pool.numbers.update(Decimal(int(d[:4])) for d in pool.dates if d[:4].isdigit())
    pool.text = normalise(" ".join(texts))
    kinds = Counter(entry.kind for entry in cited)
    pool.counts = {len(cited), sum(n for kind, n in kinds.items() if kind in OUTPUT_LABEL), *kinds.values()}
    return pool


def is_placeholder(text: str) -> bool:
    return bool(_PLACEHOLDER.fullmatch((text or "").strip()))


def check_sentence(text: str, sources: Sequence[str], entries: Dict[str, Entry]) -> List[str]:
    """Why the sentence isn't supported by the entries it cites; empty when it is."""
    problems: List[str] = []
    for source in dict.fromkeys(sources):
        if source not in entries:
            problems.append(f"It cites {source}, which isn't one of your records.")
    cited = [entries[s] for s in dict.fromkeys(sources) if s in entries]
    facts = extract_facts(text)

    if not sources:
        written = facts.written()
        if written:
            shown = ", ".join(f"“{w}”" for w in written[:3])
            problems.append(f"It states {shown} without citing any of your records.")
        return problems

    pool = _pool(cited)
    for rupees, tolerance, written in facts.amounts:
        if not any(abs(Decimal(a) - rupees) <= tolerance for a in pool.amounts):
            problems.append(f"“{written}” isn't in the records it cites.")
    for value, written in facts.dates:
        if not any(d.startswith(value) for d in pool.dates) and not (len(value) == 4 and Decimal(value) in pool.numbers):
            problems.append(f"“{written}” isn't in the records it cites.")
    for value, written in facts.numbers:
        is_count = value == value.to_integral_value() and int(value) in pool.counts
        if value not in pool.numbers and not is_count:
            problems.append(f"“{written}” isn't in the records it cites.")
    for quoted in facts.quotes:
        if normalise(quoted) not in pool.text:
            problems.append(f"The title “{quoted}” isn't in the records it cites.")
    for name in dict.fromkeys(facts.names):
        lower = name.lower()
        parts = [p for p in re.split(r"[.\-]", lower) if p]
        if lower not in pool.words and not (parts and all(p in pool.words for p in parts)):
            problems.append(f"“{name}” isn't named in the records it cites.")
    return problems


def check_sections(sections: List[DraftSection], entries: Dict[str, Entry]) -> Tuple[int, int, int]:
    """Checks every sentence in place. Returns (unsupported, placeholders, confirmed) counts.

    A confirmed sentence that now passes is no longer marked confirmed; one
    that still fails stays confirmed, because the PI kept it knowingly.
    """
    unsupported = placeholders = confirmed = 0
    for section in sections:
        for block in section.blocks:
            for sentence in block.sentences:
                sentence.placeholder = is_placeholder(sentence.text)
                if sentence.placeholder:
                    sentence.supported, sentence.problems, sentence.confirmed = True, [], False
                    placeholders += 1
                    continue
                sentence.problems = check_sentence(sentence.text, sentence.sources, entries)
                sentence.supported = not sentence.problems
                if sentence.supported:
                    sentence.confirmed = False
                elif sentence.confirmed:
                    confirmed += 1
                else:
                    unsupported += 1
    return unsupported, placeholders, confirmed
