"""Draft a progress report from a grant's recorded entries (Objective 4, 4.4).

The draft follows the usual headings of an Indian agency report. Code
writes everything that is a plain restatement of the records, so the
LLM can't misquote it:
  * Project details, Objectives, Outputs (the lists of papers, students,
    equipment, patents, milestones) and Utilization of funds.
The LLM writes only the narrative, from the same numbered entries:
  * Summary of progress, Work done (against each objective) and
    Deviations (only from the PI's own note).
Every sentence, from code or the LLM, cites its entries and goes through
the claim check. Where nothing recorded can fill a part, the draft holds an
instruction in [square brackets] for the PI instead of a guess.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from llm.gateway import generate_json, track_usage
from workspace.quote_check import normalise

from .claim_check import ABBREVIATIONS, check_sections
from .report_entries import OUTPUT_LABEL, Entry, build_entries, format_date, format_inr, HEAD_LABEL
from .schemas import (
    CheckDraftRequest, DraftBlock, DraftEntry, DraftSection, DraftSentence, ReportDraft, ReportInput,
)

logger = logging.getLogger("award.report_writer")

MAX_SENTENCE_CHARS = 1500
MAX_SOURCES = 20
OUTPUT_GROUPS = [("PAPER", "Papers"), ("STUDENT", "Students trained"), ("EQUIPMENT", "Equipment bought"),
                 ("PATENT", "Patents"), ("MILESTONE", "Milestones reached"), ("OTHER", "Other outputs")]
_ENTRY_ID = r"(?:grant|period|note|obj_\d+|out_\d+|budget_[A-Z]+|budget_total)"
_INLINE_CITATION = re.compile(rf"\s*[\[(]\s*({_ENTRY_ID}(?:\s*,\s*{_ENTRY_ID})*)\s*[\])]")

_PROMPT = """You are drafting parts of the {report_name} of an Indian research grant, for the Principal Investigator to review and edit. You may use ONLY the numbered entries below; they are everything recorded about the project.

ENTRIES
{entries}

Write three parts:
1. "summary": 2 to 4 sentences summarising the progress made in this period.
2. "work_done": for each objective the entries show work on, 1 to 5 sentences describing that work. Skip an objective that no output or note relates to; never write that work was done without an entry showing it. Work that fits no objective goes under "objective": null.
3. "deviations": {deviations_rule}

Return JSON exactly in this shape:
{{
  "summary": [{{"text": "...", "sources": ["period", "out_12"]}}],
  "work_done": [{{"objective": "obj_1", "sentences": [{{"text": "...", "sources": ["out_3"]}}]}}],
  "deviations": [{{"text": "...", "sources": ["note"]}}]
}}

