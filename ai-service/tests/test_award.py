"""Tests for the sanction-order reader's non-LLM parts (Objective 4, item 4.5).

Run from ai-service/:  python -m unittest discover -s tests -v
No API keys needed: the LLM call is replaced with a canned response.
"""
from __future__ import annotations

import asyncio
import copy
import unittest
from datetime import date
from decimal import Decimal
from unittest import mock

from award import sanction_reader
from award.sanction_reader import clean_reading, numbers_in, parse_date, to_rupees
from proposal import analysis_cache

PAGES = [
    (
        "National Science Council (sample)\n"
        "No. NSC/ECRG/2026-27/1182 Dated: 18 September 2026\n"
        "SANCTION ORDER\n"
        'Sub: Early Career Research Grant - sanction of the project "Machine-learning models for early\n'
        'detection of crop stress from drone images".\n'
        "Period: 36 months, with effect from 1 October 2026 (date of start) to 30 September 2029.\n"
        "Total amount sanctioned: Rs. 30,66,000 (Rupees Thirty Lakh Sixty Six Thousand only).\n"
        "Head Year 1 Year 2 Year 3 Total (Rs.)\n"
        "Equipment 8,50,000 0 0 8,50,000\n"
        "Manpower (1 PA) 4,32,000 4,32,000 4,32,000 12,96,000\n"
        "Consumables 1,50,000 1,50,000 1,00,000 4,00,000\n"
        "Total 16,72,000 7,22,000 6,72,000 30,66,000\n"
    ),
    (
        "Overhead of Rs. 2.5 lakh is sanctioned in addition.\n"
        "Any balance left unspent at the end of a financial year shall be carried forward to the next financial year.\n"
        "Reports are to be submitted on https://nsc-projects.example.org.\n"
    ),
]


def field(**kwargs):
    entry = {"source_page": 1}
    entry.update(kwargs)
    return entry


CANNED = {
    "project_title": field(value="Machine-learning models for early detection of crop stress from drone images",
                           source_quote='Sub: Early Career Research Grant - sanction of the project "Machine-learning '
                                        'models for early detection of crop stress from drone images".'),
    "agency": field(value="National Science Council (sample)", source_quote="National Science Council (sample)"),
    "scheme": field(value="Early Career Research Grant",
                    source_quote="Sub: Early Career Research Grant - sanction of the project"),
    "sanction_no": field(value="NSC/ECRG/2026-27/1182", source_quote="No. NSC/ECRG/2026-27/1182 Dated: 18 September 2026"),
    "sanction_date": field(as_written="18 September 2026", source_quote="No. NSC/ECRG/2026-27/1182 Dated: 18 September 2026"),
    "start_date": field(as_written="1 October 2026",
                        source_quote="Period: 36 months, with effect from 1 October 2026 (date of start) to 30 September 2029."),
    "end_date": field(as_written="30 September 2029",
                      source_quote="Period: 36 months, with effect from 1 October 2026 (date of start) to 30 September 2029."),
    "total_sanctioned": field(as_written="30,66,000", unit="rupees",
                              source_quote="Total amount sanctioned: Rs. 30,66,000 (Rupees Thirty Lakh Sixty Six Thousand only)."),
    "unspent_policy": field(value="CARRY_FORWARD", source_page=2,
                            source_quote="Any balance left unspent at the end of a financial year shall be carried forward "
                                         "to the next financial year."),
    "portal_url": field(value="https://nsc-projects.example.org", source_page=2,
                        source_quote="Reports are to be submitted on https://nsc-projects.example.org."),
    "budget": [
        {"label": "Equipment", "head": "EQUIPMENT", "amount_as_written": "8,50,000",
         "year_amounts_as_written": ["8,50,000", "0", "0"], "unit": "rupees",
         "source_quote": "Equipment 8,50,000 0 0 8,50,000", "source_page": 1},
        {"label": "Manpower (1 PA)", "head": "MANPOWER", "amount_as_written": None,
         "year_amounts_as_written": ["4,32,000", "4,32,000", "4,32,000"], "unit": "rupees",
         "source_quote": "Manpower (1 PA) 4,32,000 4,32,000 4,32,000 12,96,000", "source_page": 1},
        {"label": "Consumables", "head": "CONSUMABLES", "amount_as_written": "4,00,000",
         "year_amounts_as_written": ["1,50,000", "1,50,000", "1,00,000"], "unit": "rupees",
         "source_quote": "Consumables 1,50,000 1,50,000 1,00,000 4,00,000", "source_page": 1},
        {"label": "Total", "head": "OTHERS", "amount_as_written": "30,66,000", "unit": "rupees",
         "source_quote": "Total 16,72,000 7,22,000 6,72,000 30,66,000", "source_page": 1},
        {"label": "Overhead", "head": "OVERHEAD", "amount_as_written": "2.5", "unit": "lakh",
         "source_quote": "Overhead of Rs. 2.5 lakh is sanctioned in addition.", "source_page": 2},
    ],
}


