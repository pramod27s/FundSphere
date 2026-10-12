"""Evaluation of progress-report drafts (4.4) on test-samples/objective4/reports.

For each case in cases.json (one of the five sample grants with objectives,
outputs and a note for one period) it:
  1. writes the draft with the real AI (one call per case; none when nothing
     is recorded for the period);
  2. counts the sentences the unsupported-claim check flags. The target is
     zero ("Done when" for 4.4 in fable.md);
  3. plants invented facts into copies of supported AI sentences (a changed
     number, a later year, a new person, a made-up title, an amount, the
     citation removed) and counts how many the check catches. The target is
     all of them. No AI calls: this tests the check, not the writer;
  4. with --judge, asks an AI judge to score completeness, accuracy and
     format out of 10 (target: mean of at least 7) and to list statements
     the records don't support, including the qualitative kind the check
     can't see ("the sensor worked well");
  5. writes every draft as Markdown, each sentence with its sources and
     verdict, for the person who reads each draft (fable.md: invented facts
     the check missed count against the target too).

Run from ai-service/:  .venv\\Scripts\\python.exe -m award.evaluate_reports [--judge] [--case R1 ...]
Exit code 1 if any draft has an unsupported sentence or a planted fact got past the check.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from award.claim_check import check_sentence, extract_facts  # noqa: E402
from award.report_entries import Entry, build_entries  # noqa: E402
from award.report_writer import write_draft  # noqa: E402
from award.schemas import DraftSentence, ReportDraft, ReportInput  # noqa: E402
from llm.gateway import generate_json, track_usage  # noqa: E402
from workspace.quote_check import normalise  # noqa: E402

REPORTS = os.path.join(os.path.dirname(__file__), "..", "..", "test-samples", "objective4", "reports")
PLANTS_PER_CASE = 4  # supported AI sentences each case plants into

# ---------------------------------------------------------------------------
# Planted facts: each turns a supported sentence into one with an invented fact
# ---------------------------------------------------------------------------


def _before_full_stop(text: str, addition: str) -> str:
    return text[:-1] + addition + "." if text.endswith(".") else text + addition


def _in_records(value: str, cited: List[Entry]) -> bool:
    """True when the value is printed in, or is the year of a date of, a cited record: then it's no invention."""
    return any(re.search(rf"(?<![\d.]){re.escape(value)}(?![\d])", e.text) or any(d.startswith(value) for d in e.dates)
               for e in cited)


def _plant_number(text: str, cited: List[Entry]) -> Optional[str]:
    """The first plain number (not a year) raised to a value no cited record has."""
    for match in re.finditer(r"(?<![\d.,/])\d+(?![\d.,/])", text):
        value = int(match.group(0))
        if 1900 <= value <= 2100:
            continue
        new = next(str(value + step) for step in range(97, 10_000, 100) if not _in_records(str(value + step), cited))
        return text[:match.start()] + new + text[match.end():]
    return None


def _plant_year(text: str, cited: List[Entry]) -> Optional[str]:
    """The first year moved to a later one that no cited record mentions."""
    match = re.search(r"\b(19|20)\d{2}\b", text)
    if not match:
        return None
    new = next(str(int(match.group(0)) + k) for k in range(3, 60) if not _in_records(str(int(match.group(0)) + k), cited))
    return text[:match.start()] + new + text[match.end():]


PLANTS: List[Tuple[str, Callable[[str, List[Entry]], Optional[str]]]] = [
    ("changed number", _plant_number),
    ("later year", _plant_year),
    ("new person", lambda t, _: _before_full_stop(t, ", with Prof. Arvind Menon")),
    ("made-up title", lambda t, _: _before_full_stop(t, ', as reported in "Atlas of groundwater arsenic in Bihar"')),
    ("invented amount", lambda t, _: _before_full_stop(t, " at a cost of ₹3.7 lakh")),
]


@dataclass
class PlantResult:
    planted: int = 0
    caught: int = 0
    missed: List[str] = field(default_factory=list)


def plant(draft: ReportDraft, entries: Dict[str, Entry]) -> PlantResult:
    result = PlantResult()
    supported = [s for s in _sentences(draft) if s.origin == "AI" and s.supported and not s.placeholder]
    for sentence in supported[:PLANTS_PER_CASE]:
        cited = [entries[s] for s in sentence.sources if s in entries]
        variants = [(name, make(sentence.text, cited), sentence.sources) for name, make in PLANTS]
        if extract_facts(sentence.text).written():  # only a sentence with facts needs a citation
            variants.append(("citation removed", sentence.text, []))
        for name, text, sources in variants:
            if text is None or text == sentence.text and sources == sentence.sources:
                continue
            result.planted += 1
            if check_sentence(text, sources, entries):
                result.caught += 1
            else:
                result.missed.append(f"{name}: {text}  {sources}")
    return result


