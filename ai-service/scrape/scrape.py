# scraper_final.py
import re
import hashlib
import requests
from bs4 import BeautifulSoup, NavigableString
from urllib.parse import urljoin, urlparse
from concurrent.futures import ThreadPoolExecutor
import time
import logging

# Optional selenium fallback only when needed
from selenium import webdriver
from selenium.webdriver.chrome.service import Service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("scraper")

USER_AGENT = "grant-scraper/1.0 (+https://example.com)"
HEADERS = {"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"}

# Positive context keywords we look for
SECTION_KEYWORDS = re.compile(
    r"grant|fund|opportunit|research|funding|call for proposals|apply|fellowship|scholarship",
    re.I
)

# Words which often indicate things we want to avoid (awards, news, blog)
EXCLUDE_KEYWORDS = re.compile(r"\b(award|news|press|blog|article|event)\b", re.I)

# Detail-page must-have keywords (improved)
DETAIL_KEYWORDS = ["deadline", "apply", "eligib", "amount", "fund", "grant", "application", "how to apply", "last date"]

# date-like patterns (e.g., 12 March 2024, 1-Jan-2025, To be announced, rolling)
DATE_PATTERN = re.compile(
    r"(\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b(?:[\s,-]+\d{2,4})?|\b(?:to be announced|tba|rolling|open until filled|open till)\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b)",
    re.I
)

CURRENCY_PATTERN = re.compile(r"(₹|\bINR\b|\$|EUR|£|rupees|usd|eur|pounds)", re.I)

MAX_LISTING_PAGES = 8
MAX_GRANT_LINKS = 120
MAX_WORKERS = 8
QUEUE_LIMIT = 60
REQUEST_TIMEOUT = 12
MAX_DETAIL_DEPTH = 1  # 0 = don't follow listing → detail, 1 = follow one level


def normalize_url(href, base):
    if not href:
        return None
    return urljoin(base, href.split("#")[0].strip())


def same_domain(url, base):
    try:
        return urlparse(url).netloc == urlparse(base).netloc
    except Exception:
        return False


