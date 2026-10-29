"""Grant link discovery on seed pages (no network, no Firecrawl).

ICSSR's pages carry an email disguised as a link ("https://cc [at] icssr
[dot] org"), which urllib can't parse; it used to end the crawl and drop
every grant link already found.
"""
from __future__ import annotations

import unittest
from unittest import mock

from scraper import firecrawl_scraper
from scraper.firecrawl_scraper import _join_link, crawl_for_grants
from scraper.smart_scheduler import _clean_candidate_url

SEED = "https://icssr.org/"

PAGES = {
    SEED: """
        <a href="/senior-fellowship">Senior Fellowships</a>
        <a href="https://cc [at] icssr [dot] org">cc [at] icssr [dot] org</a>
        <a href="/doctoral-fellowship">Doctoral Fellowships</a>
    """,
}


class JoinLinkTests(unittest.TestCase):
    def test_disguised_email_is_skipped(self):
        self.assertIsNone(_join_link(SEED, "https://cc [at] icssr [dot] org"))

    def test_relative_link_is_made_absolute(self):
        self.assertEqual(_join_link(SEED, " /national-fellowship "), "https://icssr.org/national-fellowship")


class CrawlTests(unittest.TestCase):
    def test_unparseable_link_does_not_drop_the_others(self):
        with mock.patch.object(firecrawl_scraper, "_fetch_html", side_effect=lambda url, *a, **k: PAGES.get(url)):
            found = crawl_for_grants(SEED, max_required=8)

        self.assertEqual(found, ["https://icssr.org/senior-fellowship", "https://icssr.org/doctoral-fellowship"])

    def test_error_mid_crawl_keeps_links_found_so_far(self):
        def fetch(url, *args, **kwargs):
            if url == SEED:
                return PAGES[SEED]
            raise RuntimeError("network down")

        with mock.patch.object(firecrawl_scraper, "_fetch_html", side_effect=fetch):
            found = crawl_for_grants(SEED, max_required=8)

        self.assertIn("https://icssr.org/senior-fellowship", found)


class CandidateFilterTests(unittest.TestCase):
    def test_bank_disbursement_portal_is_not_a_grant(self):
        self.assertIsNone(_clean_candidate_url("https://scholarship.canarabank.bank.in/"))
        self.assertIsNone(_clean_candidate_url("https://scholarship.canarabank.in/"))


if __name__ == "__main__":
    unittest.main()