# ---------------------------------------------------------------------------
# The AI judge (--judge)
# ---------------------------------------------------------------------------

_JUDGE_PROMPT = """You are checking a draft progress report for an Indian research grant against the project's records, as a strict reviewer would.

RECORDS (everything recorded about the project; ids in brackets)
{entries}

DRAFT
{draft}

Score the draft from 0 to 10 on each of:
- "completeness": does it report every recorded output, and the work the records show on each objective? Text in [square brackets] is a place left for the PI where the records have nothing; that is expected, so don't count it against the draft.
- "accuracy": does every statement match the records, with nothing added, exaggerated, inferred or judged?
- "format": is it in the formal style and usual structure of an Indian agency progress report?
Then list every statement in the draft that the records don't support, even in part: added results, causes, methods, evaluations, people, places or plans. Don't list a statement only because it is worded differently from the records.

Return JSON exactly like this:
{{"completeness": 8, "accuracy": 9, "format": 8, "unsupported": [{{"sentence": "...", "why": "..."}}], "comment": "one or two sentences"}}
"""


async def judge(report: ReportInput, draft: ReportDraft, entries: Dict[str, Entry]) -> Dict:
    """The judge's scores and flags. A flag is kept only when its sentence is really in the draft:
    in our runs the judge sometimes quoted sentences the draft doesn't contain."""
    records = "\n".join(f"[{e.id}] {e.text}" for e in entries.values())
    answer = await generate_json(_JUDGE_PROMPT.format(entries=records, draft=plain_text(draft)), task="report_judge",
                                 temperature=0.0, max_output_tokens=4096, retries=1, thinking_budget=2048)
    answer = answer if isinstance(answer, dict) else {}
    scores = [answer.get(k) for k in ("completeness", "accuracy", "format")]
    answer["mean"] = round(sum(scores) / 3, 1) if all(isinstance(s, (int, float)) for s in scores) else None
    in_draft = normalise(" ".join(s.text for s in _sentences(draft)))
    flags = [f for f in answer.get("unsupported") or [] if isinstance(f, dict)]
    answer["unsupported"] = [f for f in flags if normalise(str(f.get("sentence") or "")) in in_draft]
    answer["not_in_draft"] = [f for f in flags if f not in answer["unsupported"]]
    return answer


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def _sentences(draft: ReportDraft) -> List[DraftSentence]:
    return [s for section in draft.sections for block in section.blocks for s in block.sentences]


def plain_text(draft: ReportDraft) -> str:
    lines = [draft.title]
    for section in draft.sections:
        lines += ["", section.heading.upper()]
        for block in section.blocks:
            if block.heading:
                lines += ["", block.heading]
            if block.style == "list":
                lines += [f"- {s.text}" for s in block.sentences]
            else:
                lines.append(" ".join(s.text for s in block.sentences))
    return "\n".join(lines)


