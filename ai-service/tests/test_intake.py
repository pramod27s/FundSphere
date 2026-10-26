"""Reading a funding call into the admin's "Add a grant" form (2nd.md, Part B).

The LLM output is canned: these tests check the code that confirms each
value against the call, reads dates and amounts, and sets the deadline type.
"""
from __future__ import annotations

import asyncio
import copy
import unittest
from unittest import mock

from intake import reader
from intake.reader import clean_reading
from proposal import analysis_cache

PAGES = [
    "VISION GROUP ON SCIENCE AND TECHNOLOGY, Government of Karnataka\n"
    "Call for Proposals: Seed Grant for Young Faculty 2026-27\n"
    "The Seed Grant supports young faculty to start an independent research programme in science and engineering.\n"
    "Eligibility: Regular faculty members below 40 years of age with a Ph.D. degree, working in a recognised "
    "institution in Karnataka, may apply.\n"
    "Applicants must be Indian citizens.",
    "Financial support: up to Rs. 20 lakh per project for a period of 2 years.\n"
    "Last date for submission of proposals: 30 November 2026.\n"
    "Applications must be submitted online at https://vgst.karnataka.gov.in/apply\n"
    "Thrust areas: materials science, biotechnology, artificial intelligence and clean energy.",
]

CANNED = {
    "title": {"value": "Seed Grant for Young Faculty 2026-27",
              "source_quote": "Call for Proposals: Seed Grant for Young Faculty 2026-27", "source_page": 1},
    "agency": {"value": "VISION GROUP ON SCIENCE AND TECHNOLOGY",
               "source_quote": "VISION GROUP ON SCIENCE AND TECHNOLOGY, Government of Karnataka", "source_page": 1},
    "programme": None,
    "purpose": {"value": "The Seed Grant supports young faculty to start an independent research programme in "
                         "science and engineering.", "source_page": 1},
    "deadline": {"as_written": "30 November 2026",
                 "source_quote": "Last date for submission of proposals: 30 November 2026.", "source_page": 2},
    "opening_date": None,
    "open_all_year": None,
    "periodic_calls": None,
    "amount_min": None,
    "amount_max": {"as_written": "20", "unit": "lakh",
                   "source_quote": "Financial support: up to Rs. 20 lakh per project for a period of 2 years.",
                   "source_page": 2},
    "duration": {"value": "2 years",
                 "source_quote": "Financial support: up to Rs. 20 lakh per project for a period of 2 years.",
                 "source_page": 2},
    "eligibility": {"value": "Regular faculty members below 40 years of age with a Ph.D. degree, working in a "
                             "recognised institution in Karnataka, may apply.", "source_page": 1},
    "themes": {"value": "materials science, biotechnology, artificial intelligence and clean energy",
               "source_quote": "Thrust areas: materials science, biotechnology, artificial intelligence and clean energy.",
               "source_page": 2},
    "application_link": {"value": "https://vgst.karnataka.gov.in/apply",
                         "source_quote": "Applications must be submitted online at https://vgst.karnataka.gov.in/apply",
                         "source_page": 2},
    "requires_phd": {"value": True, "source_quote": "Regular faculty members below 40 years of age with a Ph.D. degree, "
                                                    "working in a recognised institution in Karnataka, may apply.",
                     "source_page": 1},
    "citizenship": {"value": "Indian", "source_quote": "Applicants must be Indian citizens.", "source_page": 1},
    "grant_type": {"value": "seed grant", "source_quote": "Call for Proposals: Seed Grant for Young Faculty 2026-27",
                   "source_page": 1},
}


def read(raw, pages=PAGES, has_page_numbers=True):
    return clean_reading(copy.deepcopy(raw), pages, has_page_numbers)


