# scraper_final.py
import argparse
import hashlib
import json
import logging
import os
import re
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup, NavigableString

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

CURRENCY_PATTERN = re.compile(r"(₹|\bINR\b|\$|\bEUR\b|€|£|\brupees\b|\bUSD\b|\bGBP\b|\bpounds\b)", re.I)

MAX_LISTING_PAGES = 8
MAX_GRANT_LINKS = 120
MAX_WORKERS = 8
QUEUE_LIMIT = 60
REQUEST_TIMEOUT = 12
MAX_DETAIL_DEPTH = 2  # 0 = don't follow listing → detail, 1+ = nested follow depth
FETCH_RETRIES = 3
FETCH_BACKOFF = 0.8
TRANSIENT_STATUS_CODES = {429, 500, 502, 503, 504}


def normalize_url(href, base):
    if not href:
        return None
    return urljoin(base, href.split("#")[0].strip())


def same_domain(url, base):
    try:
        return urlparse(url).netloc == urlparse(base).netloc
    except Exception:
        return False


def _is_document_like_url(url):
    if not url:
        return False
    path = (urlparse(url).path or "").lower()
    doc_exts = (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".zip")
    if path.endswith(doc_exts):
        return True
    if "/assets/pdf/" in path:
        return True
    return False


def should_follow_detail_candidate(url, homepage):
    """Filter out links that are unlikely to be grant detail pages."""
    if not url or not same_domain(url, homepage):
        return False

    if _is_document_like_url(url):
        return False

    parsed = urlparse(url)
    path = (parsed.path or "").lower()

    deny_path_hints = [
        "/directory",
        "/scientist",
        "/committee",
        "/career",
        "/recruit",
        "/notice",
        "/advert",
        "/order",
        "/circular",
        "/vigilance",
        "/sitemap",
        "/contact",
        "/faq",
        "/tender",
        "/assets",
        "/about",
        "/home",
        "/vision",
        "/mission",
        "/image",
        "/media",
    ]
    if any(h in path for h in deny_path_hints):
        return False

    return True


def fetch(url, allow_redirects=True, retries=FETCH_RETRIES, backoff=FETCH_BACKOFF):
    """Try requests GET with retry/backoff for transient errors."""
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT, allow_redirects=allow_redirects)
            status = r.status_code

            if status in TRANSIENT_STATUS_CODES:
                if attempt < retries - 1:
                    wait_s = backoff * (2 ** attempt)
                    logger.debug("Transient status %s for %s; retrying in %.1fs", status, url, wait_s)
                    time.sleep(wait_s)
                    continue

            r.raise_for_status()

            ct = r.headers.get("content-type", "")
            if "application/pdf" in ct or url.lower().endswith(".pdf"):
                return {"type": "pdf", "bytes": r.content, "url": r.url}

            return {"type": "html", "text": r.text, "url": r.url}
        except requests.Timeout:
            if attempt < retries - 1:
                wait_s = backoff * (2 ** attempt)
                logger.debug("Timeout for %s; retrying in %.1fs", url, wait_s)
                time.sleep(wait_s)
                continue
            logger.debug("requests timeout failed %s", url)
            return None
        except Exception as e:
            logger.debug("requests fetch failed %s: %s", url, e)
            return None

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
        first_row = table_tag.find("tr")
        if first_row:
            first_ths = first_row.find_all(["th", "td"])
            headers = [th.get_text(" ", strip=True).lower() for th in first_ths]
    
    # parse rows (skip header row if we got headers from first row)
    rows = table_tag.find_all("tr")
    start_idx = 1 if headers else 0
    
    for tr in rows[start_idx:]:
        cols = tr.find_all(["td", "th"])
        if not cols or len(cols) == 1:
            continue
        
        # Map columns to header names
        row_data = {}
        for i, c in enumerate(cols):
            key = headers[i] if i < len(headers) else f"col_{i}"
            row_data[key] = c.get_text(" ", strip=True)
        
        row_text = " | ".join(row_data.values())
        if len(row_text) < 5:
            continue
        
        title = None
        url = None
        extra = {}
        
        # Extract link (usually for grant title)
        for c in cols:
            a = c.find("a", href=True)
            if a and not title:
                title = a.get_text(" ", strip=True)
                url = normalize_url(a["href"], base)
        
        # Extract data based on header keywords
        for key, val in row_data.items():
            if not val or len(val) < 2:
                continue
            key_lower = key.lower()
            
            # Agency/Sponsor
            if any(kw in key_lower for kw in ["agency", "sponsor", "organization", "funder", "funded by"]):
                extra["agency"] = val
            # Deadline
            elif any(kw in key_lower for kw in ["deadline", "last date", "closing date", "due date", "apply by"]):
                extra["deadline"] = val
            # Amount/Budget
            elif any(kw in key_lower for kw in ["amount", "budget", "value", "grant value"]):
                if CURRENCY_PATTERN.search(val):
                    extra["amount"] = val
            # Scheme/Program/Title (can be title fallback)
            elif any(kw in key_lower for kw in ["scheme", "program", "programme", "grant name", "grant title", "title"]):
                if not title:
                    title = val
                extra["program"] = val
            # Eligibility
            elif any(kw in key_lower for kw in ["eligibility", "eligible", "who can apply"]):
                extra["eligibility"] = val
            # Duration
            elif any(kw in key_lower for kw in ["duration", "period", "tenure"]):
                extra["duration"] = val
        
        # Fallback: extract date-like and currency-like from any column
        if "deadline" not in extra:
            for val in row_data.values():
                if DATE_PATTERN.search(val):
                    extra["deadline"] = val
                    break
        
        if "amount" not in extra:
            for val in row_data.values():
                if CURRENCY_PATTERN.search(val):
                    extra["amount"] = val
                    break
        
        # Fallback title: first column text
        if not title:
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
                logger.debug(f"Found {len(candidates)} candidate links/blocks from section headings")
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
            logger.debug("Found table-like grant block")
            # Keep collecting globally instead of returning early.

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

    logger.debug(f"Found {len(candidates)} candidate links from global extraction")
    return list(candidates)


