"""Regression suite for the Proposal Assistant (design doc section 9).

Runs the real pipeline, with real AI calls, on test-samples/proposal-assistant
and checks each sample against what it was written to test.

Run from ai-service/:  .venv\\Scripts\\python.exe -m eval.proposal_regression
Uses about 11 AI calls. Exit code 1 if any check fails.
"""
from __future__ import annotations

import asyncio
import os
import sys
import time

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from llm.gateway import track_usage  # noqa: E402
from proposal.pdf_extractor import extract_pages  # noqa: E402
from proposal.pipeline import run_review  # noqa: E402
from workspace.extractor import extract_checklist  # noqa: E402

SAMPLES = os.path.join(os.path.dirname(__file__), "..", "..", "test-samples", "proposal-assistant")
results = []


def check(name, ok, detail=""):
    results.append(ok)
    print(f"  {'PASS' if ok else 'FAIL'} {name}" + (f"  [{detail}]" if detail and not ok else ""))


def read(name):
    with open(os.path.join(SAMPLES, name), "rb") as f:
        return f.read()


def failed(review, predicate):
    return [r for r in review.rules if r.verdict == "fail" and predicate(r)]


def mentions(review, *words):
    text = " ".join(f"{i.issue} {i.suggestion}" for i in review.consistency_issues).lower()
    text += " " + " ".join(f"{r.text} {r.evidence}" for r in review.rules if r.verdict in ("fail", "partial")).lower()
    return any(w in text for w in words)


def show(review):
    s = review.scores
    print(f"  score overall={s.overall} quality={s.quality} capped={s.capped} rules {s.rules_met}/{s.rules_total} "
          f"critical_failed={s.critical_failed} status={review.status} usage={review.usage.get('calls')} calls, "
          f"{review.usage.get('input_tokens')} in / {review.usage.get('output_tokens')} out")
    for r in review.rules:
        if r.verdict != "pass":
            print(f"     {r.verdict.upper():13s} [{r.severity}] {r.id} {r.text[:70]} | {r.evidence[:90]}")
    for i in review.consistency_issues:
        print(f"     ISSUE [{i.severity}/{i.found_by}] {i.issue[:150]}")


