"""Evaluation of the sanction-order reader (4.5) on test-samples/objective4.

Runs the real reader, with real AI calls (one per order, five in all), on the
sample sanction orders and compares every form field with the answer key in
test-samples/objective4/make_samples.py. For each field:
  * correct: filled with the right value, or rightly left empty;
  * missed:  the order states it, but it was left empty for the PI to type;
  * wrong:   filled with a value that differs from the order. A wrong value is
             "flagged" when a warning points at it (the heads don't add up to
             the total) and "silent" otherwise. The target for silent is zero.

Run from ai-service/:  .venv\\Scripts\\python.exe -m award.evaluate
Exit code 1 if any wrong value was silent.
"""
from __future__ import annotations

import asyncio
import importlib.util
import os
import re
import sys
import time

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from award.sanction_reader import read_sanction_order  # noqa: E402
from llm.gateway import track_usage  # noqa: E402
from proposal.pdf_extractor import extract_pages  # noqa: E402
from workspace.quote_check import normalise  # noqa: E402

SAMPLES = os.path.join(os.path.dirname(__file__), "..", "..", "test-samples", "objective4")
HEADS = ["EQUIPMENT", "MANPOWER", "CONSUMABLES", "TRAVEL", "CONTINGENCY", "OVERHEAD", "OTHERS"]
POLICY_BY_LABEL = {"Carried": "CARRY_FORWARD", "Lapses": "LAPSES", "Deducted": "DEDUCTED_NEXT_RELEASE", "Not sure": None}
# Agency and scheme count as correct when one contains the other ("Core Research Grant" vs "... scheme").
LOOSE_TEXT = {"agency", "scheme"}


def load_answer_key():
    spec = importlib.util.spec_from_file_location("objective4_samples", os.path.join(SAMPLES, "make_samples.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return [module.S1, module.S2, module.S3, module.S4, module.S5]


def expected_fields(sample: dict) -> dict:
    url = re.search(r"https?://\S+", sample["portal"])
    policy = next(value for prefix, value in POLICY_BY_LABEL.items() if sample["unspent"].startswith(prefix))
    fields = {
        "project_title": sample["title"],
        "agency": sample["agency"],
        "scheme": sample["scheme"],
        "sanction_no": sample["sanction_no"],
        "sanction_date": sample["sanction_date"].isoformat(),
        "start_date": sample["start"].isoformat(),
        "end_date": sample["end"].isoformat(),
        "total_sanctioned": sample["total"],
        "unspent_policy": policy,
        "portal_url": url.group() if url else None,
    }
    for head in HEADS:
        fields[f"head:{head}"] = sample["heads"].get(head.capitalize())
    return fields


def actual_fields(reading) -> dict:
    fields = {name: getattr(reading, name).value for name in (
        "project_title", "agency", "scheme", "sanction_no", "sanction_date", "start_date", "end_date",
        "total_sanctioned", "unspent_policy", "portal_url")}
    amounts = {line.head: line.amount for line in reading.budget_lines}
    for head in HEADS:
        fields[f"head:{head}"] = amounts.get(head)
    return fields


def same(name: str, expected, actual) -> bool:
    if isinstance(expected, str) and isinstance(actual, str):
        e, a = normalise(expected), normalise(actual)
        if name == "portal_url":
            e, a = e.replace("https ", ""), a.replace("https ", "")
        return e == a or (name in LOOSE_TEXT and (e in a or a in e))
    return expected == actual


async def main() -> int:
    totals = {"correct": 0, "missed": 0, "flagged": 0, "silent": 0}
    report = []
    with track_usage() as usage:
        for sample in load_answer_key():
            with open(os.path.join(SAMPLES, sample["file"]), "rb") as f:
                pages = extract_pages(f.read())
            started = time.monotonic()
            reading = await read_sanction_order(pages, source_name=sample["file"], force=True)
            seconds = time.monotonic() - started
            sum_flagged = any("heads add up to" in w for w in reading.warnings)

            expected, actual = expected_fields(sample), actual_fields(reading)
            rows = []
            for name, want in expected.items():
                got = actual[name]
                if got is None and want is None or (got is not None and same(name, want, got)):
                    totals["correct"] += 1
                    continue
                if got is None:
                    kind = "missed"
                elif sum_flagged and (name == "total_sanctioned" or name.startswith("head:")):
                    kind = "flagged"
                else:
                    kind = "silent"
                totals[kind] += 1
                rows.append(f"    {kind.upper():<8}{name:<20} expected {want!r}, got {got!r}")
            report.append((sample["file"], seconds, rows, reading.warnings))

    fields = sum(totals.values())
    for name, seconds, rows, warnings in report:
        print(f"\n{name}  ({seconds:.1f}s)  {'all fields right' if not rows else f'{len(rows)} field(s) off'}")
        for row in rows:
            print(row)
        for warning in warnings:
            print(f"    warning: {warning}")

    accuracy = 100 * totals["correct"] / fields
    print(f"\nFields: {fields} (17 per order)  correct: {totals['correct']} ({accuracy:.1f}%)  "
          f"missed: {totals['missed']}  wrong but flagged: {totals['flagged']}  wrong and silent: {totals['silent']}")
    summary = usage.summary()
    print(f"AI usage: {summary['calls']} calls ({summary['failed_calls']} failed), "
          f"{summary['input_tokens']} tokens in / {summary['output_tokens']} out, models {summary['models']}")
    return 1 if totals["silent"] else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(asyncio.run(main()))