def extract_pagination_links(html_text, page_url, homepage):
    """Discover listing-page pagination links to improve crawl coverage."""
    soup = BeautifulSoup(html_text, "lxml")
    out = set()

    selectors = [
        ("a", {"rel": re.compile(r"\bnext\b", re.I)}),
        ("a", {"aria-label": re.compile(r"next|older|following", re.I)}),
        ("a", {"class": re.compile(r"next|pagination|pager", re.I)}),
        ("a", {"title": re.compile(r"next", re.I)}),
    ]

    for tag_name, attrs in selectors:
        for el in soup.find_all(tag_name, attrs=attrs, href=True):
            href = normalize_url(el.get("href"), page_url)
            if href and same_domain(href, homepage):
                out.add(href)

    for a in soup.find_all("a", href=True):
        txt = (a.get_text(" ", strip=True) or "").lower()
        cls = " ".join(a.get("class", [])) if a.get("class") else ""
        if txt in {"next", "more", "older", ">", ">>"} or "page" in cls.lower() or txt.isdigit():
            href = normalize_url(a.get("href"), page_url)
            if href and same_domain(href, homepage):
                out.add(href)

    parsed = urlparse(page_url)
    query = parse_qs(parsed.query)
    page_like_keys = ["page", "p", "start", "offset"]
    for key in page_like_keys:
        current = 1
        if key in query:
            try:
                current = int(query[key][0])
            except Exception:
                current = 1
        for step in range(1, 3):
            nxt = current + step
            new_query = {k: list(v) for k, v in query.items()}
            new_query[key] = [str(nxt)]
            candidate = urlunparse(
                (
                    parsed.scheme,
                    parsed.netloc,
                    parsed.path,
                    parsed.params,
                    urlencode(new_query, doseq=True),
                    parsed.fragment,
                )
            )
            if same_domain(candidate, homepage):
                out.add(candidate)

    return list(out)


def page_is_grant(html_text):
    """Validate detail page: requires positive signals (deadline/apply/etc) and not excluded type."""
    if not html_text:
        return False
    soup = BeautifulSoup(html_text, "lxml")
    text = " ".join(soup.stripped_strings).lower()
    # must contain at least one strong sign: 'deadline' or date pattern or 'how to apply' or 'apply'
    # AND must strictly contain one of the target identifying keywords out of:
    # grants, funding, fellowship, research support, call for proposals, scholarships
    target_keywords = ["grant", "funding", "fellowship", "research support", "call for proposal", "scholarship", "scheme", "award"]
    if not any(kw in text for kw in target_keywords):
        return False

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


