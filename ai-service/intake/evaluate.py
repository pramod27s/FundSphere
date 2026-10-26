"""Evaluation of "Add a grant" (2nd.md, Part B) on test-samples/intake.

Runs the real call reader, with real AI calls (one per call, five in all), on
the made-up calls and compares 11 form fields per call with the answer key in
test-samples/intake/make_samples.py. For each field:
  * correct: filled with the right value, or rightly left empty;
  * missed:  the call states it, but it was left empty for the admin to type;
  * silent:  filled with a value that differs from the call. The target is zero.

Run from ai-service/:  .venv\\Scripts\\python.exe -m intake.evaluate
Exit code 1 if any wrong value was filled.
"""
from __future__ import annotations

import asyncio
import importlib.util
import os
import sys
import time

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from intake.reader import read_call  # noqa: E402
from llm.gateway import track_usage  # noqa: E402
from proposal.pdf_extractor import extract_pages  # noqa: E402
from workspace.quote_check import normalise  # noqa: E402

SAMPLES = os.path.join(os.path.dirname(__file__), "..", "..", "test-samples", "intake")
FIELDS = ["title", "agency", "deadline", "opening_date", "deadline_type", "amount_min", "amount_max", "duration",
          "application_link", "requires_phd", "citizenship"]
# Count as correct when one contains the other ("Karnataka Science Vision Board" vs "... Board (sample)").
LOOSE_TEXT = {"title", "agency", "duration", "citizenship"}


def load_answer_key():
    spec = importlib.util.spec_from_file_location("intake_samples", os.path.join(SAMPLES, "make_samples.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.SAMPLES


def expected_fields(sample: dict) -> dict:
    fields = {name: sample[name] for name in FIELDS}
    for name in ("deadline", "opening_date"):
        if fields[name] is not None:
            fields[name] = fields[name].isoformat()
    return fields


def actual_fields(reading) -> dict:
    fields = {name: getattr(reading, name).value for name in FIELDS if name != "deadline_type"}
    fields["deadline_type"] = reading.deadline_type
    return fields


def same(name: str, expected, actual) -> bool:
    if isinstance(expected, str) and isinstance(actual, str):
        e, a = normalise(expected), normalise(actual)
        if name == "application_link":
            e, a = e.replace("https ", ""), a.replace("https ", "")
        return e == a or (name in LOOSE_TEXT and (e in a or a in e))
    return expected == actual


async def main() -> int:
    totals = {"correct": 0, "missed": 0, "silent": 0}
    report = []
    with track_usage() as usage:
        for sample in load_answer_key():
            path = os.path.join(SAMPLES, sample["file"])
            if path.endswith(".txt"):
                with open(path, encoding="utf-8") as f:
                    pages, has_pages, kind = [f.read()], False, "text"
            else:
                with open(path, "rb") as f:
                    pages, has_pages, kind = extract_pages(f.read()), True, "pdf"
            started = time.monotonic()
            reading = await read_call(pages, has_page_numbers=has_pages, source_kind=kind,
                                      source_name=sample["file"], force=True)
            seconds = time.monotonic() - started

            expected, actual = expected_fields(sample), actual_fields(reading)
            rows = []
            for name, want in expected.items():
                got = actual[name]
                if (got is None and want is None) or (got is not None and want is not None and same(name, want, got)):
                    totals["correct"] += 1
                    continue
                kind_of_error = "missed" if got is None else "silent"
                totals[kind_of_error] += 1
                rows.append(f"    {kind_of_error.upper():<8}{name:<18} expected {want!r}, got {got!r}")
            report.append((sample["file"], seconds, rows, reading.warnings))

    fields = sum(totals.values())
    for name, seconds, rows, warnings in report:
        print(f"\n{name}  ({seconds:.1f}s)  {'all fields right' if not rows else f'{len(rows)} field(s) off'}")
        for row in rows:
            print(row)
        for warning in warnings:
            print(f"    warning: {warning}")

    accuracy = 100 * totals["correct"] / fields
    print(f"\nFields: {fields} ({len(FIELDS)} per call)  correct: {totals['correct']} ({accuracy:.1f}%)  "
          f"missed: {totals['missed']}  wrong and silent: {totals['silent']}")
    summary = usage.summary()
    print(f"AI usage: {summary['calls']} calls ({summary['failed_calls']} failed), "
          f"{summary['input_tokens']} tokens in / {summary['output_tokens']} out, models {summary['models']}")
    return 1 if totals["silent"] else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(asyncio.run(main()))