def markdown(case: Dict, draft: ReportDraft, seconds: float, plants: PlantResult, verdict: Optional[Dict]) -> str:
    """The draft for a person to read: every sentence with its verdict and sources."""
    labels = {e.id: e.label for e in draft.entries}
    out = [f"# {case['id']} · {draft.title}", "", f"*Tests:* {case['tests']}", "",
           f"Period {case['report']['period_start']} to {case['report']['period_end']} · model "
           f"{draft.model or 'none (nothing recorded)'} · {seconds:.1f} s · **{draft.unsupported_count} unsupported** · "
           f"{draft.placeholder_count} to fill in · planted facts caught {plants.caught}/{plants.planted}", "",
           "Legend: ✅ supported, ❌ unsupported (with why), ⬜ for the PI to fill in. Sources in brackets.", ""]
    for warning in draft.warnings:
        out.append(f"> {warning}")
    for section in draft.sections:
        out += ["", f"## {section.heading}"]
        for block in section.blocks:
            if block.heading:
                out += ["", f"### {block.heading}"]
            for s in block.sentences:
                mark = "⬜" if s.placeholder else "✅" if s.supported else "❌"
                sources = ", ".join(f"{src}: {labels.get(src, '?')}" for src in s.sources)
                line = f"- {mark} {s.text}" + (f"  *[{sources}]*" if sources else "")
                if s.problems:
                    line += "  **" + " ".join(s.problems) + "**"
                out.append(line)
    if plants.missed:
        out += ["", "## Planted facts the check missed", *[f"- {m}" for m in plants.missed]]
    if verdict is not None:
        out += ["", "## AI judge", "",
                f"Completeness {verdict.get('completeness')}, accuracy {verdict.get('accuracy')}, format "
                f"{verdict.get('format')} (mean {verdict.get('mean')}). {verdict.get('comment', '')}"]
        for item in verdict.get("unsupported") or []:
            out.append(f"- Judge flags: “{item.get('sentence')}”: {item.get('why')}")
        if verdict.get("not_in_draft"):
            out.append(f"- Ignored {len(verdict['not_in_draft'])} judge flag(s) quoting sentences that aren't in the draft.")
    out += ["", "## Human check", "", "Read every ✅ sentence against the records above. Invented facts the check "
            "missed: ___ (target 0). Reviewer: ___ Date: ___", ""]
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def run(case_ids: List[str], with_judge: bool, out_dir: str) -> int:
    with open(os.path.join(REPORTS, "cases.json"), encoding="utf-8") as f:
        cases = [c for c in json.load(f)["cases"] if not case_ids or c["id"] in case_ids]
    os.makedirs(out_dir, exist_ok=True)

    rows, total_unsupported, total_planted, total_caught = [], 0, 0, 0
    judge_means: List[float] = []
    with track_usage() as usage:
        for case in cases:
            report = ReportInput(**case["report"])
            entries = build_entries(report)
            started = time.monotonic()
            draft = await write_draft(report)
            seconds = time.monotonic() - started
            plants = plant(draft, entries)
            verdict = await judge(report, draft, entries) if with_judge and draft.model else None

            ai_sentences = sum(1 for s in _sentences(draft) if s.origin == "AI")
            total_unsupported += draft.unsupported_count
            total_planted += plants.planted
            total_caught += plants.caught
            if verdict and verdict.get("mean") is not None:
                judge_means.append(verdict["mean"])
            judged = ""
            if verdict is not None:
                ignored = len(verdict["not_in_draft"])
                judged = (f" | judge {verdict.get('mean')} ({len(verdict['unsupported'])} flagged"
                          + (f", {ignored} quoting text not in the draft" if ignored else "") + ")")
            rows.append(f"{case['id']}: {ai_sentences:2d} AI sentences | unsupported {draft.unsupported_count} | "
                        f"to fill in {draft.placeholder_count} | planted caught {plants.caught}/{plants.planted} | "
                        f"{seconds:4.1f} s{judged}")
            print(rows[-1], flush=True)
            for s in _sentences(draft):
                if not s.supported and not s.placeholder:
                    print(f"    UNSUPPORTED: {s.text} {s.sources} {s.problems}")
            for missed in plants.missed:
                print(f"    PLANT MISSED: {missed}")
            for flag in (verdict or {}).get("unsupported", []):
                print(f"    JUDGE: {flag.get('sentence')} -- {flag.get('why')}")
            with open(os.path.join(out_dir, f"{case['id']}.md"), "w", encoding="utf-8") as f:
                f.write(markdown(case, draft, seconds, plants, verdict))

    summary = usage.summary()
    lines = ["", f"Cases: {len(cases)}",
             f"Unsupported sentences: {total_unsupported} (target 0)",
             f"Planted facts caught: {total_caught}/{total_planted} (target all)"]
    if with_judge:
        mean = round(sum(judge_means) / len(judge_means), 1) if judge_means else None
        lines.append(f"AI judge mean: {mean} over {len(judge_means)} drafts (target at least 7)")
    lines.append(f"AI calls: {summary['calls']} ({summary['failed_calls']} failed), models {summary['models']}, "
                 f"tokens in {summary['input_tokens']} / out {summary['output_tokens']}")
    lines.append(f"Drafts for the human check: {os.path.abspath(out_dir)}")
    print("\n".join(lines))
    with open(os.path.join(out_dir, "summary.md"), "w", encoding="utf-8") as f:
        f.write("# Progress-report evaluation\n\n" + "\n".join(f"- {r}" for r in rows) + "\n" + "\n".join(lines) + "\n")
    return 1 if total_unsupported or total_caught < total_planted else 0


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--case", action="append", default=[], help="run only these case ids (repeatable)")
    parser.add_argument("--judge", action="store_true", help="also score each draft with an AI judge")
    parser.add_argument("--out", default=os.path.join(REPORTS, "drafts"), help="folder for the Markdown drafts")
    args = parser.parse_args()
    sys.exit(asyncio.run(run(args.case, args.judge, args.out)))


if __name__ == "__main__":
    main()