def _table_looks_like_listing(table_tag):
    rows = table_tag.find_all("tr")
    if len(rows) < 2:
        return False

    header_cells = rows[0].find_all(["th", "td"])
    header_text = " ".join(c.get_text(" ", strip=True).lower() for c in header_cells)
    listing_keywords = ["agency", "scheme", "deadline", "eligibility", "program", "grant", "fund", "amount"]
    return any(k in header_text for k in listing_keywords)


def page_looks_like_listing(html_text, url=""):
    from urllib.parse import urlparse
    if url:
        p = urlparse(url).path.lower()
        if p in ["", "/"] or p.startswith("/type/") or p.startswith("/industry/") or p.startswith("/state/"):
            return True
    """Heuristic to avoid treating listing pages as final detail pages."""
    if not html_text:
        return False

    soup = BeautifulSoup(html_text, "lxml")

    for table in soup.find_all("table"):
        if _table_looks_like_listing(table):
            return True

    # SERB accordions
    funding_sections = soup.find_all(id=re.compile(r"^funding\d+$", re.I))
    if len(funding_sections) >= 2:
        return True

    anchors = soup.find_all("a", href=True)
    if len(anchors) < 10:
        return False

    granty_anchor_count = 0
    pagination_hint = False
    for a in anchors[:300]:
        href = (a.get("href") or "").lower()
        txt = (a.get_text(" ", strip=True) or "").lower()
        if "page=" in href or "pagination" in href or txt in {"next", "previous", ">", ">>", "1", "2", "3"}:
            pagination_hint = True
        if SECTION_KEYWORDS.search(href + " " + txt):
            granty_anchor_count += 1

    if pagination_hint and granty_anchor_count >= 4:
        return True

    return granty_anchor_count >= 12


