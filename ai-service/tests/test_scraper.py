"""Grant link discovery on seed pages (no network, no Firecrawl).

ICSSR's pages carry an email disguised as a link ("https://cc [at] icssr
[dot] org"), which urllib can't parse; it used to end the crawl and drop
every grant link already found.

Discovery also recognises calls named "Scheme", "Programme" or "Fund",
follows a listing's next pages, and renders pages built by JavaScript
through Firecrawl (mocked here).
"""
from __future__ import annotations

import unittest
from unittest import mock

from scraper import firecrawl_scraper
from scraper.firecrawl_scraper import _join_link, crawl_for_grants
from scraper.smart_scheduler import _clean_candidate_url

_no_delay = mock.patch.object(firecrawl_scraper, "DISCOVERY_DELAY_SECONDS", 0)


def setUpModule():
    _no_delay.start()


def tearDownModule():
    _no_delay.stop()


def crawl(pages: dict[str, str], seed: str, rendered: dict[str, str] | None = None, **kwargs):
    """crawl_for_grants over fake pages; returns (links found, render calls, stats)."""
    render_calls: list[str] = []

    def render(url):
        render_calls.append(url)
        return (rendered or {}).get(url)

    stats: dict = {}
    with mock.patch.object(firecrawl_scraper, "_fetch_html", side_effect=lambda url, *a, **k: pages.get(url)), \
            mock.patch.object(firecrawl_scraper, "_render_html_with_firecrawl", side_effect=render), \
            mock.patch.object(firecrawl_scraper, "DISCOVERY_RENDER", True):
        found = crawl_for_grants(seed, stats=stats, **{"max_required": 8, **kwargs})
    return found, render_calls, stats

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


AGENCY = "https://agency.example.gov.in/calls"


class BroaderKeywordTests(unittest.TestCase):
    """Calls named "Scheme", "Programme", "Grant" or "Fund" are found; look-alikes aren't."""

    PAGE = """
        <a href="/seed-grant-scheme">Seed Grant Scheme 2026</a>
        <a href="/travel-grant">Travel Grant</a>
        <a href="/startup-seed-fund">Startup Seed Fund</a>
        <a href="/ysp">Young Scientist Programme</a>
        <a href="/refund">Refund policy</a>
        <a href="/fundamental">Fundamental rights of citizens</a>
        <a href="/pac">Programme Advisory Committee</a>
        <a href="/annual-report">Annual Report of the Scheme</a>
        <a href="/awardees">List of awardees 2025</a>
        <a href="/schemes">Schemes</a>
    """

    def test_new_call_words_are_found(self):
        found, _, _ = crawl({AGENCY: self.PAGE}, AGENCY)
        base = "https://agency.example.gov.in"
        for path in ("/seed-grant-scheme", "/travel-grant", "/startup-seed-fund", "/ysp"):
            self.assertIn(base + path, found)

    def test_look_alikes_and_bare_menu_items_are_not(self):
        found, _, _ = crawl({AGENCY: self.PAGE}, AGENCY)
        base = "https://agency.example.gov.in"
        for path in ("/refund", "/fundamental", "/pac", "/annual-report", "/awardees", "/schemes"):
            self.assertNotIn(base + path, found)

    def test_clear_calls_rank_ahead_of_scheme_programme_fund_links(self):
        page = """
            <a href="/w1">Startup Seed Fund</a>
            <a href="/w2">Young Scientist Programme</a>
            <a href="/s1">Call for Proposals 2026</a>
            <a href="/s2">Senior Fellowship</a>
        """
        found, _, _ = crawl({AGENCY: page}, AGENCY)
        base = "https://agency.example.gov.in"
        self.assertEqual(found, [base + "/s1", base + "/s2", base + "/w1", base + "/w2"])

    def test_scheme_links_never_crowd_out_clear_calls(self):
        weak = "".join(f'<a href="/scheme-{i}">Scheme number {i}</a>' for i in range(30))
        found, _, _ = crawl({AGENCY: weak + '<a href="/call">Call for Proposals</a>'}, AGENCY, max_required=2)
        self.assertEqual(len(found), 4)  # max_required * 2
        self.assertEqual(found[0], "https://agency.example.gov.in/call")

    def test_known_noise_is_filtered(self):
        page = """
            <a href="/photo-gallery/hindi-programme-2026">Hindi Programme September 2026</a>
            <a href="/pdfnews/0064351_CIRCULAR_003.pdf">UGC scheme guidelines</a>
            <a href="https://www.pib.gov.in/PressReleasePage.aspx?PRID=1">Fellowship scheme launched</a>
            <a href="https://onlinesbi.sbi.bank.in/sbicollect/">Pay fellowship fee</a>
            <a href="/manual.pdf">User manual for the research programme</a>
            <a href="/pdf/User manual for new user registration.pdf">Extramural Research Programme guide</a>
            <a href="/subpage/RTI-Act.aspx">Scheme information under the Act</a>
        """
        found, _, _ = crawl({AGENCY: page}, AGENCY)
        self.assertEqual(found, [])

    def test_plural_call_wording_is_a_clear_call(self):
        page = """
            <a href="/w">Young Scientist Programme</a>
            <a href="/special">Special Calls for Research Studies</a>
            <a href="/cfp">Calls for Proposals 2026-27</a>
        """
        found, _, _ = crawl({AGENCY: page}, AGENCY)
        base = "https://agency.example.gov.in"
        self.assertEqual(found, [base + "/special", base + "/cfp", base + "/w"])

    def test_public_notice_of_a_call_is_kept(self):
        found, _, _ = crawl({AGENCY: '<a href="/n">Public Notice: Call for Proposals under the Scheme</a>'}, AGENCY)
        self.assertEqual(found, ["https://agency.example.gov.in/n"])