def fetch(url, allow_redirects=True):
    """Try requests GET (fast). Return text or None."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT, allow_redirects=allow_redirects)
        r.raise_for_status()
        # If this is a non-HTML (pdf) we return a marker
        ct = r.headers.get("content-type", "")
        if "application/pdf" in ct or url.lower().endswith(".pdf"):
            # For PDFs we won't parse HTML; just return raw bytes marker
            return {"type": "pdf", "bytes": r.content, "url": r.url}
        return {"type": "html", "text": r.text, "url": r.url}
    except Exception as e:
        logger.debug(f"requests fetch failed {url}: {e}")
        return None


def fetch_sitemap_urls(homepage):
    """Try sitemap.xml for page URLs (fast)."""
    try:
        parsed = urlparse(homepage)
        base = f"{parsed.scheme}://{parsed.netloc}"
        sitemap_urls = [f"{base}/sitemap.xml", f"{base}/sitemap_index.xml"]
        urls = set()
        for s in sitemap_urls:
            try:
                r = requests.get(s, headers=HEADERS, timeout=6)
                if r.status_code != 200:
                    continue
                text = r.text
                # simple extraction of <loc> tags
                for m in re.findall(r"<loc>(.*?)</loc>", text, re.I):
                    if same_domain(m, homepage):
                        urls.add(m.strip())
                if urls:
                    logger.info(f"Found {len(urls)} urls from sitemap {s}")
                    return list(urls)
            except Exception:
                continue
    except Exception:
        pass
    return []


def fetch_selenium(url, driver_path="./chromedriver", wait=1.0):
    """Fallback renderer: headless chrome. Use only when needed."""
    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument(f"user-agent={USER_AGENT}")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    service = Service(driver_path)
    driver = webdriver.Chrome(service=service, options=options)
    try:
        driver.get(url)
        time.sleep(wait)
        return {"type": "html", "text": driver.page_source, "url": url}
    finally:
        try:
            driver.quit()
        except Exception:
            pass


def find_section_nodes_by_heading(html_text, base, min_count=1):
    """Return (heading_text, section_element) pairs for sections whose heading matches SECTION_KEYWORDS."""
    soup = BeautifulSoup(html_text, "lxml")
    results = []
    # look for headings h1-h4 and section-like containers
    heading_tags = soup.select("h1,h2,h3,h4,header,section,div")
    for tag in heading_tags:
        text = (tag.get_text(" ", strip=True) or "").lower()
        # require several anchors inside parent for it to be a listing section
        num_links = len(tag.find_all("a"))
        if num_links < min_count:
            continue
        if SECTION_KEYWORDS.search(text) and not EXCLUDE_KEYWORDS.search(text):
            results.append((text, tag))
    return results


def extract_links_in_container(container, base):
    """Handle anchors, elements with onclick/data-href, role=link, buttons."""
    out = set()
    # anchors
    for a in container.find_all("a", href=True):
        href = normalize_url(a["href"], base)
        if href:
            out.add(href)
    # buttons or divs with onclick='location.href=...'
    for el in container.find_all(True):
        # data-href attributes
        dh = el.attrs.get("data-href") or el.attrs.get("data-url") or el.attrs.get("data-link")
        if dh:
            out.add(normalize_url(dh, base))
        onclick = el.attrs.get("onclick")
        if onclick and "location" in onclick and ("'" in onclick or '"' in onclick):
            m = re.search(r"location(?:\.href)?\s*=\s*['\"]([^'\"]+)['\"]", onclick)
            if m:
                out.add(normalize_url(m.group(1), base))
        if el.attrs.get("role") == "link" and el.attrs.get("href"):
            out.add(normalize_url(el.attrs.get("href"), base))
    return out


def extract_grants_from_table(table_tag, base):
    """Extract grant rows from an HTML table element."""
    out = []
    headers = []
    # try to build header names
    thead = table_tag.find("thead")
    if thead:
        headers = [th.get_text(" ", strip=True).lower() for th in thead.find_all("th")]
    # fallback: first row as header if it has <th>
    if not headers:
        first_ths = table_tag.find_all("th")
        headers = [th.get_text(" ", strip=True).lower() for th in first_ths]
    # parse rows
    for tr in table_tag.find_all("tr"):
        cols = tr.find_all(["td", "th"])
        if not cols or len(cols) == 1:
            continue
        # attempt to map columns to likely fields by header names
        row_text = " | ".join(c.get_text(" ", strip=True) for c in cols)
        title = None
        url = None
        extra = {}
        for c in cols:
            a = c.find("a", href=True)
            if a and not title:
                title = a.get_text(" ", strip=True)
                url = normalize_url(a["href"], base)
            # heuristics: date-like or currency-like
            t = c.get_text(" ", strip=True)
            if DATE_PATTERN.search(t) and "deadline" not in extra:
                extra["deadline"] = t
            if CURRENCY_PATTERN.search(t) and "amount" not in extra:
                extra["amount"] = t
        if not title:
            # maybe the title is in first column text
            title = cols[0].get_text(" ", strip=True)
        out.append({"title": title, "url": url, "row_text": row_text, "meta": extra})
    return out


def extract_grants_from_container(container, base):
    """
    Handle:
     - HTML tables (preferred)
     - 'table-like' containers: many <a> tags with line/paragraph separators
    """
    results = []

    # 1) Any tables first
    for table in container.find_all("table"):
        tb = extract_grants_from_table(table, base)
        results.extend(tb)

    # 2) If container has many anchors but no real table, try line-based parsing
    anchors = container.find_all("a", href=True)
    if anchors and not results:
        # heuristics: group child-blocks (p, li, div) that contain anchors
        for child in container.find_all(recursive=False):
            # if child contains an anchor and looks like a row (p, li, div)
            if child.find("a", href=True):
                # collect first anchor as title
                a = child.find("a", href=True)
                title = a.get_text(" ", strip=True)
                url = normalize_url(a["href"], base)
                text = child.get_text(" ", strip=True)
                meta = {}
                # extract date/currency from text
                date_m = DATE_PATTERN.search(text)
                if date_m:
                    meta["deadline"] = date_m.group(0)
                cur_m = CURRENCY_PATTERN.search(text)
                if cur_m:
                    meta["amount"] = cur_m.group(0)
                results.append({"title": title, "url": url, "row_text": text, "meta": meta})
        # If still empty, fallback: iterate anchors and use nearby text / siblings
        if not results:
            for a in anchors:
                title = a.get_text(" ", strip=True)
                url = normalize_url(a["href"], base)
                # try sibling text
                sib_text = ""
                # join next sibling strings up to a short limit
                nxt = a.next_sibling
                steps = 0
                while nxt and steps < 6:
                    if isinstance(nxt, NavigableString):
                        sib_text += " " + nxt.strip()
                    else:
                        sib_text += " " + nxt.get_text(" ", strip=True)
                    nxt = nxt.next_sibling
                    steps += 1
                text = (a.parent.get_text(" ", strip=True) or "")[:1000]
                meta = {}
                m = DATE_PATTERN.search(text + " " + sib_text)
                if m:
                    meta["deadline"] = m.group(0)
                cm = CURRENCY_PATTERN.search(text + " " + sib_text)
                if cm:
                    meta["amount"] = cm.group(0)
                results.append({"title": title, "url": url, "row_text": text.strip(), "meta": meta})

    return results


def extract_candidate_links_from_page(html_text, base):
    """Smart extraction: try section headings, table-like containers, then global anchors."""
    candidates = set()
    try:
        # 1) find section nodes that mention grants (and also return any inline grants)
        sections = find_section_nodes_by_heading(html_text, base, min_count=2)
        if sections:
            for heading, container in sections:
                # extract links inside container
                links = extract_links_in_container(container, base)
                for l in links:
                    if same_domain(l, base):
                        candidates.add(l)
                # also check for direct grants inside container
                grants = extract_grants_from_container(container, base)
                if grants:
                    # we represent per-row items as 'pseudo-urls' (url may be None) by returning them in a special key
                    # return them to caller by setting an attribute on the candidates (but here we only return link list)
                    # the caller will call extract_grants_from_container again to get full rows
                    # To keep interface simple, also add container-level flag via a special header URL
                    # (we will handle grants extraction at crawl time).
                    # Add a marker to candidate set: base + "#__grant_block__<hash>"
                    marker = base + "#__grant_block__" + hashlib.sha1(str(container).encode()).hexdigest()[:10]
                    candidates.add(marker)
            if candidates:
                logger.info(f"Found {len(candidates)} candidate links/blocks from section headings")
                return list(candidates)
    except Exception as e:
        logger.debug("section extraction failed: " + str(e))

    # 2) look for table-like blocks anywhere in the page (big blocks with many anchors or tables)
    soup = BeautifulSoup(html_text, "lxml")
    for container in soup.find_all(["div", "main", "section", "article"], recursive=True):
        text = container.get_text(" ", strip=True) or ""
        if len(container.find_all("a")) >= 4 and SECTION_KEYWORDS.search(text) and not EXCLUDE_KEYWORDS.search(text):
            # mark the block so caller can parse rows directly
            marker = base + "#__grant_block__" + hashlib.sha1(str(container).encode()).hexdigest()[:10]
            candidates.add(marker)
            logger.info("Found table-like grant block")
            # store mapping of marker -> container html by attaching a hidden attribute on soup (caller will reparse)
            # for simplicity, we will re-parse page in caller and find the first large block, so just return marker
            return list(candidates)

    # 3) fallback: global anchors but only those whose anchor text or nearby text matches SECTION_KEYWORDS
    for a in soup.find_all("a", href=True):
        href = normalize_url(a["href"], base)
        if not href:
            continue
        # prefer same-domain links (we may also accept external links if they appear to be official grant hosts)
        if not same_domain(href, base):
            # still allow common external grant hosts? (skip for now)
            continue
        text = (a.get_text(" ", strip=True) or "").lower()
        parent_text = ""
        if a.parent:
            parent_text = (a.parent.get_text(" ", strip=True) or "").lower()
        context = text + " " + parent_text
        if SECTION_KEYWORDS.search(context) and not EXCLUDE_KEYWORDS.search(context):
            candidates.add(href)

    logger.info(f"Found {len(candidates)} candidate links from global anchor context")
    return list(candidates)


def page_is_grant(html_text):
    """Validate detail page: requires positive signals (deadline/apply/etc) and not excluded type."""
    if not html_text:
        return False
    soup = BeautifulSoup(html_text, "lxml")
    text = " ".join(soup.stripped_strings).lower()
    # must contain at least one strong sign: 'deadline' or date pattern or 'how to apply' or 'apply'
    positive_count = 0
    if any(k in text for k in DETAIL_KEYWORDS):
        positive_count += 1
    if DATE_PATTERN.search(text):
        positive_count += 1
    if CURRENCY_PATTERN.search(text):
        positive_count += 1
    # if it looks like a news/blog and only mentions grant once, avoid it
    if EXCLUDE_KEYWORDS.search(text) and "grant" not in text:
        return False
    return positive_count >= 1


def checksum_text(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def crawl_site_for_grants(homepage, max_listing=MAX_LISTING_PAGES, max_links=MAX_GRANT_LINKS,
                          max_workers=MAX_WORKERS, selenium_driver_path="./chromedriver",
                          max_detail_depth=MAX_DETAIL_DEPTH):
    """
    Orchestrator:
     - try sitemap for urls in the domain
     - try the provided homepage/listing page to extract candidate links or inline grant blocks
     - validate detail pages in parallel and follow one-level detail links from listings
    """
    logger.info(f"crawl_site_for_grants start: {homepage}")
    results = []
    seen_links = set()
    seen_grant_checksums = set()

    # --- Try sitemap first (fast) ---
    sitemap_urls = fetch_sitemap_urls(homepage)
    if sitemap_urls:
        # filter sitemap to pages that have positive keywords in url or path
        for u in sitemap_urls:
            if SECTION_KEYWORDS.search(u) and same_domain(u, homepage):
                seen_links.add(u)
        if len(seen_links) >= max_links:
            logger.info("Using sitemap-derived links")

    # --- fetch homepage/listing HTML ---
    homepage_resp = fetch(homepage)
    if not homepage_resp:
        # last resort selenium render once
        try:
            homepage_resp = fetch_selenium(homepage, driver_path=selenium_driver_path, wait=1.0)
        except Exception:
            homepage_resp = None

    if homepage_resp and homepage_resp.get("type") == "html":
        homepage_html = homepage_resp["text"]
        # 1) detect inline grant blocks (tables or dense anchor blocks)
        try:
            soup = BeautifulSoup(homepage_html, "lxml")
            # find largest container by number of anchors
            candidate_containers = sorted(
                [c for c in soup.find_all(["div", "main", "section", "article"])],
                key=lambda x: len(x.find_all("a")),
                reverse=True
            )[:4]
            for c in candidate_containers:
                if len(c.find_all("a")) >= 4 and SECTION_KEYWORDS.search(c.get_text(" ", strip=True) or ""):
                    grants = extract_grants_from_container(c, homepage)
                    if grants:
                        for g in grants:
                            # if we already have a URL for this row, we will follow it later; but if no URL, accept
                            url = g.get("url")
                            text = g.get("row_text") or ""
                            # check if this row is a real grant (deadline / apply keywords or date)
                            if page_is_grant(text) or g.get("meta"):
                                checksum = checksum_text((url or "") + "||" + (g.get("title") or "") + "||" + (text or ""))
                                if checksum not in seen_grant_checksums:
                                    seen_grant_checksums.add(checksum)
                                    results.append({"url": url, "title": g.get("title"), "checksum": checksum, "snippet": text, "meta": g.get("meta")})
                        # keep going, but continue to gather link candidates too
            # 2) extract candidate links from homepage
            candidates = extract_candidate_links_from_page(homepage_html, homepage)
            for c in candidates:
                if len(seen_links) >= max_links:
                    break
                # markers for inline grant blocks are not external links — skip adding to seen_links but we'll parse homepage block above
                if "#__grant_block__" in c:
                    continue
                if same_domain(c, homepage):
                    seen_links.add(c)
        except Exception as e:
            logger.debug("homepage parsing failed: " + str(e))

    # If still empty, try shallow crawl of a few internal pages (limited)
    if not seen_links:
        logger.info("No candidates found from sitemap/sections, doing shallow anchor scan")
        try:
            soup = BeautifulSoup(homepage_resp["text"] if homepage_resp and homepage_resp.get("type") == "html" else "", "lxml")
            anchors = [normalize_url(a.get("href"), homepage) for a in soup.find_all("a", href=True)]
            anchors = [a for a in anchors if a and same_domain(a, homepage)]
        except Exception:
            anchors = []
        anchors = list(dict.fromkeys(anchors))[:min(40, QUEUE_LIMIT)]
        for a in anchors:
            html_resp = fetch(a)
            if not html_resp or html_resp.get("type") != "html":
                continue
            cand = extract_candidate_links_from_page(html_resp["text"], homepage)
            for c in cand:
                if len(seen_links) >= max_links:
                    break
                if "#__grant_block__" in c:
                    continue
                seen_links.add(c)
            if len(seen_links) >= max_links:
                break

    seen_list = list(seen_links)[:max_links]
    logger.info(f"Candidate detail links before validation: {len(seen_list)}")
    # Validate detail pages in parallel (requests-first, optional selenium fallback per-url)
    def validate_and_fetch(url):
        # url may be None (some inline rows had no link)
        if not url:
            return None
        # fetch the URL
        resp = fetch(url)
        if not resp:
            # try selenium fallback
            try:
                resp = fetch_selenium(url, driver_path=selenium_driver_path, wait=1.0)
            except Exception:
                resp = None
        if not resp:
            return None
        # If it's a PDF, accept as a grant detail if surrounding listing suggests it
        if resp.get("type") == "pdf":
            return {"url": url, "checksum": checksum_text(url), "snippet": "pdf:" + url, "html": None, "is_pdf": True}
        html = resp.get("text")
        if page_is_grant(html):
            text = BeautifulSoup(html, "lxml").get_text("\n").strip()
            return {"url": url, "checksum": checksum_text(text), "snippet": text[:1000], "html": html}
        # if not a direct grant page, but this page contains many internal links (a listing), try to discover detail links (one level)
        if max_detail_depth > 0:
            try:
                inner_candidates = extract_candidate_links_from_page(html, url)
                # filter for anchors that look like details
                inner = []
                for ic in inner_candidates:
                    if "#__grant_block__" in ic:
                        continue
                    if same_domain(ic, url):
                        inner.append(ic)
                # try validating inner candidates sequentially (small number)
                inner_results = []
                for ic in inner[:20]:
                    r2 = validate_and_fetch(ic)
                    if not r2:
                        # r2 may be pdf or html grant detail
                        continue
                    if isinstance(r2, list):
                        inner_results.extend(r2)
                    else:
                        inner_results.append(r2)
                return inner_results if inner_results else None
            except Exception:
                pass
        # Not a grant detail
        return None

    validated = []
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        for r in ex.map(validate_and_fetch, seen_list):
            if r:
                # dedupe by checksum
                if r.get("checksum") and r["checksum"] not in seen_grant_checksums:
                    seen_grant_checksums.add(r["checksum"])
                    validated.append(r)
                elif not r.get("checksum"):
                    validated.append(r)
                if len(validated) >= max_links:
                    break

    # combine results: results from inline blocks + validated detail pages
    results.extend(validated)
    logger.info(f"Validated grant pages / rows: {len(results)}")
    return results


# Example usage:
if __name__ == "__main__":
    test_sites = [
        "https://www.ncbs.res.in/rdo/sponsor-grants",
        "https://www.indiascienceandtechnology.gov.in/funding-opportunities/research-grants/international"
    ]
    for s in test_sites:
        print("Crawling:", s)
        out = crawl_site_for_grants(s, max_listing=6, max_links=40, max_workers=6, selenium_driver_path="./chromedriver", max_detail_depth=1)
        print(f"Found {len(out)} items for {s}")
        for i, item in enumerate(out[:6], 1):
            print(i, item.get("title") or item.get("url"), item.get("url"))