def read(raw):
    return clean_reading(copy.deepcopy(raw), PAGES)


class ReadingNumbersAndDatesTests(unittest.TestCase):
    def test_dates_in_indian_styles(self):
        self.assertEqual(parse_date("15 August 2026"), date(2026, 8, 15))
        self.assertEqual(parse_date("15th Aug, 2026"), date(2026, 8, 15))
        self.assertEqual(parse_date("August 15, 2026"), date(2026, 8, 15))
        self.assertEqual(parse_date("15.08.2026"), date(2026, 8, 15))
        self.assertEqual(parse_date("05/08/2026"), date(2026, 8, 5))  # day first, as Indian orders write it
        self.assertEqual(parse_date("2026-08-15"), date(2026, 8, 15))
        self.assertEqual(parse_date("29 February 2028"), date(2028, 2, 29))

    def test_impossible_or_vague_dates_are_not_read(self):
        self.assertIsNone(parse_date("29 February 2027"))
        self.assertIsNone(parse_date("31 June 2026"))
        self.assertIsNone(parse_date("the date of release of funds"))

    def test_amounts_are_converted_by_code(self):
        self.assertEqual(to_rupees("39.27", "lakh")[0], 39_27_000)
        self.assertEqual(to_rupees("Rs. 30,66,000", None)[0], 30_66_000)
        self.assertEqual(to_rupees("1.5", "crore")[0], 1_50_00_000)
        self.assertEqual(to_rupees("Rs. 5 lakh", "rupees")[0], 5_00_000)  # the unit word in the text wins
        self.assertEqual(to_rupees("not stated", "lakh"), (None, None))

    def test_numbers_in_text(self):
        self.assertEqual(numbers_in("Manpower 4,32,000 and 12.00 lakh"), [Decimal(432000), Decimal("12.00")])