Rules:
- "sources" lists the ids of every entry the sentence relies on. A sentence that states a fact must cite the entry it comes from.
- State only what the cited entries say. Do not add results, findings, methods, places, people, institutions, numbers or plans they don't give, and do not judge the work ("successfully", "significant", "excellent", "novel", "good progress").
- Do not compare a result with an objective or target, or say whether an objective was met; the reviewer judges that.
- Any number, amount, date, name or title you write must appear in a cited entry. Write numbers as digits. Do not add, subtract or work out percentages or durations. You may count the entries you cite ("2 papers were published", citing both papers); when you give a count, cite every entry you count.
- Each item in a list is one sentence.
- Write a date only as precisely as the entry gives it: "June 2027" stays "June 2027".
- Put paper and patent titles in double quotes, exactly as the entry gives them.
- Don't list every output; the report lists them separately. Mention an output where it shows progress on an objective.
- In "work_done", put each output under the one objective it fits best and state each fact once. Delays, problems and changes to the plan belong in "deviations", not in "work_done".
- Formal style of an Indian agency report: third person, past tense, plain English, at most 40 words per sentence. Do not put entry ids in the text.
"""

_DEVIATIONS_FROM_NOTE = ("restate, formally, what the [note] entry says about changes to the plan, delays or problems, "
                         "citing \"note\". If the note says nothing of the kind, return an empty list.")


async def write_draft(report: ReportInput) -> ReportDraft:
    entries = build_entries(report)
    outputs = [e for e in entries.values() if e.kind in OUTPUT_LABEL]
    warnings: List[str] = []
    raw: Dict[str, Any] = {}
    model = ""
    if outputs or "note" in entries:
        with track_usage() as usage:
            answer = await generate_json(
                _prompt(report, entries), task="progress_report", temperature=0.2, max_output_tokens=8192,
                retries=1, thinking_budget=2048,
            )
        raw = answer if isinstance(answer, dict) else {}
        model = ", ".join(usage.summary()["models"])
    else:
        warnings.append("Nothing is recorded for this period, so only the fixed parts were filled in. "
                        "Add outputs on the grant page and draft again.")

    sections = assemble(report, entries, raw)
    draft = ReportDraft(title=report.title, sections=sections, model=model, warnings=warnings,
                        entries=[DraftEntry(id=e.id, label=e.label) for e in entries.values()])
    _number_sentences(draft.sections)
    draft.unsupported_count, draft.placeholder_count, draft.confirmed_count = check_sections(draft.sections, entries)
    return draft


def recheck(request: CheckDraftRequest) -> ReportDraft:
    """Checks a draft the PI edited against the records as they are now."""
    entries = build_entries(request.report)
    sections = [_clean_section(section) for section in request.sections]
    draft = ReportDraft(title=request.title or request.report.title, sections=sections,
                        entries=[DraftEntry(id=e.id, label=e.label) for e in entries.values()])
    _number_sentences(draft.sections)
    draft.unsupported_count, draft.placeholder_count, draft.confirmed_count = check_sections(draft.sections, entries)
    return draft


def _prompt(report: ReportInput, entries: Dict[str, Entry]) -> str:
    report_name = "final technical report" if report.kind == "FINAL_REPORT" else "progress report"
    deviations_rule = _DEVIATIONS_FROM_NOTE if "note" in entries else "return an empty list."
    lines = "\n".join(f"[{entry.id}] {entry.text}" for entry in entries.values())
    return _PROMPT.format(report_name=report_name, entries=lines, deviations_rule=deviations_rule)


# ---------------------------------------------------------------------------
# Assembling the draft
# ---------------------------------------------------------------------------

def assemble(report: ReportInput, entries: Dict[str, Entry], raw: Dict[str, Any]) -> List[DraftSection]:
    """The draft's sections: code-written ones from the records, narrative ones from the LLM's answer."""
    objective_ids = [e.id for e in entries.values() if e.kind == "OBJECTIVE"]
    summary = _sentences(raw.get("summary"))
    work = _work_done(raw.get("work_done"), dict(zip(objective_ids, report.objectives)))
    deviations = _sentences(raw.get("deviations")) if "note" in entries else []

    return [
        DraftSection(key="details", heading="Project details", blocks=[_details(report)]),
        DraftSection(key="objectives", heading="Objectives", blocks=[DraftBlock(style="list", sentences=[
            _code(f"{report.objectives[i]}", oid) for i, oid in enumerate(objective_ids)
        ] or [_placeholder("Add the project's objectives on the grant page, then draft again.")])]),
        DraftSection(key="summary", heading="Summary of progress", blocks=[DraftBlock(
            sentences=summary or [_placeholder("Summarise the progress made in this period.")])]),
        DraftSection(key="work_done", heading="Work done during the period",
                     blocks=_work_blocks(report, objective_ids, work)),
        DraftSection(key="deviations", heading="Deviations from the plan", blocks=[DraftBlock(
            sentences=deviations or [_placeholder(
                "Describe any change to the planned work and its reason, or state that the work went as planned.")])]),
        DraftSection(key="outputs", heading="Outputs", blocks=_output_blocks(report)),
        DraftSection(key="utilization", heading="Utilization of funds", blocks=[_utilization(report)]),
    ]


def _details(report: ReportInput) -> DraftBlock:
    g = report.grant
    lines = [_code(f"Project title: {g.project_title}", "grant")]
    if g.agency:
        lines.append(_code(f"Funding agency: {g.agency}", "grant"))
    if g.scheme:
        lines.append(_code(f"Scheme: {g.scheme}", "grant"))
    if g.sanction_no or g.sanction_date:
        order = ", ".join(filter(None, [g.sanction_no, g.sanction_date and f"dated {format_date(g.sanction_date)}"]))
        lines.append(_code(f"Sanction order: {order}", "grant"))
    lines.append(_code(f"Project period: {format_date(g.start_date)} to {format_date(g.end_date)}", "grant"))
    lines.append(_code(f"Period covered by this report: {format_date(report.period_start)} to "
                       f"{format_date(report.period_end)}", "period"))
    if g.total_sanctioned:
        lines.append(_code(f"Total sanctioned: {format_inr(g.total_sanctioned)}", "grant"))
    return DraftBlock(style="list", sentences=lines)


def _work_blocks(report: ReportInput, objective_ids: List[str],
                 work: Dict[Optional[str], List[DraftSentence]]) -> List[DraftBlock]:
    if not objective_ids:
        sentences = [s for group in work.values() for s in group]
        return [DraftBlock(sentences=sentences or [_placeholder("Describe the work done in this period.")])]
    blocks = []
    for number, oid in enumerate(objective_ids, start=1):
        blocks.append(DraftBlock(
            heading=f"Objective {number}: {report.objectives[number - 1]}",
            sentences=work.get(oid) or [_placeholder(
                "No outputs are recorded against this objective for this period. Describe the work done, "
                "or add the outputs on the grant page and draft again.")]))
    if work.get(None):
        blocks.append(DraftBlock(heading="Other work", sentences=work[None]))
    return blocks


def _output_blocks(report: ReportInput) -> List[DraftBlock]:
    blocks = []
    for kind, heading in OUTPUT_GROUPS:
        items = [o for o in report.outputs if o.type == kind]
        if items:
            blocks.append(DraftBlock(heading=heading, style="list",
                                     sentences=[_code(_output_line(o), f"out_{o.id}") for o in items]))
    return blocks or [DraftBlock(sentences=[_placeholder(
        "No outputs are recorded for this period. Add them on the grant page and draft again.")])]


def _output_line(output) -> str:
    """One list line per output, written only from its own fields."""
    date = format_date(output.date) if output.date else None
    if output.type == "PAPER":
        line = ", ".join(filter(None, [f'"{output.title}"', output.details, date]))
        return line + (f". DOI: {output.reference}" if output.reference else "")
    if output.type == "PATENT":
        return ", ".join(filter(None, [f'"{output.title}"', output.details,
                                       output.reference and f"No. {output.reference}", date]))
    if output.type == "EQUIPMENT":
        line = ", ".join(filter(None, [output.title, output.amount and format_inr(output.amount), date]))
        return line + (f". {output.details}" if output.details else "")
    line = output.title + (f": {output.details}" if output.details else "")
    line += f" ({date})" if date else ""
    return line + (f". Reference: {output.reference}" if output.reference else "")


def _utilization(report: ReportInput) -> DraftBlock:
    if not report.budget:
        return DraftBlock(sentences=[_placeholder("Add the budget heads on the grant page, then draft again.")])
    lines = [_code(f"{HEAD_LABEL[line.head]}: {format_inr(line.allocated)} allocated for the whole project",
                   f"budget_{line.head}") for line in report.budget]
    lines.append(_code(f"Total of the heads: {format_inr(sum(l.allocated for l in report.budget))}", "budget_total"))
    lines.append(_placeholder("Add the amount spent under each head in this period, from your institute's "
                              "statement of expenditure."))
    return DraftBlock(style="list", sentences=lines)


# ---------------------------------------------------------------------------
# Reading the LLM's answer
# ---------------------------------------------------------------------------

def _work_done(raw: Any, objectives: Dict[str, str]) -> Dict[Optional[str], List[DraftSentence]]:
    """Sentences by objective id (objectives: id → text); None collects work that fits no objective."""
    groups: Dict[Optional[str], List[DraftSentence]] = {}
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        sentences = _sentences(item.get("sentences"))
        key = _objective_id(item.get("objective"), objectives)
        if key is None:  # unnamed: the first objective its sentences cite
            key = next((s for sentence in sentences for s in sentence.sources if s in objectives), None)
        groups.setdefault(key, []).extend(sentences)
    return groups


def _objective_id(value: Any, objectives: Dict[str, str]) -> Optional[str]:
    """"obj_2", "[obj_2]", "Objective 2", "Objective 2: To validate …", 2 or the
    objective's own words → "obj_2", when that objective exists."""
    if value is None or isinstance(value, (dict, list, bool)):
        return None
    text = str(value).strip().strip("[]()").strip().lower()
    match = re.match(r"(?:obj(?:ective)?[\s_#-]*)?(\d+)\b", text)
    if match and f"obj_{int(match.group(1))}" in objectives:
        return f"obj_{int(match.group(1))}"
    if text in objectives:
        return text
    words = normalise(text)
    return next((oid for oid, objective in objectives.items() if words and normalise(objective) in words), None)


