"""Tests for progress-report drafts (Objective 4, item 4.4): the entries, the
unsupported-claim check, and how a draft is put together.

Run from ai-service/:  python -m unittest discover -s tests -v
No API keys needed: the LLM call is replaced with a canned answer.
"""
from __future__ import annotations

import asyncio
import unittest
from decimal import Decimal
from unittest import mock

from award import report_writer
from award.claim_check import check_sentence, extract_facts, is_placeholder
from award.report_entries import build_entries, format_date, format_inr, indian_grouping
from award.report_writer import recheck, write_draft
from award.schemas import CheckDraftRequest, ReportInput

REPORT = dict(
    title="Annual progress report, year 1",
    period_start="2026-08-15",
    period_end="2027-08-14",
    grant=dict(project_title="Low-cost sensors for groundwater arsenic", agency="ANRF", scheme="Core Research Grant",
               sanction_no="ANRF/CRG/2026/000123", sanction_date="2026-07-30", start_date="2026-08-15",
               end_date="2029-08-14", total_sanctioned=3927000),
    objectives=["To develop a paper-strip sensor for arsenic in groundwater",
                "To validate the sensor in 20 villages of Ballia district"],
    outputs=[
        dict(id=12, type="PAPER", title="Paper-strip sensing of arsenic in groundwater", details="Analyst",
             date="2027-06", reference="10.1039/D7AN00123A"),
        dict(id=3, type="STUDENT", title="Ravi Kumar", details="JRF, joined Sep 2026", date="2026-09-01"),
        dict(id=4, type="STUDENT", title="Anjali Verma", details="M.Tech thesis submitted", date="2027-05"),
        dict(id=5, type="EQUIPMENT", title="Portable XRF analyser", details="Installed and working in the Water Lab",
             date="2027-01-20", amount=847000),
        dict(id=7, type="MILESTONE", title="Prototype tested in 5 villages",
             details="Arsenic above 10 ppb in 23 of 60 wells", date="2027-04"),
    ],
    budget=[dict(head="EQUIPMENT", allocated=1200000), dict(head="MANPOWER", allocated=1440000)],
    notes="Field trials in Ballia were delayed by 2 months by the monsoon.",
)


def report(**changes) -> ReportInput:
    return ReportInput(**{**REPORT, **changes})


ENTRIES = build_entries(report())


def problems(text, *sources):
    return check_sentence(text, list(sources), ENTRIES)


class FormattingTest(unittest.TestCase):
    def test_amounts_dates_and_grouping(self):
        self.assertEqual(format_inr(50_000), "₹50,000")
        self.assertEqual(format_inr(850_000), "₹8.5 lakh")
        self.assertEqual(format_inr(3_927_000), "₹39.27 lakh")
        self.assertEqual(format_inr(25_000_000), "₹2.5 crore")
        self.assertEqual(indian_grouping(3_927_000), "39,27,000")
        self.assertEqual(indian_grouping(999), "999")
        self.assertEqual(format_date("2027"), "2027")
        self.assertEqual(format_date("2027-03"), "March 2027")
        self.assertEqual(format_date("2027-03-04"), "4 March 2027")


class EntriesTest(unittest.TestCase):
    def test_every_record_becomes_an_entry_with_a_stable_id(self):
        self.assertEqual(
            list(ENTRIES),
            ["grant", "period", "obj_1", "obj_2", "out_12", "out_3", "out_4", "out_5", "out_7",
             "budget_EQUIPMENT", "budget_MANPOWER", "budget_total", "note"])
        self.assertIn("Objective 2: To validate", ENTRIES["obj_2"].text)
        self.assertIn("45% of the budget heads' total", ENTRIES["budget_EQUIPMENT"].text)
        self.assertEqual(ENTRIES["out_5"].amounts, [847000])

    def test_no_note_and_no_budget_means_no_such_entries(self):
        entries = build_entries(report(notes="  ", budget=[]))
        self.assertNotIn("note", entries)
        self.assertNotIn("budget_total", entries)


