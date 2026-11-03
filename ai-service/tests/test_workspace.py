"""Tests for the checklist extractor's non-LLM parts.

Run from ai-service/:  python -m unittest discover -s tests -v
No API keys needed: the LLM call is replaced with a canned response.
"""
from __future__ import annotations

import asyncio
import unittest
from unittest import mock

from proposal import analysis_cache
from proposal.pdf_extractor import extract_pages
from workspace import extractor, qa
from workspace.quote_check import QuoteLocator, locate_quote, normalise
from workspace.source_fetch import SourceFetchError, _check_public_host, _find_guidelines_pdf

PAGES = [
    "ANRF Core Research Grant\nGuidelines for applicants 2026-27",
    "",
    (
        "3. Documents to be submitted\n"
        "The proposal must be forwarded through the Head of the Institution with an\n"
        "endorsement certificate in the prescribed format (Annexure-II).\n"
        "Biodata of the PI not exceeding two pages should be attached."
    ),
    (
        "5. Budget\nOverhead charges shall be 10% of the total project cost,\n"
        "subject to a maximum of Rs. 5.0 lakh. The last date for online submission is 15 November 2026."
    ),
]


def make_pdf(page_texts: list[str]) -> bytes:
    """Build a minimal text PDF (one line per page) without extra libraries."""
    objects: list[bytes] = []
    kids = []
    font_id = 3 + 2 * len(page_texts)
    for i, text in enumerate(page_texts):
        page_id, content_id = 3 + 2 * i, 4 + 2 * i
        kids.append(f"{page_id} 0 R")
        safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream = f"BT /F1 12 Tf 72 720 Td ({safe}) Tj ET".encode() if text else b""
        objects.append(
            f"{page_id} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Contents {content_id} 0 R /Resources << /Font << /F1 {font_id} 0 R >> >> >> endobj\n".encode()
        )
        objects.append(
            f"{content_id} 0 obj << /Length {len(stream)} >> stream\n".encode() + stream + b"\nendstream endobj\n"
        )
    head = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        f"2 0 obj << /Type /Pages /Kids [{' '.join(kids)}] /Count {len(page_texts)} >> endobj\n".encode(),
    ]
    tail = [f"{font_id} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n".encode()]
    body = b"%PDF-1.4\n"
    offsets = []
    for obj in head + objects + tail:
        offsets.append(len(body))
        body += obj
    xref = f"xref\n0 {len(offsets) + 1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offsets)
    trailer = f"trailer << /Size {len(offsets) + 1} /Root 1 0 R >>\nstartxref\n{len(body)}\n%%EOF\n"
    return body + xref.encode() + trailer.encode()


class NormaliseTests(unittest.TestCase):
    def test_unifies_quotes_case_and_whitespace(self):
        self.assertEqual(normalise("The  PI’s   biodata\n(Annexure-II)."), "the pi s biodata annexure ii")

    def test_keeps_decimals_percent_and_rupee(self):
        self.assertEqual(normalise("10% of cost, max Rs. 5.0 lakh."), "10% of cost max rs 5.0 lakh")


class QuoteLocatorTests(unittest.TestCase):
    def test_exact_quote_on_cited_page(self):
        self.assertEqual(
            locate_quote("Biodata of the PI not exceeding two pages should be attached.", PAGES, 3),
            (True, 3),
        )

    def test_quote_split_across_pdf_lines(self):
        quote = "forwarded through the Head of the Institution with an endorsement certificate in the prescribed format"
        self.assertEqual(locate_quote(quote, PAGES, 3), (True, 3))

    def test_wrong_page_is_corrected(self):
        quote = "Overhead charges shall be 10% of the total project cost"
        self.assertEqual(locate_quote(quote, PAGES, 1), (True, 4))

    def test_small_extraction_noise_still_matches(self):
        # "Institute" instead of "Institution": 13 of 14 words match (0.93 >= 0.9).
        accepted = "The proposal must be forwarded through the Head of the Institute with an endorsement certificate"
        self.assertEqual(locate_quote(accepted, PAGES, 3), (True, 3))

    def test_paraphrase_is_not_verified(self):
        quote = "Applicants should attach a two page CV and get the HoI to sign the endorsement"
        self.assertEqual(locate_quote(quote, PAGES, 3), (False, 3))

    def test_invented_quote_is_not_verified(self):
        quote = "A plagiarism undertaking signed by all investigators is mandatory for this call"
        self.assertEqual(locate_quote(quote, PAGES, 2), (False, 2))

    def test_scattered_common_words_do_not_match(self):
        page = " ".join(["the of the and to of a in the for is"] * 40)
        quote = "the PI of the project and the head of the institution is to sign"
        self.assertEqual(locate_quote(quote, [page], 1), (False, 1))

    def test_short_quote_needs_exact_match(self):
        self.assertEqual(locate_quote("Annexure-II", PAGES, None), (True, 3))
        self.assertEqual(locate_quote("Annexure-IV", PAGES, None), (False, None))

    def test_empty_quote(self):
        self.assertEqual(QuoteLocator(PAGES).locate("", 2), (False, 2))