def _sentences(raw: Any) -> List[DraftSentence]:
    out = []
    for item in raw if isinstance(raw, list) else []:
        if isinstance(item, str):
            item = {"text": item}
        if not isinstance(item, dict):
            continue
        text, cited = _strip_inline_citations(str(item.get("text") or ""))
        sources = _sources(item.get("sources")) + cited
        # One sentence per item, so the check marks (and the PI edits) only the sentence at fault.
        for piece in split_sentences(text):
            out.append(DraftSentence(text=piece[:MAX_SENTENCE_CHARS], sources=list(sources), origin="AI"))
    for sentence in out:
        sentence.sources = list(dict.fromkeys(sentence.sources))[:MAX_SOURCES]
    return out


_SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"“(])")


def split_sentences(text: str) -> List[str]:
    """Splits text the LLM wrote as one item into sentences, not breaking after "Dr.", "M.Sc.", "Rs." and the like."""
    pieces: List[str] = []
    for part in _SENTENCE_BREAK.split(text.strip()):
        previous = pieces[-1] if pieces else ""
        last_word = previous.rsplit(None, 1)[-1].rstrip(".").lower() if previous else ""
        if previous and (last_word in ABBREVIATIONS or len(last_word) == 1):  # "Dr. Rao", "K. M. Bopanna"
            pieces[-1] = f"{previous} {part}"
        else:
            pieces.append(part)
    return [p for p in pieces if p]