class PaginationTests(unittest.TestCase):
    """A listing's next pages are followed, up to MAX_LISTING_PAGES (3)."""

    PAGES = {
        AGENCY: '<a href="/a">Research Grant A</a> <a href="?page=2">Next ›</a>',
        AGENCY + "?page=2": '<a href="/b">Research Grant B</a> <a href="?page=3">3</a>',
        AGENCY + "?page=3": '<a href="/c">Research Grant C</a> <a rel="next" href="?page=4">More</a>',
        AGENCY + "?page=4": '<a href="/d">Research Grant D</a>',
    }

    def test_follows_next_and_numbered_links_up_to_three_pages(self):
        found, _, _ = crawl(self.PAGES, AGENCY)
        base = "https://agency.example.gov.in"
        self.assertEqual(found, [base + "/a", base + "/b", base + "/c"])

    def test_page_links_are_never_candidates(self):
        found, _, _ = crawl(self.PAGES, AGENCY)
        self.assertFalse(any("page=" in url for url in found))

    def test_last_page_arrows_and_other_sites_are_not_followed(self):
        pages = {
            AGENCY: '<a href="/a">Research Grant A</a> <a href="?page=9">»»</a> '
                    '<a href="https://elsewhere.example.org/?page=2">Next</a>',
            AGENCY + "?page=9": '<a href="/z">Research Grant Z</a>',
        }
        found, _, _ = crawl(pages, AGENCY)
        self.assertEqual(found, ["https://agency.example.gov.in/a"])


class JavaScriptRenderTests(unittest.TestCase):
    """A seed with no grant links in its plain HTML is rendered through Firecrawl."""

    SHELL = '<html><body><div id="root"></div><script src="/app.js"></script></body></html>'

    def test_script_built_seed_is_rendered_and_its_links_found(self):
        found, calls, stats = crawl({AGENCY: self.SHELL}, AGENCY,
                                    rendered={AGENCY: '<a href="/call-1">Call for Proposals 2026</a>'})
        self.assertEqual(calls, [AGENCY])
        self.assertEqual(found, ["https://agency.example.gov.in/call-1"])
        self.assertEqual(stats.get("renders"), 1)

    def test_dry_run_only_counts_what_it_would_render(self):
        found, calls, stats = crawl({AGENCY: self.SHELL}, AGENCY, render=False)
        self.assertEqual(calls, [])
        self.assertEqual(found, [])
        self.assertEqual(stats.get("would_render"), 1)

    def test_plain_html_seed_with_links_is_never_rendered(self):
        _, calls, _ = crawl({AGENCY: '<a href="/a">Research Grant A</a>'}, AGENCY)
        self.assertEqual(calls, [])

    def test_site_that_refuses_us_is_not_rendered(self):
        found, calls, _ = crawl({}, AGENCY)  # every fetch fails
        self.assertEqual((found, calls), ([], []))

    def test_renders_stop_at_the_per_seed_cap(self):
        base = "https://agency.example.gov.in"
        pages = {AGENCY: self.SHELL, base + "/schemes": self.SHELL, base + "/fellowships": self.SHELL}
        rendered = {
            AGENCY: '<a href="/schemes">Schemes</a> <a href="/fellowships">Fellowships</a>',
            base + "/schemes": '<a href="/x">Seed Grant Scheme X</a>',
            base + "/fellowships": '<a href="/y">Senior Fellowship Y</a>',
        }
        with mock.patch.object(firecrawl_scraper, "MAX_RENDERS_PER_SEED", 2):
            found, calls, _ = crawl(pages, AGENCY, rendered=rendered)
        self.assertEqual(calls, [AGENCY, base + "/schemes"])
        self.assertEqual(found, [base + "/x"])


if __name__ == "__main__":
    unittest.main()
