"""The numbered entries a progress-report draft is written from (4.4).

Every recorded fact Spring Boot sends becomes one entry with a stable id:
  grant            the sanction details
  period           the period the report covers
  obj_1, obj_2 …   the objectives, in order
  out_<id>         each recorded output (paper, student, equipment …)
  budget_<HEAD>    each budget head's allocation, and budget_total
  note             what the PI asked the report to say
An entry's `text` is what the LLM is shown and what the claim check reads: a
sentence may state only the numbers, dates, names and titles found in the
entries it cites. Structured values (dates, amounts) are kept alongside, so
the check doesn't depend on how the text happens to word them.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .schemas import ReportInput

HEAD_LABEL = {
    "EQUIPMENT": "Equipment", "MANPOWER": "Manpower", "CONSUMABLES": "Consumables", "TRAVEL": "Travel",
    "CONTINGENCY": "Contingency", "OVERHEAD": "Overhead", "OTHERS": "Others",
}
OUTPUT_LABEL = {
    "PAPER": "Paper", "STUDENT": "Student trained", "EQUIPMENT": "Equipment bought", "PATENT": "Patent",
    "MILESTONE": "Milestone reached", "OTHER": "Other output",
}
_MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
                "October", "November", "December"]
LAKH, CRORE = 100_000, 10_000_000


@dataclass
class Entry:
    id: str
    # GRANT, PERIOD, OBJECTIVE, NOTE, BUDGET, or an output type (PAPER, STUDENT …)
    kind: str
    # Short, for the editor: 'Paper: "Arsenic sensing with paper strips"'.
    label: str
    text: str
    dates: List[str] = field(default_factory=list)
    amounts: List[int] = field(default_factory=list)


def build_entries(report: ReportInput) -> Dict[str, Entry]:
    """All entries of the report, by id, in the order the prompt lists them."""
    entries: Dict[str, Entry] = {}

    def add(entry: Entry) -> None:
        entries[entry.id] = entry

    g = report.grant
    parts = [f'project title: "{g.project_title}"']
    if g.agency:
        parts.append(f"funding agency: {g.agency}")
    if g.scheme:
        parts.append(f"scheme: {g.scheme}")
    if g.sanction_no or g.sanction_date:
        order = g.sanction_no or "number not recorded"
        parts.append(f"sanction order: {order}" + (f" dated {format_date(g.sanction_date)}" if g.sanction_date else ""))
    parts.append(f"project period: {format_date(g.start_date)} to {format_date(g.end_date)}")
    if g.total_sanctioned:
        parts.append(f"total sanctioned: {format_inr(g.total_sanctioned)} ({rupees_in_full(g.total_sanctioned)})")
    add(Entry("grant", "GRANT", "Grant details", "Grant details: " + "; ".join(parts) + ".",
              dates=[d for d in (g.sanction_date, g.start_date, g.end_date) if d],
              amounts=[g.total_sanctioned] if g.total_sanctioned else []))

    add(Entry("period", "PERIOD", "Period covered",
              f"Period covered by this report ({report.title}): "
              f"{format_date(report.period_start)} to {format_date(report.period_end)}.",
              dates=[report.period_start, report.period_end]))

    for number, objective in enumerate(report.objectives, start=1):
        add(Entry(f"obj_{number}", "OBJECTIVE", f"Objective {number}", f"Objective {number}: {objective}"))

    for output in report.outputs:
        prefix = OUTPUT_LABEL[output.type]
        title = f'"{output.title}"' if output.type in ("PAPER", "PATENT") else output.title
        parts = [f"{prefix}: {title}"]
        if output.details:
            parts.append(output.details)
        if output.date:
            parts.append(f"date: {format_date(output.date)}")
        if output.amount:
            parts.append(f"cost: {format_inr(output.amount)} ({rupees_in_full(output.amount)})")
        if output.reference:
            name = {"PAPER": "DOI", "PATENT": "number"}.get(output.type, "reference")
            parts.append(f"{name}: {output.reference}")
        add(Entry(f"out_{output.id}", output.type, f"{prefix}: {output.title}", "; ".join(parts) + ".",
                  dates=[output.date] if output.date else [],
                  amounts=[output.amount] if output.amount else []))

    heads_total = sum(line.allocated for line in report.budget)
    for line in report.budget:
        label = HEAD_LABEL[line.head]
        share = round(line.allocated * 100 / heads_total) if heads_total else 0
        add(Entry(f"budget_{line.head}", "BUDGET", f"Budget: {label}",
                  f"Budget head {label}: {format_inr(line.allocated)} ({rupees_in_full(line.allocated)}) allocated "
                  f"for the whole project, {share}% of the budget heads' total.",
                  amounts=[line.allocated]))
    if report.budget:
        add(Entry("budget_total", "BUDGET", "Budget: total of the heads",
                  f"Total of the budget heads: {format_inr(heads_total)} ({rupees_in_full(heads_total)}).",
                  amounts=[heads_total]))

    if report.notes and report.notes.strip():
        add(Entry("note", "NOTE", "Your note for this report",
                  "Note from the PI for this report: " + " ".join(report.notes.split())))
    return entries


def format_date(value: Optional[str]) -> str:
    """"2027" → "2027", "2027-03" → "March 2027", "2027-03-14" → "14 March 2027"."""
    if not value:
        return ""
    parts = value.split("-")
    try:
        if len(parts) == 1:
            return parts[0]
        month = _MONTH_NAMES[int(parts[1]) - 1]
        if len(parts) == 2:
            return f"{month} {parts[0]}"
        return f"{int(parts[2])} {month} {parts[0]}"
    except (ValueError, IndexError):
        return value


def format_inr(amount: int) -> str:
    """The app's style: "₹50,000", "₹8.5 lakh", "₹2.5 crore" (at most two decimals)."""
    if amount < LAKH:
        return "₹" + indian_grouping(amount)
    if amount < CRORE:
        return f"₹{_trim(amount / LAKH)} lakh"
    return f"₹{_trim(amount / CRORE)} crore"


def rupees_in_full(amount: int) -> str:
    """12,00,000 → "Rs. 12,00,000"."""
    return "Rs. " + indian_grouping(amount)


def indian_grouping(amount: int) -> str:
    digits = str(abs(int(amount)))
    if len(digits) <= 3:
        grouped = digits
    else:
        head, tail = digits[:-3], digits[-3:]
        pairs = []
        while len(head) > 2:
            pairs.insert(0, head[-2:])
            head = head[:-2]
        grouped = ",".join(([head] if head else []) + pairs + [tail])
    return ("-" if amount < 0 else "") + grouped


def _trim(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")