def _sources(raw: Any) -> List[str]:
    if isinstance(raw, str):
        raw = raw.split(",")
    if not isinstance(raw, list):
        return []
    return [str(s).strip().strip("[]()").strip() for s in raw if str(s).strip()]


def _strip_inline_citations(text: str) -> Tuple[str, List[str]]:
    """Moves "[out_12]"-style ids the LLM left in the text into the sources."""
    cited: List[str] = []

    def take(match: re.Match) -> str:
        cited.extend(part.strip() for part in match.group(1).split(","))
        return ""

    cleaned = _INLINE_CITATION.sub(take, text)
    return " ".join(cleaned.split()), cited


def _clean_section(section: DraftSection) -> DraftSection:
    for block in section.blocks:
        kept = []
        for sentence in block.sentences:
            sentence.text = " ".join(sentence.text.split())[:MAX_SENTENCE_CHARS]
            sentence.sources = list(dict.fromkeys(s.strip() for s in sentence.sources if s.strip()))[:MAX_SOURCES]
            if sentence.text:
                kept.append(sentence)
        block.sentences = kept
    return section


def _number_sentences(sections: List[DraftSection]) -> None:
    """Gives every sentence a unique id ("s1", "s2" …), keeping ids that are already unique."""
    seen = set()
    sentences = [s for section in sections for block in section.blocks for s in block.sentences]
    for sentence in sentences:
        if sentence.id and sentence.id not in seen:
            seen.add(sentence.id)
        else:
            sentence.id = ""
    counter = 0
    for sentence in sentences:
        if not sentence.id:
            counter += 1
            while f"s{counter}" in seen:
                counter += 1
            sentence.id = f"s{counter}"
            seen.add(sentence.id)


def _code(text: str, source: str) -> DraftSentence:
    return DraftSentence(text=text, sources=[source], origin="CODE")


def _placeholder(instruction: str) -> DraftSentence:
    return DraftSentence(text=f"[{instruction}]", origin="CODE", placeholder=True)