class CleanReadingTests(unittest.TestCase):
    def test_confirmed_values_are_filled(self):
        reading = read(CANNED)

        self.assertEqual(reading.project_title.value,
                         "Machine-learning models for early detection of crop stress from drone images")
        self.assertEqual(reading.sanction_no.value, "NSC/ECRG/2026-27/1182")
        self.assertEqual(reading.sanction_date.value, "2026-09-18")
        self.assertEqual(reading.start_date.value, "2026-10-01")
        self.assertEqual(reading.end_date.value, "2029-09-30")
        self.assertEqual(reading.total_sanctioned.value, 30_66_000)
        self.assertEqual(reading.unspent_policy.value, "CARRY_FORWARD")
        self.assertEqual(reading.portal_url.value, "https://nsc-projects.example.org")
        self.assertEqual(reading.unspent_policy.source_page, 2)
        self.assertTrue(reading.end_date.verified)

    def test_year_wise_rows_are_added_up_by_code_and_totals_skipped(self):
        lines = {line.head: line.amount for line in read(CANNED).budget_lines}

        self.assertEqual(lines, {"EQUIPMENT": 8_50_000, "MANPOWER": 12_96_000, "CONSUMABLES": 4_00_000,
                                 "OVERHEAD": 2_50_000})
        self.assertEqual([line.head for line in read(CANNED).budget_lines],
                         ["EQUIPMENT", "MANPOWER", "CONSUMABLES", "OVERHEAD"])

    def test_heads_that_disagree_with_the_total_are_flagged(self):
        reading = read(CANNED)  # the overhead sits outside the 30,66,000 total

        self.assertTrue(any("heads add up to Rs. 27.96 lakh but the total is Rs. 30.66 lakh" in w
                            for w in reading.warnings), reading.warnings)

    def test_a_misread_amount_is_left_empty(self):
        raw = copy.deepcopy(CANNED)
        raw["total_sanctioned"]["as_written"] = "30,96,000"

        reading = read(raw)

        self.assertIsNone(reading.total_sanctioned.value)
        self.assertFalse(reading.total_sanctioned.verified)
        self.assertIn("Total sanctioned was left empty: the amount isn't in the sentence it came from.", reading.warnings)

    def test_a_date_missing_from_its_quote_is_left_empty(self):
        raw = copy.deepcopy(CANNED)
        raw["end_date"]["as_written"] = "29 September 2029"

        self.assertIsNone(read(raw).end_date.value)

    def test_a_quote_that_is_not_in_the_pdf_is_not_trusted(self):
        raw = copy.deepcopy(CANNED)
        raw["project_title"] = field(value="Drones for crop stress", source_quote="The project Drones for crop stress is sanctioned.")

        reading = read(raw)

        self.assertIsNone(reading.project_title.value)
        self.assertEqual(reading.project_title.note, "its sentence wasn't found in the PDF")

    def test_a_value_not_in_its_quote_is_not_trusted(self):
        raw = copy.deepcopy(CANNED)
        raw["agency"]["value"] = "Department of Science and Technology"

        self.assertIsNone(read(raw).agency.value)

    def test_a_row_whose_years_disagree_with_its_total_is_left_out(self):
        raw = copy.deepcopy(CANNED)
        raw["budget"][2]["year_amounts_as_written"] = ["1,50,000", "1,50,000", "1,50,000"]  # misread Year 3

        reading = read(raw)

        self.assertNotIn("CONSUMABLES", [line.head for line in reading.budget_lines])
        self.assertIn("Consumables wasn't filled in: its years add up to Rs. 4.50 lakh, not the Rs. 4.00 lakh printed.",
                      reading.warnings)

    def test_a_year_amount_not_in_its_row_is_left_out(self):
        raw = copy.deepcopy(CANNED)
        raw["budget"][2]["year_amounts_as_written"] = ["1,50,000", "1,50,000", "0"]

        self.assertIn("Consumables wasn't filled in: the amount 0 isn't in its row.", read(raw).warnings)

    def test_items_under_the_same_head_are_added_together(self):
        raw = copy.deepcopy(CANNED)
        raw["budget"].append({"label": "Laptop", "head": "EQUIPMENT", "amount_as_written": "0.85", "unit": "lakh",
                              "source_quote": "Equipment 8,50,000 0 0 8,50,000", "source_page": 1})

        reading = read(raw)

        self.assertFalse(any(line.head == "EQUIPMENT" and line.amount == 9_35_000 for line in reading.budget_lines),
                         "0.85 isn't in the quoted row, so the laptop must not be added")
        raw["budget"][-1]["source_quote"] = "Overhead of Rs. 2.5 lakh is sanctioned in addition."
        raw["budget"][-1]["amount_as_written"] = "2.5"
        equipment = next(line for line in read(raw).budget_lines if line.head == "EQUIPMENT")
        self.assertEqual(equipment.amount, 11_00_000)
        self.assertEqual([item.label for item in equipment.items], ["Equipment", "Laptop"])

    def test_unknown_head_goes_to_others(self):
        raw = copy.deepcopy(CANNED)
        raw["budget"][0]["head"] = "MACHINERY"

        self.assertIn("OTHERS", [line.head for line in read(raw).budget_lines])

    def test_a_link_must_be_in_the_pdf(self):
        raw = copy.deepcopy(CANNED)
        raw["portal_url"]["value"] = "https://nsc.gov.in"

        self.assertIsNone(read(raw).portal_url.value)

    def test_end_date_before_start_is_left_empty(self):
        raw = copy.deepcopy(CANNED)
        raw["end_date"] = copy.deepcopy(raw["sanction_date"])  # 18 Sep 2026, before the 1 Oct start

        reading = read(raw)

        self.assertIsNone(reading.end_date.value)
        self.assertEqual(reading.start_date.value, "2026-10-01")

    def test_nothing_stated_means_nothing_filled_and_no_warning(self):
        reading = read({"start_date": {"as_written": None}, "unspent_policy": {"value": None}})

        self.assertIsNone(reading.start_date.value)
        self.assertIsNone(reading.unspent_policy.value)
        self.assertEqual(reading.warnings, [])

    def test_a_total_that_leaves_out_overhead_is_pointed_out(self):
        raw = copy.deepcopy(CANNED)
        raw["total_sanctioned"]["excludes_overhead"] = True

        self.assertTrue(any("leaves out overhead" in w for w in read(raw).warnings))


class ReadSanctionOrderTests(unittest.TestCase):
    def setUp(self):
        analysis_cache.clear()

    def test_same_order_is_read_once(self):
        llm = mock.AsyncMock(return_value=copy.deepcopy(CANNED))
        with mock.patch.object(sanction_reader, "generate_json", llm):
            first = asyncio.run(sanction_reader.read_sanction_order(PAGES, source_name="order.pdf"))
            second = asyncio.run(sanction_reader.read_sanction_order(PAGES, source_name="copy.pdf"))

        self.assertEqual(llm.await_count, 1)
        self.assertEqual(first.total_sanctioned.value, second.total_sanctioned.value)
        self.assertEqual(second.source_name, "copy.pdf")
        self.assertEqual(first.page_count, 2)


if __name__ == "__main__":
    unittest.main()