class ExtractionTest(unittest.TestCase):
    def test_amounts_in_rupees_lakh_and_crore(self):
        facts = extract_facts("It cost ₹8.5 lakh, Rs. 12,00,000 and 1.2 crore; also INR 500.")
        self.assertEqual([a for a, _, _ in facts.amounts], [850000, 1200000, 500, 12000000])
        self.assertEqual(facts.numbers, [])

    def test_dates_at_the_precision_written(self):
        facts = extract_facts("From 15 August 2026, March 14, 2027, 01/02/2027, 2027-03-04, June 2027 and FY 2026-27.")
        self.assertEqual(sorted(d for d, _ in facts.dates),
                         ["2026", "2026-08-15", "2027", "2027-02-01", "2027-03-04", "2027-03-14", "2027-06"])
        self.assertEqual(facts.numbers, [])

    def test_ranges_that_share_a_year(self):
        facts = extract_facts("Flights stopped from June to August 2027 and from 1 to 15 March 2028.")
        self.assertEqual([d for d, _ in facts.dates], ["2027-06", "2027-08", "2028-03-01", "2028-03-15"])
        self.assertEqual(facts.numbers, [])
        # What the evaluation found: the note gives "June to August 2027", the AI writes "June 2027".
        entries = build_entries(report(notes="Drone flights were stopped from June to August 2027 because of the monsoon."))
        self.assertEqual(check_sentence("Drone flights were suspended from June 2027 to August 2027.", ["note"], entries), [])
        self.assertTrue(check_sentence("Drone flights were suspended from May 2027.", ["note"], entries))

    def test_numbers_percentages_words_quotes_and_names(self):
        facts = extract_facts('Dr. Meena Sharma tested "A new sensor" in twelve villages, 23% of 60 wells, in 2027.')
        self.assertEqual(facts.quotes, ["A new sensor"])
        self.assertEqual([n for n, _ in facts.numbers], [Decimal(23), Decimal(60), Decimal(12)])
        self.assertEqual([d for d, _ in facts.dates], ["2027"])
        self.assertEqual(facts.names, ["Meena", "Sharma"])

    def test_generic_report_words_are_not_names(self):
        facts = extract_facts("The JRF and the Principal Investigator met the Equipment head target under Objective 1.")
        self.assertEqual(facts.names, [])
        facts = extract_facts("A Junior Research Fellow joined the Department; the Indian Institute of Technology Kanpur helped.")
        self.assertEqual(facts.names, ["Technology", "Kanpur"])

    def test_placeholders(self):
        self.assertTrue(is_placeholder(" [Add the amount spent.] "))
        self.assertFalse(is_placeholder("The amount [add it] was spent."))


class SupportedSentencesTest(unittest.TestCase):
    def test_restating_an_entry(self):
        self.assertEqual(problems("Ravi Kumar joined the project as a JRF in September 2026.", "out_3"), [])
        self.assertEqual(problems('The paper "Paper-strip sensing of arsenic in groundwater" appeared in Analyst '
                                  "in June 2027.", "out_12"), [])
        self.assertEqual(problems("The prototype was tested in 5 villages, and arsenic above 10 ppb was found in "
                                  "23 of 60 wells.", "out_7"), [])
        self.assertEqual(problems("Field trials in Ballia were delayed by 2 months owing to the monsoon.", "note"), [])
        self.assertEqual(problems("This report covers 15 August 2026 to 14 August 2027.", "period"), [])

    def test_amounts_match_to_the_precision_written(self):
        self.assertEqual(problems("A portable XRF analyser costing ₹8.5 lakh was installed in January 2027.", "out_5"), [])
        self.assertEqual(problems("The analyser cost Rs. 8,47,000.", "out_5"), [])

    def test_counting_cited_entries(self):
        self.assertEqual(problems("2 students were trained.", "out_3", "out_4"), [])
        self.assertEqual(problems("The project produced 1 paper and trained 2 students.", "out_12", "out_3", "out_4"), [])

    def test_objective_numbers_and_years_from_cited_entries(self):
        self.assertEqual(problems("Under Objective 2, the prototype was tested in 5 villages.", "obj_2", "out_7"), [])
        self.assertEqual(problems("The work was done under sanction order ANRF/CRG/2026/000123.", "grant"), [])

    def test_a_sentence_without_facts_needs_no_source(self):
        self.assertEqual(problems("The work on the sensor continued during the period."), [])


