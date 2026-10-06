"""Tests for the Proposal Assistant v2 pipeline. No API calls: the model is faked
at the gateway level, so token accounting is exercised too.

Run from ai-service/:  python -m unittest discover -s tests -v
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import unittest
from unittest import mock

from llm import gateway
from proposal.document import read_document
from proposal.models import Budget, BudgetHead, BudgetItem, CriterionResult, Facts, RuleResult
from proposal.pipeline import UnreadableProposalError, run_review
from proposal.rules import check_code_rules
from proposal.scoring import compute_scores
from workspace.schemas import ProposalCriterion, ProposalGuidance, ProposalRule

SAMPLES = os.path.join(os.path.dirname(__file__), "..", "..", "test-samples", "proposal-assistant")


def sample(name: str) -> bytes:
    with open(os.path.join(SAMPLES, name), "rb") as f:
        return f.read()


def rule(id, text, kind, severity="critical", **kw) -> ProposalRule:
    return ProposalRule(id=id, text=text, kind=kind, severity=severity, **kw)


# What the guidelines extractor should produce for G1.
G1 = ProposalGuidance(
    scope="Research in Science, Engineering and Medicine; social science projects are not supported.",
    required_sections=["title", "abstract", "introduction", "objectives", "methodology",
                       "work_plan", "expected_outcomes", "budget", "team", "references"],
    criteria=[ProposalCriterion(name=n, marks=m) for n, m in [
        ("Novelty and scientific merit", 25), ("Methodology and feasibility", 30), ("National relevance", 15),
        ("Competence of the investigators", 15), ("Justification of the budget", 15)]],
    rules=[
        rule("R1", "Not exceed 15 pages", "limit", metric="pages", operator="max", value=15, unit="pages"),
        rule("R2", "12 point font", "limit", metric="font_size", operator="equals", value=12, unit="pt"),
        rule("R3", "Times New Roman font", "limit", metric="font_family", operator="equals", value="Times New Roman"),
        rule("R4", "Abstract of not more than 250 words", "limit", metric="words", operator="max", value=250,
             unit="words", section="abstract"),
        rule("R5", "Total budget max Rs. 60 lakh", "limit", metric="budget_total", operator="max", value=60, unit="lakh"),
        rule("R6", "Overhead 10% of total cost", "limit", metric="overhead_percent", operator="max", value=10, unit="percent"),
        rule("R7", "Overhead max Rs. 5 lakh", "limit", metric="overhead_amount", operator="max", value=5, unit="lakh"),
        rule("R8", "No vehicles or furniture", "forbidden_item", keywords=["vehicle", "furniture"]),
        rule("R9", "Equipment above Rs. 10 lakh needs three quotations", "needs_evidence", severity="important",
             metric="item_cost", operator="max", value=10, unit="lakh", keywords=["quotation"]),
        rule("R10", "Maximum duration three years", "limit", metric="duration_months", operator="max", value=36, unit="months"),
        rule("R11", "Objectives must be specific and measurable", "judgement", severity="important", section="objectives"),
        rule("R12", "Year-wise budget break-up with justification", "judgement", severity="important", section="budget"),
    ],
)

P1_FACTS = Facts(
    budget=Budget(total_lakh=48.6, overhead_percent=10, overhead_lakh=4.4, has_year_wise_breakup=True,
                  heads=[BudgetHead(name=n, amount_lakh=a) for n, a in
                         [("Equipment", 12.6), ("Manpower", 22.0), ("Consumables", 4.5), ("Travel", 3.6),
                          ("Contingency", 1.5), ("Overhead", 4.4)]],
                  items=[BudgetItem(name="48 sensor nodes", cost_lakh=7.2), BudgetItem(name="drone", cost_lakh=3.0)]),
    duration_months=36,
)
P4_FACTS = Facts(
    budget=Budget(total_lakh=82.0, overhead_percent=15, overhead_lakh=10.8, has_year_wise_breakup=False,
                  heads=[BudgetHead(name=n, amount_lakh=a) for n, a in
                         [("Equipment", 30.6), ("Manpower", 22.0), ("Consumables", 4.5), ("Travel", 12.6),
                          ("Contingency", 1.5), ("Overhead", 10.8)]],
                  items=[BudgetItem(name="terrestrial laser scanner", cost_lakh=18.0),
                         BudgetItem(name="four-wheel-drive vehicle", cost_lakh=9.0)]),
    duration_months=24,
)


def verdicts(results):
    return {r.id: r.verdict for r in results}


class DocumentTests(unittest.TestCase):
    def test_reads_sections_words_and_fonts_without_ai(self):
        doc, _ = read_document(sample("P1-strong-complete.pdf"))
        self.assertEqual(doc.canonical_sections(), sorted(G1.required_sections))
        self.assertEqual((doc.font.family, doc.font.size), ("Times-Roman", 12.0))
        self.assertEqual(doc.headings_found_by, "rules")

    def test_weak_draft_sections_and_abstract_length(self):
        doc, _ = read_document(sample("P2-weak-first-draft.pdf"))
        self.assertNotIn("budget", doc.canonical_sections())
        self.assertNotIn("work_plan", doc.canonical_sections())
        self.assertEqual(doc.sections_for("abstract")[0].words, 277)


class RuleTests(unittest.TestCase):
    def test_strong_proposal_passes_every_code_rule(self):
        doc, _ = read_document(sample("P1-strong-complete.pdf"))
        results = check_code_rules(G1, doc, P1_FACTS)
        self.assertEqual({r.verdict for r in results}, {"pass"}, [r for r in results if r.verdict != "pass"])

    def test_inconsistent_budget_breaks_the_right_rules(self):
        doc, _ = read_document(sample("P4-inconsistent-budget.pdf"))
        v = verdicts(check_code_rules(G1, doc, P4_FACTS))
        for failed in ["R5", "R6", "R7", "R8", "R9"]:
            self.assertEqual(v[failed], "fail", failed)
        self.assertEqual(v["R10"], "pass")      # 24 months is within 36; the contradiction is for the AI
        self.assertEqual(v["R1"], "pass")

    def test_weak_draft_fails_format_and_missing_sections(self):
        doc, _ = read_document(sample("P2-weak-first-draft.pdf"))
        v = verdicts(check_code_rules(G1, doc, Facts()))
        self.assertEqual(v["R4"], "fail")       # 277-word abstract, missed by the old pipeline
        self.assertEqual(v["R2"], "fail")       # 10 pt
        self.assertEqual(v["R3"], "fail")       # Helvetica
        for key in ["work_plan", "budget", "references"]:
            self.assertEqual(v[f"S-{key}"], "fail", key)
        self.assertEqual(v["R5"], "partial")    # no budget at all

    def test_budget_rules_not_evaluated_without_facts(self):
        doc, _ = read_document(sample("P1-strong-complete.pdf"))
        v = verdicts(check_code_rules(G1, doc, None))
        self.assertEqual(v["R5"], "not_evaluated")
        self.assertEqual(v["R1"], "pass")       # pages don't need facts

    def test_salaries_are_not_purchases(self):
        doc, _ = read_document(sample("P1-strong-complete.pdf"))
        facts = P1_FACTS.model_copy(deep=True)
        facts.budget.items.append(BudgetItem(name="one JRF for 3 years", cost_lakh=14.8, head="Manpower"))
        self.assertEqual(verdicts(check_code_rules(G1, doc, facts))["R9"], "pass")


class ScoringTests(unittest.TestCase):
    def crit(self, scores):
        marks = [25, 30, 15, 15, 15]
        return [CriterionResult(id=f"C{i}", name=f"c{i}", marks=m, score=s) for i, (m, s) in enumerate(zip(marks, scores), 1)]

    def rule_result(self, verdict, severity="critical", checked_by="code", kind="limit"):
        return RuleResult(id="X", text="x", severity=severity, kind=kind, checked_by=checked_by, verdict=verdict)

    def test_weighted_by_marks(self):
        s = compute_scores([self.rule_result("pass")], self.crit([5, 4, 4, 4, 3]), "full")
        self.assertEqual(s.quality, round(100 * (25 * 5 + 30 * 4 + 15 * 4 + 15 * 4 + 15 * 3) / 5 / 100))
        self.assertEqual(s.overall, s.quality)

    def test_critical_failure_caps_overall_at_49(self):
        s = compute_scores([self.rule_result("fail")], self.crit([5, 5, 4, 4, 4]), "full")
        self.assertEqual(s.overall, 49)
        self.assertTrue(s.capped)
        self.assertEqual(s.critical_failed, 1)

    def test_ai_judged_critical_failure_is_reported_but_does_not_cap(self):
        s = compute_scores([self.rule_result("fail", checked_by="ai", kind="judgement")], self.crit([5, 5, 4, 4, 4]), "full")
        self.assertEqual(s.critical_failed, 1)
        self.assertFalse(s.capped)
        self.assertGreater(s.overall, 49)

    def test_out_of_scope_caps_at_20(self):
        s = compute_scores([self.rule_result("fail", checked_by="ai", kind="scope")], self.crit([4] * 5), "full")
        self.assertEqual(s.overall, 20)

    def test_no_score_without_every_criterion(self):
        crit = self.crit([5, 5, 4, 4, 4])
        crit[2] = crit[2].model_copy(update={"score": None})
        s = compute_scores([self.rule_result("pass")], crit, "full")
        self.assertIsNone(s.overall)
        self.assertIsNone(compute_scores([self.rule_result("pass")], self.crit([5] * 5), "instant").overall)

    def test_not_evaluated_rules_are_left_out(self):
        s = compute_scores([self.rule_result("pass"), self.rule_result("not_evaluated")], [], "instant")
        self.assertEqual((s.rules_met, s.rules_total), (1, 1))


REVIEW_REPLY = {
    "rules": [{"id": "R11", "verdict": "pass", "evidence": "Three measurable objectives", "section": "objectives"},
              {"id": "R12", "verdict": "fail", "evidence": "No year-wise break-up", "section": "budget"},
              {"id": "SCOPE", "verdict": "pass", "evidence": "Engineering project"}],
    "criteria": [{"id": f"C{i}", "score": 4, "reason": "ok", "fix": "f"} for i in range(1, 6)],
    "consistency_issues": [{"issue": "24 months can't cover three monsoons", "sections_involved": ["work_plan", "methodology"],
                            "severity": "important", "suggestion": "Extend to 36 months"}],
    "sections": [{"key": "methodology", "summary": "Sensors on 12 slopes", "strength": "s", "improvement": "i"},
                 {"key": "budget", "summary": "Rs 82 lakh", "strength": "s", "improvement": "i"}],
    "summary": "Strong idea, budget breaks rules.",
    "top_fixes": ["Cut the budget to Rs. 60 lakh"],
}


class FakeModel:
    """Replaces the provider call inside the gateway; answers by prompt type."""

    def __init__(self, facts: Facts, fail_review: bool = False):
        self.facts, self.fail_review, self.prompts = facts, fail_review, []

    def __call__(self, prompt, *, model, temperature, max_output_tokens, thinking_budget):
        self.prompts.append(prompt)
        if "extract facts as numbers" in prompt:
            return json.dumps(self.facts.model_dump()), (300, 120, 0)
        if "funding committee" in prompt:
            if self.fail_review:
                raise RuntimeError("429 RESOURCE_EXHAUSTED")
            # Like a real review: a note for every section shown in full.
            shown = re.findall(r"^### \[([\w-]+)\].*\)$", prompt, re.M)
            reply = dict(REVIEW_REPLY, sections=[{"key": k, "summary": f"summary of {k}"} for k in shown])
            return json.dumps(reply), (2500, 700, 200)
        raise AssertionError("unexpected prompt: " + prompt[:80])


class PipelineTests(unittest.TestCase):
    def setUp(self):
        gateway._cooldown_until.clear()
        self.patches = [mock.patch.object(gateway, "_FALLBACK_MODELS", []), mock.patch.object(gateway, "_GROQ_API_KEY", None)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        gateway._cooldown_until.clear()

    def run_review(self, fake, **kw):
        with mock.patch.object(gateway, "_generate_gemini_sync", side_effect=fake):
            return asyncio.run(run_review(guidance=G1, extraction_hash="g1", title="CRG", **kw))

    def test_full_review_uses_two_calls_and_scores(self):
        fake = FakeModel(P4_FACTS)
        result = self.run_review(fake, level="full", pdf_bytes=sample("P4-inconsistent-budget.pdf"))
        self.assertEqual(result.status, "complete")
        self.assertEqual(result.usage["calls"], 2)
        self.assertEqual(set(result.usage["by_task"]), {"facts", "review"})
        self.assertEqual(result.scores.overall, 49)          # 80 quality, capped by critical failures
        self.assertTrue(result.scores.capped)
        self.assertEqual(verdicts(result.rules)["R12"], "fail")
        code_issues = " ".join(i.issue for i in result.consistency_issues if i.found_by == "code")
        self.assertIn("Objective 4 has no matching part", code_issues)
        self.assertIn("refers to a Co-PI", code_issues)
        self.assertEqual(sum(1 for i in result.consistency_issues if i.found_by == "ai"), 1)
        # The proposal is sent once, and the AI never re-judges what code decided.
        review_prompt = fake.prompts[-1]
        self.assertEqual(review_prompt.count("Rs. 82.0 lakh"), 1)
        self.assertIn("R5 FAIL", review_prompt)

    def test_instant_check_makes_one_small_call_and_no_score(self):
        result = self.run_review(FakeModel(P1_FACTS), level="instant", pdf_bytes=sample("P1-strong-complete.pdf"))
        self.assertEqual(result.usage["calls"], 1)
        self.assertIsNone(result.scores.overall)
        self.assertEqual(result.scores.critical_failed, 0)
        self.assertIn("rules met", result.summary)

    def test_failed_ai_review_is_reported_never_scored(self):
        result = self.run_review(FakeModel(P1_FACTS, fail_review=True), level="full", pdf_bytes=sample("P1-strong-complete.pdf"))
        self.assertEqual(result.status, "partial")
        self.assertIsNone(result.scores.overall)
        self.assertEqual(verdicts(result.rules)["R11"], "not_evaluated")
        self.assertTrue(result.not_evaluated)

    def test_unchanged_draft_reuses_everything(self):
        first = self.run_review(FakeModel(P1_FACTS), level="full", pdf_bytes=sample("P1-strong-complete.pdf"))
        fake = FakeModel(P1_FACTS)
        again = self.run_review(fake, level="full", pdf_bytes=sample("P1-strong-complete.pdf"), previous=first)
        self.assertEqual(fake.prompts, [])
        self.assertEqual(again.usage["calls"], 0)
        self.assertEqual(again.scores.overall, first.scores.overall)

    def test_revision_sends_only_changed_sections_in_full(self):
        first = self.run_review(FakeModel(P1_FACTS), level="full", pdf_bytes=sample("P1-strong-complete.pdf"))
        changed = first.document.model_copy(deep=True)
        meth = next(s for s in changed.sections if s.key == "methodology")
        meth.text += " We will also add a rain radar."
        meth.hash = "changed"
        fake = FakeModel(P1_FACTS)
        result = self.run_review(fake, level="full", document=changed, previous=first)
        self.assertTrue(result.reused["facts"])               # budget/work plan/team unchanged
        self.assertTrue(result.reused["incremental"])
        prompt = fake.prompts[-1]
        self.assertIn("rain radar", prompt)
        self.assertIn("UNCHANGED", prompt)
        abstract = first.document.sections_for("abstract")[0].text
        self.assertNotIn(abstract[:120], prompt)              # unchanged text isn't re-sent

    def test_scanned_proposal_is_rejected_before_any_ai_call(self):
        scanned = os.path.join(SAMPLES, "..", "objective3", "05-scanned-no-text.pdf")
        with open(scanned, "rb") as f:
            data = f.read()
        fake = FakeModel(P1_FACTS)
        with self.assertRaises(UnreadableProposalError):
            self.run_review(fake, level="full", pdf_bytes=data)
        self.assertEqual(fake.prompts, [])


if __name__ == "__main__":
    unittest.main()