class CleanItemsTests(unittest.TestCase):
    def test_cleans_and_verifies_llm_output(self):
        raw = {
            "items": [
                {"category": "budget", "text": "Overhead max 10%, capped at Rs 5 lakh", "mandatory": True,
                 "source_quote": "Overhead charges shall be 10% of the total project cost,", "source_page": 3},
                {"category": "Documents", "text": "HoI endorsement (Annexure-II)", "needs_signoff": "true",
                 "source_quote": "endorsement certificate in the prescribed format (Annexure-II).", "source_page": 3},
                {"category": "document", "text": "HoI endorsement (Annexure-II)",
                 "source_quote": "duplicate", "source_page": 3},
                {"category": "astrology", "text": "Unknown category is dropped"},
                {"category": "key_dates", "text": "Submit online by 15 Nov 2026", "date": "2026-11-15",
                 "source_quote": "The last date for online submission is 15 November 2026.", "source_page": "4"},
                {"category": "format", "text": "Invented requirement", "date": "15/11/2026",
                 "source_quote": "Use Times New Roman 12 pt with 1 inch margins on all sides", "source_page": 2},
                "not a dict",
            ]
        }
        items = extractor.clean_items(raw, PAGES, has_page_numbers=True)
        self.assertEqual([i.category for i in items], ["documents", "format", "budget", "key_dates"])

        endorsement, invented, overhead, deadline = items
        self.assertTrue(endorsement.needs_signoff)
        self.assertTrue(endorsement.source_verified)
        self.assertFalse(invented.source_verified)
        self.assertIsNone(invented.date)           # non-ISO date dropped
        self.assertEqual(overhead.source_page, 4)  # corrected from 3
        self.assertTrue(overhead.source_verified)
        self.assertEqual(deadline.date, "2026-11-15")
        self.assertEqual(deadline.source_page, 4)

    def test_web_sources_have_no_page_numbers(self):
        raw = {"items": [{"category": "budget", "text": "Overhead 10%", "source_page": 4,
                          "source_quote": "Overhead charges shall be 10% of the total project cost"}]}
        [item] = extractor.clean_items(raw, ["\n".join(PAGES)], has_page_numbers=False)
        self.assertIsNone(item.source_page)
        self.assertTrue(item.source_verified)

    def test_proposal_sections_are_format_items_not_documents(self):
        raw = {"items": [
            {"category": "documents", "text": "Prepare the 'Work plan' section with a year-wise timeline."},
            {"category": "documents", "text": "Include a References section"},
            {"category": "documents", "text": "Attach the HoI endorsement certificate (Annexure-II)"},
            {"category": "documents", "text": "Attach documents listed in section 5"},
        ]}

        items = extractor.clean_items(raw, PAGES, has_page_numbers=True)

        by_text = {i.text: i.category for i in items}
        self.assertEqual(by_text["Prepare the 'Work plan' section with a year-wise timeline."], "format")
        self.assertEqual(by_text["Include a References section"], "format")
        self.assertEqual(by_text["Attach the HoI endorsement certificate (Annexure-II)"], "documents")
        self.assertEqual(by_text["Attach documents listed in section 5"], "documents")

    def test_rejects_output_without_items(self):
        with self.assertRaises(ValueError):
            extractor.clean_items({"something": "else"}, PAGES, has_page_numbers=True)