class UnsupportedSentencesTest(unittest.TestCase):
    """Invented facts the check must catch."""

    def assertUnsupported(self, text, *sources, mentioning=None):
        found = problems(text, *sources)
        self.assertTrue(found, f"expected a problem with: {text}")
        if mentioning:
            self.assertTrue(any(mentioning in p for p in found), found)

    def test_invented_numbers(self):
        self.assertUnsupported("The prototype was tested in 12 villages.", "out_7", mentioning="12")
        self.assertUnsupported("3 papers were published.", "out_12", mentioning="3")
        self.assertUnsupported("Equipment took 50% of the budget.", "budget_EQUIPMENT", mentioning="50%")

    def test_invented_or_too_precise_dates(self):
        self.assertUnsupported("Ravi Kumar joined on 3 September 2026.", "out_3", mentioning="3 September 2026")
        self.assertUnsupported("The paper was published on 14 June 2027.", "out_12", mentioning="14 June 2027")
        self.assertUnsupported("The prototype was tested in 2028.", "out_7", mentioning="2028")

    def test_wrong_amounts(self):
        self.assertUnsupported("The analyser cost ₹9 lakh.", "out_5", mentioning="₹9 lakh")
        self.assertUnsupported("The analyser cost Rs. 8,50,000.", "out_5", mentioning="8,50,000")

    def test_invented_people_and_titles(self):
        self.assertUnsupported("Dr. Meena Sharma supervised the field trials.", "note", mentioning="Meena")
        self.assertUnsupported('A second paper, "Arsenic maps of Ballia", was submitted.', "out_12",
                               mentioning="Arsenic maps of Ballia")
        self.assertUnsupported("The sensor was validated with IIT Kanpur.", "out_7", mentioning="IIT")

    def test_citing_the_wrong_entry_or_none(self):
        self.assertUnsupported("Ravi Kumar joined in September 2026.", "out_12", mentioning="Kumar")
        self.assertUnsupported("IIT Kanpur hosted the field trials.", "note", mentioning="IIT")
        self.assertUnsupported("The prototype was tested in 5 villages.", "out_99", mentioning="out_99")
        self.assertUnsupported("2 papers were published in 2027.", mentioning="without citing")


CANNED_ANSWER = {
    "summary": [
        {"text": "During the period, 1 paper was published and 2 students were trained.",
         "sources": ["period", "out_12", "out_3", "out_4"]},
        {"text": "The prototype was tested in 12 villages [out_7].", "sources": []},
    ],
    "work_done": [
        {"objective": "obj_1", "sentences": [
            {"text": 'The sensor was described in "Paper-strip sensing of arsenic in groundwater", published in '
                     "Analyst in June 2027.", "sources": "out_12"}]},
        {"objective": "obj_9", "sentences": [
            {"text": "A portable XRF analyser was installed in January 2027.", "sources": ["out_5"]}]},
    ],
    "deviations": [
        {"text": "Field trials in Ballia were delayed by 2 months owing to the monsoon.", "sources": ["note"]}],
}


def run(coro):
    return asyncio.run(coro)