async def main():
    started = time.time()
    with track_usage() as usage:
        print("G1 guidelines -> rules")
        extraction = await extract_checklist(extract_pages(read("G1-guidelines-core-grant.pdf")),
                                             title="Core Research Grant 2026-27", source_name="G1.pdf", force=True)
        g = extraction.proposal
        metrics = {(r.metric, r.kind) for r in g.rules}
        print(f"  {len(extraction.items)} checklist items, {len(g.required_sections)} required sections, "
              f"{len(g.criteria)} criteria, {len(g.rules)} rules")
        for r in g.rules:
            print(f"     {r.id} {r.kind:15s} {str(r.metric):16s} {r.operator} {r.value} {r.unit} sec={r.section} kw={r.keywords} [{r.severity}] {r.text[:50]}")
        check("Objective 3 checklist items still extracted", len(extraction.items) >= 8, len(extraction.items))
        check("10 required sections", len(g.required_sections) >= 9, g.required_sections)
        check("criteria with marks", len(g.criteria) >= 4 and all(c.marks for c in g.criteria), [(c.name, c.marks) for c in g.criteria])
        for metric in ["pages", "words", "budget_total", "overhead_percent"]:
            check(f"limit rule for {metric}", (metric, "limit") in metrics)
        check("forbidden-item rule", any(r.kind == "forbidden_item" for r in g.rules))
        check("needs-evidence rule (quotations)", any(r.kind == "needs_evidence" for r in g.rules))
        check("scope captured", bool(g.scope), g.scope)

        h = extraction.content_hash
        review = lambda pdf, **kw: run_review(guidance=g, extraction_hash=h, level="full", title="Core Research Grant", pdf_bytes=read(pdf), **kw)

        print("\nP1 strong")
        p1 = await review("P1-strong-complete.pdf")
        show(p1)
        check("P1 overall >= 75", (p1.scores.overall or 0) >= 75, p1.scores.overall)
        check("P1 no critical rule fails", p1.scores.critical_failed == 0)
        check("P1 complete (nothing hidden)", p1.status == "complete", p1.not_evaluated)

        print("\nP2 weak first draft")
        p2 = await review("P2-weak-first-draft.pdf")
        show(p2)
        for key in ["work_plan", "budget", "references"]:
            check(f"P2 missing {key} found", bool(failed(p2, lambda r, k=key: r.id == f"S-{k}")))
        check("P2 abstract word limit flagged", bool(failed(p2, lambda r: r.section == "abstract" and "words" in r.evidence)))
        check("P2 overall <= 40", p2.scores.overall is not None and p2.scores.overall <= 40, p2.scores.overall)

        print("\nP3 revised draft (previous = P2)")
        p3 = await review("P3-revised-draft.pdf", previous=p2)
        show(p3)
        check("P3 rises by at least 30", (p3.scores.overall or 0) - (p2.scores.overall or 0) >= 30,
              f"{p2.scores.overall} -> {p3.scores.overall}")
        check("P3 missing sections resolved", not failed(p3, lambda r: r.kind == "section_required"))

        print("\nP4 inconsistent budget")
        p4 = await review("P4-inconsistent-budget.pdf")
        show(p4)
        planted = {
            "1 budget over Rs. 60 lakh": bool(failed(p4, lambda r: r.kind == "limit" and "budget" in r.text.lower() and "total" in (r.text + r.evidence).lower())),
            "2 forbidden vehicle": bool(failed(p4, lambda r: r.kind == "forbidden_item")),
            "3 overhead 15%": bool(failed(p4, lambda r: "overhead" in r.text.lower())),
            "4 scanner without quotations": bool(failed(p4, lambda r: r.kind == "needs_evidence")) or mentions(p4, "quotation"),
            "5 24 months vs three monsoons": mentions(p4, "monsoon", "24 month", "24-month"),
            "6 objective 4 has no plan": mentions(p4, "objective 4", "mobile app", "kannada"),
            "7 Co-PI not in team": mentions(p4, "co-pi", "co-investigator"),
            "8 no year-wise break-up": mentions(p4, "year-wise", "year wise", "yearwise"),
        }
        for name, found in planted.items():
            print(f"     {'found ' if found else 'MISSED'} {name}")
        check("P4 at least 7 of 8 planted problems", sum(planted.values()) >= 7, f"{sum(planted.values())}/8")
        check("P4 overall <= 49", p4.scores.overall is not None and p4.scores.overall <= 49, p4.scores.overall)

        print("\nP5 wrong scheme")
        p5 = await review("P5-wrong-scheme-social-science.pdf")
        show(p5)
        check("P5 out of scope flagged", bool(failed(p5, lambda r: r.kind == "scope")))
        check("P5 overall <= 30", p5.scores.overall is not None and p5.scores.overall <= 30, p5.scores.overall)

        print("\nObjective 3 checklist samples (same extraction)")
        obj3 = os.path.join(SAMPLES, "..", "objective3")
        with open(os.path.join(obj3, "04-long-30-pages.pdf"), "rb") as f:
            e04 = await extract_checklist(extract_pages(f.read()), title="TDP", source_name="04.pdf", force=True)
        pages04 = {i.source_page for i in e04.items if i.source_verified}
        print(f"  04: {len(e04.items)} items, deadline {e04.call_deadline}, verified pages {sorted(p for p in pages04 if p)}")
        check("04 deadline 31 Jan 2027", e04.call_deadline == "2027-01-31", e04.call_deadline)
        check("04 items cite pages 9, 15, 19 and 29", {9, 15, 19, 29} <= pages04, sorted(p for p in pages04 if p))
        with open(os.path.join(obj3, "02-state-council-hard-copy.pdf"), "rb") as f:
            e02 = await extract_checklist(extract_pages(f.read()), title="RGS/F", source_name="02.pdf", force=True)
        print(f"  02: {len(e02.items)} items, deadline {e02.call_deadline}, dated items {[i.date for i in e02.items if i.date]}")
        check("02 deadline 20 Nov 2026", e02.call_deadline == "2026-11-20", e02.call_deadline)
        check("02 hard copy keeps its own date (27 Nov)", any(i.date == "2026-11-27" for i in e02.items))

        print("\nUnchanged P1 again (should reuse everything)")
        again = await review("P1-strong-complete.pdf", previous=p1)
        check("unchanged draft makes no AI calls", again.usage["calls"] == 0, again.usage)

    total = usage.summary()
    print(f"\nTotal: {total['calls']} AI calls, {total['input_tokens']} input / {total['output_tokens']} output tokens, "
          f"models {total['models']}, {time.time() - started:.0f}s")
    print(f"P1 full review cost: {p1.usage['calls']} calls, {p1.usage['input_tokens']} in / {p1.usage['output_tokens']} out "
          f"(old Deep mode measured 12,609 in / 6,960 out)")
    print(f"\n{sum(results)}/{len(results)} checks passed")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