def checksum_text(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def crawl_site_for_grants(homepage, max_listing=MAX_LISTING_PAGES, max_links=MAX_GRANT_LINKS,
                          max_workers=MAX_WORKERS, selenium_driver_path="./chromedriver",
                          max_detail_depth=MAX_DETAIL_DEPTH):
    """
    Orchestrator:
     - First check if the provided URL is itself a grant detail page
     - If not, try sitemap for urls in the domain
     - try the provided homepage/listing page to extract candidate links or inline grant blocks
     - validate detail pages in parallel and follow one-level detail links from listings
    """
    logger.info(f"crawl_site_for_grants start: {homepage}")
    results = []
    seen_links = set()
    seen_grant_checksums = set()

    # --- First, check if the provided URL is a direct grant page ---
    homepage_resp = fetch(homepage)
    if not homepage_resp:
        # last resort selenium render once
        try:
            homepage_resp = fetch_selenium(homepage, driver_path=selenium_driver_path, wait=1.0)
        except Exception:
            homepage_resp = None

    if homepage_resp and homepage_resp.get("type") == "html":
        homepage_html = homepage_resp["text"]
        
        # Only treat as direct detail if it does not look like a listing page.
        soup = BeautifulSoup(homepage_html, "lxml")
        is_detail_page = (not page_looks_like_listing(homepage_html, homepage)) and page_is_grant(homepage_html)
        
        if is_detail_page:
            # This is a direct grant detail page - extract it directly and return
            logger.info("Detected direct grant detail page - extracting single grant")
            text = soup.get_text("\n").strip()
            checksum = checksum_text(text)
            results.append({
                "url": homepage,
                "title": None,
                "checksum": checksum,
                "snippet": text[:1000],
                "html": homepage_html,
                "meta": {}
            })
            logger.info(f"Validated grant pages / rows: {len(results)}")
            return results

    # --- Continue with normal crawling if not a direct detail page ---

    listing_queue = deque([homepage])
    visited_listing_pages = set()

    sitemap_urls = fetch_sitemap_urls(homepage)
    for u in sitemap_urls:
        if same_domain(u, homepage) and len(listing_queue) < QUEUE_LIMIT:
            listing_queue.append(u)

    def collect_inline_grants(page_html, page_url):
        local_results = []
        soup = BeautifulSoup(page_html, "lxml")
        candidate_containers = sorted(
            [c for c in soup.find_all(["div", "main", "section", "article"])],
            key=lambda x: len(x.find_all("a")),
            reverse=True,
        )[:6]

        for c in candidate_containers:
            if len(c.find_all("a")) < 3:
                continue
            if not SECTION_KEYWORDS.search(c.get_text(" ", strip=True) or ""):
                continue

            grants = extract_grants_from_container(c, page_url)
            for g in grants:
                url = g.get("url")
                text = g.get("row_text") or ""
                if not (page_is_grant(text) or g.get("meta")):
                    continue
                checksum = checksum_text((url or "") + "||" + (g.get("title") or "") + "||" + text)
                if checksum in seen_grant_checksums:
                    continue
                seen_grant_checksums.add(checksum)
                local_results.append(
                    {
                        "url": url,
                        "title": g.get("title"),
                        "checksum": checksum,
                        "snippet": text,
                        "meta": g.get("meta", {}),
                    }
                )

        return local_results

    while listing_queue and len(visited_listing_pages) < max_listing and len(seen_links) < max_links:
        page_url = listing_queue.popleft()
        if not page_url or page_url in visited_listing_pages:
            continue

        visited_listing_pages.add(page_url)
        resp = fetch(page_url)
        if not resp:
            try:
                resp = fetch_selenium(page_url, driver_path=selenium_driver_path, wait=1.2)
            except Exception:
                resp = None
        if not resp or resp.get("type") != "html":
            continue

        page_html = resp.get("text") or ""
        candidates = extract_candidate_links_from_page(page_html, page_url)
        added_candidates_on_page = 0
        for c in candidates:
            if len(seen_links) >= max_links:
                break
            if not c or "#__grant_block__" in c:
                continue
            if should_follow_detail_candidate(c, homepage):
                if c not in seen_links:
                    seen_links.add(c)
                    added_candidates_on_page += 1

        # Always collect inline blocks as fallback for rich listing pages
        if re.search(r"id=[\'\"]funding\d+", page_html, re.I):
            results.append({"url": page_url, "html": page_html})
        else:
            results.extend(collect_inline_grants(page_html, page_url))

        next_pages = extract_pagination_links(page_html, page_url, homepage)
        for nxt in next_pages:
            if len(listing_queue) >= QUEUE_LIMIT:
                break
            if nxt not in visited_listing_pages:
                listing_queue.append(nxt)

    if not seen_links:
        logger.info("No candidates found from listing traversal; doing fallback anchor scan")
        try:
            soup = BeautifulSoup(homepage_resp["text"] if homepage_resp and homepage_resp.get("type") == "html" else "", "lxml")
            anchors = [normalize_url(a.get("href"), homepage) for a in soup.find_all("a", href=True)]
            anchors = [a for a in anchors if a and same_domain(a, homepage)]
        except Exception:
            anchors = []

        for a in list(dict.fromkeys(anchors))[: min(40, QUEUE_LIMIT)]:
            if len(seen_links) >= max_links:
                break
            seen_links.add(a)

    seen_list = list(seen_links)[:max_links]
    logger.info(f"Candidate detail links before validation: {len(seen_list)}")

    validated_seen_urls = set()
    validated_seen_lock = threading.Lock()

    def claim_validate_url_once(candidate_url):
        with validated_seen_lock:
            if candidate_url in validated_seen_urls:
                return False
            validated_seen_urls.add(candidate_url)
            return True

    # Validate detail pages in parallel (requests-first, optional selenium fallback per-url)
    def validate_and_fetch(url, depth=0, path_seen=None):
        if not url:
            return []

        if not claim_validate_url_once(url):
            return []

        if path_seen is None:
            path_seen = set()

        if url in path_seen:
            return []

        if depth > max_detail_depth:
            return []

        local_seen = set(path_seen)
        local_seen.add(url)

        resp = fetch(url)
        if not resp:
            try:
                resp = fetch_selenium(url, driver_path=selenium_driver_path, wait=1.0)
            except Exception:
                resp = None
        if not resp:
            return []

        if resp.get("type") == "pdf":
            return [{"url": url, "checksum": checksum_text(url), "snippet": "pdf:" + url, "html": None, "is_pdf": True}]

        html = resp.get("text") or ""
        listing_like = page_looks_like_listing(html, url)

        # The user requested: "after reaching to grant page you dont need to crawl any further from that stay there only"
        # So we just keep the HTML of the page (whether it's listing-like or a single detail) 
        # and do not recursively visit any candidate links from inside it.

        text = BeautifulSoup(html, "lxml").get_text("\n").strip()
        
        if listing_like:
            return [{"url": url, "checksum": checksum_text(text), "snippet": text[:1000], "html": html, "is_listing_page": True}]

        # If the page itself is truly a detail page, keep it.
        if page_is_grant(html) and not listing_like:
            return [{"url": url, "checksum": checksum_text(text), "snippet": text[:1000], "html": html}]

        return []

    validated = []
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        for r in ex.map(lambda u: validate_and_fetch(u, 0, set()), seen_list):
            if not r:
                continue

            items = r if isinstance(r, list) else [r]

            for item in items:
                if not item:
                    continue

                checksum = item.get("checksum")
                if checksum:
                    if checksum not in seen_grant_checksums:
                        seen_grant_checksums.add(checksum)
                        validated.append(item)
                else:
                    validated.append(item)

                if len(validated) >= max_links:
                    break

            if len(validated) >= max_links:
                break
    # combine results: results from inline blocks + validated detail pages
    results.extend(validated)
    logger.info(f"Validated grant pages / rows: {len(results)}")
    return results


def _format_cell(val, width):
    text = (val or "").replace("\n", " ").strip()
    if len(text) > width:
        return text[: width - 1] + "…"
    return text.ljust(width)


def print_grant_summary(grants, limit=None):
    rows = grants if limit is None else grants[:limit]
    print("\n=== Grant Summary ===")
    header = " | ".join(
        [
            _format_cell("#", 4),
            _format_cell("Title", 34),
            _format_cell("Deadline", 20),
            _format_cell("Agency", 22),
            _format_cell("Amount", 18),
            _format_cell("URL", 54),
        ]
    )
    print(header)
    print("-" * len(header))

    for idx, g in enumerate(rows, 1):
        amount = ""
        mn = g.get("fundingAmountMin")
        mx = g.get("fundingAmountMax")
        cur = g.get("fundingCurrency")
        if mn is not None and mx is not None:
            amount = f"{cur or ''} {mn:g}-{mx:g}".strip()
        elif mn is not None:
            amount = f"{cur or ''} {mn:g}".strip()

        line = " | ".join(
            [
                _format_cell(str(idx), 4),
                _format_cell(g.get("grantTitle") or g.get("title") or "", 34),
                _format_cell(g.get("applicationDeadline") or "", 20),
                _format_cell(g.get("fundingAgency") or "", 22),
                _format_cell(amount, 18),
                _format_cell(g.get("grantUrl") or g.get("url") or "", 54),
            ]
        )
        print(line)


def save_grants_json(grants, output_path=None):
    if not output_path:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = os.path.abspath(f"grants_scrape_{ts}.json")
    else:
        output_path = os.path.abspath(output_path)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(grants, f, indent=2, ensure_ascii=False)

    return output_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Crawl grant opportunities from a website.")
    parser.add_argument("url", nargs="?", help="Listing or detail URL to crawl")
    parser.add_argument("--max-listing", type=int, default=MAX_LISTING_PAGES, help="Maximum listing pages to crawl")
    parser.add_argument("--max-links", type=int, default=MAX_GRANT_LINKS, help="Maximum candidate links to validate")
    parser.add_argument("--max-workers", type=int, default=MAX_WORKERS, help="Parallel workers for detail validation")
    parser.add_argument("--max-depth", type=int, default=MAX_DETAIL_DEPTH, help="Nested listing-to-detail recursion depth")
    parser.add_argument("--driver", default="./chromedriver", help="Path to chromedriver for JS fallback")
    parser.add_argument("--output", default=None, help="Output JSON path")
    parser.add_argument("--show", type=int, default=200, help="Max rows to print in summary")
    args = parser.parse_args()

    if not args.url:
        parser.error("Please provide a website URL, e.g. python -m scrape.scrape https://example.com/grants")

    print(f"Crawling: {args.url}")
    raw_items = crawl_site_for_grants(
        args.url,
        max_listing=args.max_listing,
        max_links=args.max_links,
        max_workers=args.max_workers,
        selenium_driver_path=args.driver,
        max_detail_depth=args.max_depth,
    )
    print(f"Raw scraped items: {len(raw_items)}")

    try:
        from .extractor import extract_grant_items
    except Exception:
        from extractor import extract_grant_items

    grants = extract_grant_items(raw_items)
    print(f"Extracted grants: {len(grants)}")

    print_grant_summary(grants, limit=args.show)
    output_path = save_grants_json(grants, args.output)
    print(f"\nSaved JSON output: {output_path}")