class WriteDraftTest(unittest.TestCase):
    def draft(self, answer=CANNED_ANSWER, **changes):
        with mock.patch.object(report_writer, "generate_json", mock.AsyncMock(return_value=answer)) as llm:
            result = run(write_draft(report(**changes)))
        return result, llm

    @staticmethod
    def section(draft, key):
        return next(s for s in draft.sections if s.key == key)

    def test_sections_follow_the_usual_headings(self):
        draft, _ = self.draft()
        self.assertEqual([s.key for s in draft.sections],
                         ["details", "objectives", "summary", "work_done", "deviations", "outputs", "utilization"])
        self.assertEqual(draft.title, "Annual progress report, year 1")

    def test_code_written_parts_restate_the_records_and_pass(self):
        draft, _ = self.draft()
        for key in ("details", "objectives", "outputs", "utilization"):
            for block in self.section(draft, key).blocks:
                for sentence in block.sentences:
                    self.assertTrue(sentence.supported, (sentence.text, sentence.problems))
                    self.assertEqual(sentence.origin, "CODE")
        outputs = self.section(draft, "outputs")
        self.assertEqual([b.heading for b in outputs.blocks],
                         ["Papers", "Students trained", "Equipment bought", "Milestones reached"])
        self.assertEqual(outputs.blocks[0].sentences[0].text,
                         '"Paper-strip sensing of arsenic in groundwater", Analyst, June 2027. DOI: 10.1039/D7AN00123A')

    def test_the_invented_claim_is_flagged_and_inline_ids_become_sources(self):
        draft, _ = self.draft()
        summary = self.section(draft, "summary").blocks[0].sentences
        self.assertTrue(summary[0].supported)
        self.assertEqual(summary[1].text, "The prototype was tested in 12 villages.")
        self.assertEqual(summary[1].sources, ["out_7"])
        self.assertFalse(summary[1].supported)
        self.assertEqual(draft.unsupported_count, 1)

    def test_work_is_grouped_by_objective_with_placeholders_for_the_rest(self):
        draft, _ = self.draft()
        blocks = self.section(draft, "work_done").blocks
        self.assertEqual([b.heading for b in blocks], [
            "Objective 1: To develop a paper-strip sensor for arsenic in groundwater",
            "Objective 2: To validate the sensor in 20 villages of Ballia district",
            "Other work"])
        self.assertEqual(blocks[0].sentences[0].sources, ["out_12"])
        self.assertTrue(blocks[1].sentences[0].placeholder)
        self.assertEqual(blocks[2].sentences[0].sources, ["out_5"])

    def test_objectives_named_loosely_still_find_their_block(self):
        answer = {"work_done": [
            {"objective": "Objective 1", "sentences": [{"text": "A paper appeared in Analyst.", "sources": ["out_12"]}]},
            {"objective": "[obj_2]", "sentences": [{"text": "The prototype was tested in 5 villages.", "sources": ["out_7"]}]},
            {"objective": None, "sentences": [{"text": "Ravi Kumar joined as a JRF.", "sources": ["obj_1", "out_3"]}]},
            {"objective": 7, "sentences": [{"text": "A portable XRF analyser was installed.", "sources": ["out_5"]}]},
            {"objective": "Objective 2: To validate the sensor in 20 villages of Ballia district",
             "sentences": [{"text": "Arsenic above 10 ppb was found in 23 of 60 wells.", "sources": ["out_7"]}]},
            {"objective": "To develop a paper-strip sensor for arsenic in groundwater",
             "sentences": [{"text": "Anjali Verma submitted an M.Tech thesis.", "sources": ["out_4"]}]},
        ]}
        draft, _ = self.draft(answer=answer)
        blocks = self.section(draft, "work_done").blocks
        self.assertEqual([s.text for s in blocks[0].sentences],
                         ["A paper appeared in Analyst.", "Ravi Kumar joined as a JRF.",
                          "Anjali Verma submitted an M.Tech thesis."])
        self.assertEqual([s.text for s in blocks[1].sentences],
                         ["The prototype was tested in 5 villages.", "Arsenic above 10 ppb was found in 23 of 60 wells."])
        self.assertEqual(blocks[2].heading, "Other work")
        self.assertEqual([s.text for s in blocks[2].sentences], ["A portable XRF analyser was installed."])

    def test_several_sentences_in_one_item_are_split_and_keep_their_sources(self):
        answer = {"summary": [{"text": "Dr. Rao's team published 1 paper. An M.Sc. student, K. M. Bopanna, was trained. "
                                       "The project produced 9 outputs.", "sources": ["out_12"]}]}
        draft, _ = self.draft(answer=answer)
        summary = self.section(draft, "summary").blocks[0].sentences
        self.assertEqual([s.text for s in summary], [
            "Dr. Rao's team published 1 paper.", "An M.Sc. student, K. M. Bopanna, was trained.",
            "The project produced 9 outputs."])
        self.assertTrue(all(s.sources == ["out_12"] for s in summary))
        self.assertEqual([s.supported for s in summary], [False, False, False])  # Rao, Bopanna, 9: none recorded

    def test_sentence_ids_are_unique_and_placeholders_counted(self):
        draft, _ = self.draft()
        ids = [s.id for section in draft.sections for block in section.blocks for s in block.sentences]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(draft.placeholder_count, 2)  # objective 2's work, and the spending figures

    def test_without_a_note_deviations_are_left_to_the_pi(self):
        draft, _ = self.draft(notes=None)
        sentence = self.section(draft, "deviations").blocks[0].sentences[0]
        self.assertTrue(sentence.placeholder)

    def test_nothing_recorded_means_no_ai_call(self):
        draft, llm = self.draft(outputs=[], notes=None)
        llm.assert_not_called()
        self.assertTrue(draft.warnings)
        self.assertEqual(draft.unsupported_count, 0)
        self.assertTrue(self.section(draft, "summary").blocks[0].sentences[0].placeholder)

    def test_a_malformed_answer_leaves_placeholders(self):
        draft, _ = self.draft(answer=["not", "a", "dict"])
        self.assertEqual(draft.unsupported_count, 0)
        self.assertTrue(self.section(draft, "summary").blocks[0].sentences[0].placeholder)