class ExtractChecklistTests(unittest.TestCase):
    def setUp(self):
        analysis_cache.clear()

    def test_end_to_end_with_canned_llm_and_cache(self):
        canned = {
            "call_deadline": "2026-11-15",
            "items": [
                {"category": "documents", "text": "Attach PI biodata (max 2 pages)",
                 "source_quote": "Biodata of the PI not exceeding two pages should be attached.", "source_page": 3},
                {"category": "format", "text": "Made-up font rule",
                 "source_quote": "Proposals must use Arial 11 point font throughout the document", "source_page": 1},
            ],
        }
        llm = mock.AsyncMock(return_value=canned)
        with mock.patch.object(extractor, "generate_json", llm):
            first = asyncio.run(extractor.extract_checklist(PAGES, title="ANRF CRG", source_name="a.pdf"))
            second = asyncio.run(extractor.extract_checklist(PAGES, title="ANRF CRG", source_name="b.pdf"))

        self.assertEqual(llm.await_count, 1)  # second call served from cache
        self.assertEqual(first.call_deadline, "2026-11-15")
        self.assertEqual(first.page_count, 4)
        self.assertEqual([i.source_verified for i in first.items], [True, False])
        self.assertTrue(any("Unverified source" in w for w in first.warnings))
        self.assertEqual(second.source_name, "b.pdf")
        prompt = llm.await_args.args[0]
        self.assertIn("[Page 3]", prompt)
        self.assertIn("ANRF CRG", prompt)

    def test_long_documents_are_truncated_with_warning(self):
        text, truncated = extractor.build_page_text(["x" * 100_000, "y" * 100_000], has_page_numbers=True)
        self.assertTrue(truncated)
        self.assertLessEqual(len(text), extractor.MAX_PROMPT_CHARS + 10)


class ExtractChecklistPagesTests(unittest.TestCase):
    def setUp(self):
        analysis_cache.clear()

    def test_pages_are_returned_every_time_but_never_cached(self):
        llm = mock.AsyncMock(return_value={"items": []})
        with mock.patch.object(extractor, "generate_json", llm):
            first = asyncio.run(extractor.extract_checklist(PAGES))
            second = asyncio.run(extractor.extract_checklist(PAGES))

        self.assertEqual(first.pages, PAGES)
        self.assertEqual(second.pages, PAGES)
        self.assertNotIn("pages", analysis_cache.get(extractor.cache_key(PAGES, "")))


class AskGuidelinesTests(unittest.TestCase):
    def setUp(self):
        analysis_cache.clear()

    def ask(self, canned, question="Is overhead allowed?", **kwargs):
        llm = mock.AsyncMock(return_value=canned)
        with mock.patch.object(qa, "generate_json", llm):
            answer = asyncio.run(qa.answer_question(PAGES, question, **kwargs))
        return answer, llm

    def test_quotes_are_checked_and_pages_corrected(self):
        answer, llm = self.ask({
            "status": "answered",
            "answer": "Yes, 10% of the project cost, up to Rs. 5 lakh.",
            "citations": [
                {"quote": "Overhead charges shall be 10% of the total project cost, subject to a maximum of Rs. 5.0 lakh.",
                 "page": 2},
                {"quote": "Overhead may also be used for laptops.", "page": 4},
            ],
        })

        self.assertEqual(answer.status, "answered")
        self.assertEqual([(c.verified, c.page) for c in answer.citations], [(True, 4), (False, 4)])
        self.assertEqual(answer.warnings, [])
        prompt = llm.await_args.args[0]
        self.assertIn("Question: Is overhead allowed?", prompt)
        self.assertIn("[Page 4]", prompt)

    def test_an_answer_with_no_verified_quote_carries_a_warning(self):
        answer, _ = self.ask({"status": "answered", "answer": "Yes.", "citations": [{"quote": "Laptops are allowed.", "page": 1}]})

        self.assertFalse(answer.citations[0].verified)
        self.assertTrue(any("couldn't find" in w for w in answer.warnings))

    def test_not_stated_drops_any_citations(self):
        answer, _ = self.ask({
            "status": "not_stated",
            "answer": "The guidelines don't say. Ask the agency.",
            "citations": [{"quote": "Biodata of the PI not exceeding two pages should be attached.", "page": 3}],
        }, question="Is there an age limit?")

        self.assertEqual((answer.status, answer.citations, answer.warnings), ("not_stated", [], []))

    def test_a_partial_answer_keeps_its_quotes(self):
        answer, _ = self.ask({
            "status": "partial",
            "answer": "The guidelines don't mention laptops. Overhead is 10% of the project cost.",
            "citations": [{"quote": "Overhead charges shall be 10% of the total project cost", "page": 4}],
        }, question="Can I buy a laptop?")

        self.assertEqual(answer.status, "partial")
        self.assertTrue(answer.citations[0].verified)

    def test_same_question_is_served_from_the_cache(self):
        canned = {"status": "not_stated", "answer": "The guidelines don't say."}
        self.ask(canned, question="Can I buy a laptop?")
        _, llm = self.ask(canned, question="  can I buy a LAPTOP? ")

        self.assertEqual(llm.await_count, 0)

    def test_web_pages_have_no_page_numbers(self):
        answer, llm = self.ask({
            "status": "answered", "answer": "Yes.",
            "citations": [{"quote": "Biodata of the PI not exceeding two pages should be attached.", "page": 3}],
        }, source_kind="web")

        self.assertEqual((answer.citations[0].verified, answer.citations[0].page), (True, None))
        self.assertIn("no page markers", llm.await_args.args[0])

    def test_rejects_an_empty_answer(self):
        with self.assertRaises(ValueError):
            qa.clean_answer({"status": "answered", "answer": " "}, qa.QuoteLocator(PAGES), True)