class CleanReadingTests(unittest.TestCase):
    def test_confirmed_values_are_filled_and_converted(self):
        reading = read(CANNED)

        self.assertEqual(reading.title.value, "Seed Grant for Young Faculty 2026-27")
        self.assertEqual(reading.deadline.value, "2026-11-30")
        self.assertEqual(reading.deadline.source_page, 2)
        self.assertEqual(reading.amount_max.value, 20_00_000)
        self.assertEqual(reading.duration.value, "2 years")
        self.assertEqual(reading.application_link.value, "https://vgst.karnataka.gov.in/apply")
        self.assertEqual(reading.requires_phd.value, "YES")
        self.assertEqual(reading.citizenship.value, "Indian")
        self.assertEqual(reading.grant_type.value, "Seed Grant")
        self.assertTrue(reading.purpose.verified)
        self.assertTrue(reading.eligibility.verified)
        self.assertEqual(reading.deadline_type, "FIXED")
        self.assertEqual(reading.warnings, [])

    def test_a_value_whose_sentence_is_not_in_the_call_is_left_empty(self):
        raw = copy.deepcopy(CANNED)
        raw["deadline"] = {"as_written": "15 December 2026",
                           "source_quote": "Last date for submission of proposals: 15 December 2026.", "source_page": 2}

        reading = read(raw)

        self.assertIsNone(reading.deadline.value)
        self.assertFalse(reading.deadline.verified)
        self.assertEqual(reading.deadline.as_written, "15 December 2026")
        self.assertIn("wasn't found", reading.deadline.note)
        self.assertTrue(any(w.startswith("Deadline was left empty") for w in reading.warnings))

    def test_a_value_missing_from_its_own_quote_is_left_empty(self):
        raw = copy.deepcopy(CANNED)
        raw["amount_max"]["as_written"] = "25"

        reading = read(raw)

        self.assertIsNone(reading.amount_max.value)
        self.assertIn("isn't in the sentence", reading.amount_max.note)

    def test_a_purpose_the_model_rewrote_is_not_accepted(self):
        raw = copy.deepcopy(CANNED)
        raw["purpose"] = {"value": "Funds early-career researchers across Karnataka for two years of work.", "source_page": 1}

        reading = read(raw)

        self.assertIsNone(reading.purpose.value)
        self.assertIn("wasn't found", reading.purpose.note)

    def test_amounts_in_rupees_and_crore(self):
        pages = ["Each project gets between Rs. 5,00,000 and Rs. 1.5 crore."]
        raw = {
            "title": None,
            "amount_min": {"as_written": "5,00,000", "unit": "rupees",
                           "source_quote": "Each project gets between Rs. 5,00,000 and Rs. 1.5 crore."},
            "amount_max": {"as_written": "1.5 crore", "unit": "rupees",
                           "source_quote": "Each project gets between Rs. 5,00,000 and Rs. 1.5 crore."},
        }

        reading = read(raw, pages)

        self.assertEqual(reading.amount_min.value, 5_00_000)
        self.assertEqual(reading.amount_max.value, 1_50_00_000)

    def test_foreign_currency_is_not_taken_as_rupees(self):
        pages = ["Fellows receive up to USD 50,000 per year."]
        raw = {"amount_max": {"as_written": "50,000", "unit": "rupees",
                              "source_quote": "Fellows receive up to USD 50,000 per year."}}

        reading = read(raw, pages)

        self.assertIsNone(reading.amount_max.value)
        self.assertIn("isn't in rupees", reading.amount_max.note)

    def test_rupees_and_euros_in_one_sentence_are_told_apart(self):
        quote = ("Funding: the Indian team receives up to Rs. 25 lakh; the European partner is funded separately, "
                 "up to EUR 50,000.")
        rupees = {"amount_max": {"as_written": "25", "unit": "lakh", "source_quote": quote}}
        euros = {"amount_max": {"as_written": "50,000", "unit": "rupees", "source_quote": quote}}

        self.assertEqual(read(rupees, [quote]).amount_max.value, 25_00_000)
        self.assertIsNone(read(euros, [quote]).amount_max.value)

    def test_a_minimum_above_the_maximum_is_dropped(self):
        pages = ["Support from Rs. 30 lakh to Rs. 20 lakh."]
        raw = {
            "amount_min": {"as_written": "30", "unit": "lakh", "source_quote": "Support from Rs. 30 lakh to Rs. 20 lakh."},
            "amount_max": {"as_written": "20", "unit": "lakh", "source_quote": "Support from Rs. 30 lakh to Rs. 20 lakh."},
        }

        reading = read(raw, pages)

        self.assertEqual(reading.amount_max.value, 20_00_000)
        self.assertIsNone(reading.amount_min.value)

    def test_open_all_year_needs_a_sentence_that_says_so(self):
        pages = ["Proposals can be submitted throughout the year.", "The committee meets twice a year."]
        says_so = {"open_all_year": {"value": True, "source_quote": "Proposals can be submitted throughout the year."}}
        does_not = {"open_all_year": {"value": True, "source_quote": "The committee meets twice a year."}}

        self.assertEqual(read(says_so, pages).deadline_type, "ROLLING")
        reading = read(does_not, pages)
        self.assertEqual(reading.deadline_type, "UNKNOWN")
        self.assertIn("doesn't say so", reading.open_all_year.note)

    def test_a_deadline_wins_over_open_all_year(self):
        raw = copy.deepcopy(CANNED)
        raw["open_all_year"] = {"value": True, "source_quote": "Last date for submission of proposals: 30 November 2026."}

        self.assertEqual(read(raw).deadline_type, "FIXED")

    def test_calls_announced_from_time_to_time_are_call_based(self):
        pages = ["The scheme is open through calls announced from time to time on the website."]
        raw = {"periodic_calls": {"value": True, "source_quote": pages[0]}}

        self.assertEqual(read(raw, pages).deadline_type, "CALL_BASED")

    def test_citizenship_needs_a_sentence_about_citizenship(self):
        pages = ["The Indian Principal Investigator must hold a Ph.D. and a regular position in an Indian institution."]
        raw = {"citizenship": {"value": "Indian", "source_quote": pages[0]}}

        reading = read(raw, pages)

        self.assertIsNone(reading.citizenship.value)
        self.assertIn("isn't about citizenship", reading.citizenship.note)
        self.assertEqual(read(CANNED).citizenship.value, "Indian")

    def test_a_link_must_be_copied_exactly(self):
        raw = copy.deepcopy(CANNED)
        raw["application_link"]["value"] = "https://vgst.karnataka.gov.in/apply-now"

        reading = read(raw)

        self.assertIsNone(reading.application_link.value)
        self.assertIn("link wasn't found", reading.application_link.note)

    def test_an_unknown_grant_type_is_ignored(self):
        raw = copy.deepcopy(CANNED)
        raw["grant_type"]["value"] = "Mega Grant"

        self.assertIsNone(read(raw).grant_type.value)

    def test_pasted_text_has_no_page_numbers(self):
        reading = read(CANNED, ["\n".join(PAGES)], has_page_numbers=False)

        self.assertEqual(reading.deadline.value, "2026-11-30")
        self.assertIsNone(reading.deadline.source_page)

    def test_no_title_is_flagged(self):
        reading = read({})

        self.assertIsNone(reading.title.value)
        self.assertTrue(any("No title was read" in w for w in reading.warnings))


class ReadCallTests(unittest.TestCase):
    def setUp(self):
        analysis_cache.clear()

    def test_same_call_is_read_once_and_keeps_its_source(self):
        llm = mock.AsyncMock(return_value=copy.deepcopy(CANNED))
        with mock.patch.object(reader, "generate_json", llm):
            first = asyncio.run(reader.read_call(PAGES, has_page_numbers=True, source_kind="pdf", source_name="call.pdf"))
            second = asyncio.run(reader.read_call(PAGES, has_page_numbers=True, source_kind="web",
                                                  source_name="https://vgst.karnataka.gov.in/call",
                                                  source_url="https://vgst.karnataka.gov.in/call"))

        self.assertEqual(llm.await_count, 1)
        self.assertEqual(first.amount_max.value, second.amount_max.value)
        self.assertEqual(first.page_count, 2)
        self.assertEqual(second.source_kind, "web")
        self.assertEqual(second.source_url, "https://vgst.karnataka.gov.in/call")
        self.assertEqual(first.source_url, "")


if __name__ == "__main__":
    unittest.main()