class RecheckTest(unittest.TestCase):
    def setUp(self):
        with mock.patch.object(report_writer, "generate_json", mock.AsyncMock(return_value=CANNED_ANSWER)):
            self.draft = run(write_draft(report()))

    def sentence(self, sections, text_start):
        return next(s for sec in sections for b in sec.blocks for s in b.sentences if s.text.startswith(text_start))

    def test_an_edit_that_removes_the_invented_number_passes(self):
        sections = [s.model_copy(deep=True) for s in self.draft.sections]
        bad = self.sentence(sections, "The prototype was tested in 12")
        bad.text, bad.edited = "The prototype was tested in 5 villages.", True

        checked = recheck(CheckDraftRequest(report=report(), sections=sections))

        self.assertEqual(checked.unsupported_count, 0)
        self.assertTrue(self.sentence(checked.sections, "The prototype was tested in 5").supported)

    def test_a_confirmed_sentence_is_counted_apart(self):
        sections = [s.model_copy(deep=True) for s in self.draft.sections]
        self.sentence(sections, "The prototype was tested in 12").confirmed = True

        checked = recheck(CheckDraftRequest(report=report(), sections=sections))

        self.assertEqual((checked.unsupported_count, checked.confirmed_count), (0, 1))

    def test_filling_a_placeholder_turns_it_into_a_checked_sentence(self):
        sections = [s.model_copy(deep=True) for s in self.draft.sections]
        placeholder = self.sentence(sections, "[No outputs are recorded against this objective")
        placeholder.text = "Water samples from 40 wells were analysed."

        checked = recheck(CheckDraftRequest(report=report(), sections=sections))

        filled = self.sentence(checked.sections, "Water samples")
        self.assertFalse(filled.placeholder)
        self.assertFalse(filled.supported)  # 40 is in no record, and it cites none

    def test_a_deleted_output_leaves_its_sentences_unsupported(self):
        remaining = [o for o in REPORT["outputs"] if o["id"] != 5]
        checked = recheck(CheckDraftRequest(report=report(outputs=remaining), sections=self.draft.sections))
        equipment = self.sentence(checked.sections, "Portable XRF analyser")
        self.assertFalse(equipment.supported)
        self.assertTrue(any("out_5" in p for p in equipment.problems))

    def test_ids_survive_and_blank_sentences_are_dropped(self):
        sections = [s.model_copy(deep=True) for s in self.draft.sections]
        before = [s.id for sec in sections for b in sec.blocks for s in b.sentences]
        sections[0].blocks[0].sentences[0].text = "   "

        checked = recheck(CheckDraftRequest(report=report(), sections=sections))

        after = [s.id for sec in checked.sections for b in sec.blocks for s in b.sentences]
        self.assertEqual(after, before[1:])


if __name__ == "__main__":
    unittest.main()