class PdfPagesTests(unittest.TestCase):
    def test_keeps_empty_pages_so_numbers_stay_correct(self):
        pages = extract_pages(make_pdf(["First page text", "", "Annexure-II endorsement"]))
        self.assertEqual(len(pages), 3)
        self.assertIn("First page", pages[0])
        self.assertEqual(pages[1].strip(), "")
        self.assertIn("Annexure-II", pages[2])

    def test_bad_bytes_return_empty_list(self):
        self.assertEqual(extract_pages(b"not a pdf"), [])


class SourceFetchTests(unittest.TestCase):
    def test_refuses_local_and_private_hosts(self):
        for url in ["http://localhost:8080/api/grants", "http://127.0.0.1/", "http://192.168.1.5/x.pdf",
                    "ftp://example.org/file.pdf"]:
            with self.subTest(url=url), self.assertRaises(SourceFetchError):
                _check_public_host(url)

    def test_finds_linked_guidelines_pdf(self):
        from bs4 import BeautifulSoup
        html = """
          <a href="/files/annual-report.pdf">Annual report</a>
          <a href="docs/CRG_Guidelines_2026.pdf">Download</a>
          <a href="/apply">Apply now</a>
        """
        found = _find_guidelines_pdf(BeautifulSoup(html, "html.parser"), "https://anrf.gov.in/calls/crg/")
        self.assertEqual(found, "https://anrf.gov.in/calls/crg/docs/CRG_Guidelines_2026.pdf")



class ItemsFromRulesTests(unittest.TestCase):
    def test_checkable_rules_missing_from_checklist_are_added_once(self):
        from workspace.extractor import items_from_rules
        from workspace.schemas import ChecklistItem, ProposalRule
        rules = [
            ProposalRule(id="R1", text="Proposal must not exceed 25 pages", kind="limit", metric="pages",
                         operator="max", value=25, source_quote="shall not exceed 25 pages", source_page=15, source_verified=True),
            ProposalRule(id="R2", text="Overhead limited to 8% of total cost", kind="limit", metric="overhead_percent",
                         operator="max", value=8),
            ProposalRule(id="R3", text="No vehicles", kind="forbidden_item", keywords=["vehicle"]),
            ProposalRule(id="R4", text="Objectives must be measurable", kind="judgement"),
        ]
        items = [ChecklistItem(category="budget", text="Overhead charges limited to 8% of total project cost")]
        added = items_from_rules(rules, items)
        self.assertEqual([(i.category, i.text) for i in added],
                         [("format", "Proposal must not exceed 25 pages"), ("budget", "No vehicles")])
        self.assertEqual(added[0].source_page, 15)
        self.assertTrue(added[0].source_verified)

    def test_same_sentence_with_a_second_limit_is_still_added(self):
        from workspace.extractor import items_from_rules
        from workspace.schemas import ChecklistItem, ProposalRule
        quote = "Overhead charges shall be 10% of the total cost, subject to a maximum of Rs. 5 lakh."
        items = [ChecklistItem(category="budget", text="Overhead max 10 percent of total cost", source_quote=quote)]
        rules = [ProposalRule(id="R1", text="Overhead max 10 percent", kind="limit", metric="overhead_percent",
                              operator="max", value=10, source_quote=quote),
                 ProposalRule(id="R2", text="Overhead max Rs. 5 lakh", kind="limit", metric="overhead_amount",
                              operator="max", value=5, source_quote=quote)]
        self.assertEqual([i.text for i in items_from_rules(rules, items)], ["Overhead max Rs. 5 lakh"])


if __name__ == "__main__":
    unittest.main()
