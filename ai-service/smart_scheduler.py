import os
import re
import json
import hashlib
import argparse
import logging
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from urllib.parse import urlparse, urljoin
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup
from curl_cffi import requests as cffi_requests
from dateutil import parser as date_parser
from dotenv import load_dotenv

load_dotenv()

# Import your existing scraper logic
from firecrawl_scraper import scrape_grant, crawl_for_grants

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

STATE_FILE = os.path.join(os.path.dirname(__file__), "scraper_state.json")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")
RESPECT_ROBOTS = os.getenv("RESPECT_ROBOTS", "true").strip().lower() not in ("false", "0", "no")
SCRAPER_USER_AGENT = os.getenv(
    "SCRAPER_USER_AGENT",
    "FundSphereScraper/1.0 (+https://fundsphere.local; grant-discovery)",
)

_backend_alive_cache: dict[str, float] = {}
_BACKEND_ALIVE_TTL_SECONDS = 60

# Politeness: minimum seconds between requests to the SAME domain. A site's
# robots.txt Crawl-delay (when present) overrides this upward.
CRAWL_DELAY_SECONDS = float(os.getenv("CRAWL_DELAY_SECONDS", "1.0"))
_last_request_at: dict[str, float] = {}

# SPA fallback: when a page exposes too little static text to hash, optionally
# render it with a headless browser (Selenium) so JS-built grant pages aren't
# silently skipped. Degrades gracefully to the old "skip" behaviour if Selenium
# or a browser driver isn't available.
SPA_RENDER_FALLBACK = os.getenv("SPA_RENDER_FALLBACK", "true").strip().lower() not in ("false", "0", "no")

# Where per-run summaries are appended for lightweight observability.
RUNS_FILE = os.path.join(os.path.dirname(__file__), "scraper_runs.json")
_MAX_PERSISTED_RUNS = int(os.getenv("SCRAPER_MAX_PERSISTED_RUNS", "50"))

# Deadline strings that mean "no concrete date" — never coerce these to a date.
_NON_DATE_DEADLINES = {"null", "none", "n/a", "na", "tba", "tbd", "rolling", "ongoing", "open", "various"}

# Indian + international magnitude words → multiplier.
_AMOUNT_MULTIPLIER_PATTERNS = [
    (re.compile(r"\b(?:lakh|lac|lakhs)\b"), 100_000),
    (re.compile(r"\b(?:crore|cr)\b"), 10_000_000),
    (re.compile(r"\b(?:million|mn)\b|\d+\s*m\b"), 1_000_000),
    (re.compile(r"\b(?:billion|bn)\b|\d+\s*b\b"), 1_000_000_000),
    (re.compile(r"\d+\s*k\b|\bthousand\b"), 1_000),
]


def _parse_amount(val, prefer: str = "min"):
    """Parse a funding-amount string into a float.

    Handles:
      - thousands separators ("$1,250,000")
      - magnitude words ("10 lakh", "1.5 crore", "$5M", "200k")
      - ranges ("between 5 and 10 lakhs", "$10,000 - $50,000") — returns the
        lower bound for prefer="min" and the upper bound for prefer="max"
        (the old code grabbed the first number for both, so "5 to 10 lakh"
        scored as 5 lakh max).

    Returns None when no number can be found.
    """
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)

    s = str(val).lower().replace(",", "")
    nums = re.findall(r"\d+(?:\.\d+)?", s)
    if not nums:
        return None
    try:
        values = [float(n) for n in nums]
    except ValueError:
        return None

    multiplier = 1
    for pattern, mult in _AMOUNT_MULTIPLIER_PATTERNS:
        if pattern.search(s):
            multiplier = mult
            break
    values = [v * multiplier for v in values]

    return min(values) if prefer == "min" else max(values)


_TRUE_WORDS = {"true", "yes", "required", "mandatory", "1"}
_FALSE_WORDS = {"false", "no", "not required", "optional", "0"}


def _coerce_bool(val):
    """Normalize Firecrawl's requiresPhd into True/False/None. Models sometimes
    return strings ('yes', 'required') instead of a JSON boolean."""
    if val is None or isinstance(val, bool):
        return val
    s = str(val).strip().lower()
    if s in _TRUE_WORDS:
        return True
    if s in _FALSE_WORDS:
        return False
    return None


def _coerce_years(val):
    """Normalize minExperienceYears into an int, tolerating '3 years' style
    strings. Returns None when no number is present."""
    if val is None:
        return None
    if isinstance(val, bool):
        return None
    if isinstance(val, (int, float)):
        return int(val)
    m = re.search(r"\d+", str(val))
    return int(m.group()) if m else None


def _normalize_deadline(val):
    """Parse an arbitrary deadline string into 'YYYY-MM-DDTHH:MM:SS' (no tz),
    matching Java's LocalDateTime format, or None if not confidently a date.

    The old code only accepted a literal 'YYYY-MM-DD' and dropped everything
    else, so common formats like 'March 15, 2026' or '15/03/2026' were lost.
    We now parse fuzzily but require a 4-digit year so dateutil can't invent a
    date from a bare 'Friday' or a lone day number.
    """
    if val is None:
        return None
    s = str(val).strip()
    if not s or s.lower() in _NON_DATE_DEADLINES or "not specified" in s.lower():
        return None
    if not re.search(r"(?:19|20)\d{2}", s):
        return None
    try:
        # default supplies end-of-day for date-only strings, so a same-day
        # deadline isn't treated as already expired at midnight.
        dt = date_parser.parse(s, fuzzy=True, default=datetime(2000, 1, 1, 23, 59, 59))
    except (ValueError, OverflowError, TypeError):
        return None
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


def _throttle(url: str) -> None:
    """Sleep just enough to honour the per-domain crawl delay before hitting a
    host again. Keeps us a polite crawler and avoids tripping rate limits."""
    host = (urlparse(url).netloc or "").lower()
    if not host:
        return
    delay = CRAWL_DELAY_SECONDS
    rp = _get_robots_for(url)
    if rp is not None:
        try:
            robots_delay = rp.crawl_delay(SCRAPER_USER_AGENT)
            if robots_delay:
                delay = max(delay, float(robots_delay))
        except Exception:
            pass
    last = _last_request_at.get(host)
    if last is not None:
        wait = delay - (time.time() - last)
        if wait > 0:
            time.sleep(wait)
    _last_request_at[host] = time.time()


def _render_text_with_selenium(url: str) -> str | None:
    """Headless-browser fetch for JS-rendered pages. Returns visible text, or
    None on any failure (no Selenium, no driver, timeout). Never raises."""
    driver = None
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options

        opts = Options()
        opts.add_argument("--headless=new")
        opts.add_argument("--disable-gpu")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument(f"--user-agent={SCRAPER_USER_AGENT}")

        driver = webdriver.Chrome(options=opts)
        driver.set_page_load_timeout(30)
        driver.get(url)
        # Brief settle for late-rendering content.
        time.sleep(2)
        html = driver.page_source or ""
    except Exception as exc:
        logger.warning(f"Selenium render failed for {url}: {exc} (SPA page will be skipped).")
        return None
    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass

    soup = BeautifulSoup(html, "html.parser")
    target = soup.find("main") or soup.find("body") or soup
    for tag in target(["script", "style", "footer", "nav", "header"]):
        tag.decompose()
    return target.get_text(separator=" ", strip=True)


def fetch_all_grant_urls() -> list[str]:
    """Pull every grant URL already in CoreBackend.

    Used so the scheduler can hash-check + verify each existing grant — not
    just the URLs it freshly discovers from seed pages. Without this, grants
    whose source seed no longer links to them never get their `lastVerifiedAt`
    badge refreshed.

    Costs zero Firecrawl tokens: the per-URL flow is just an HTML fetch + a
    SHA-256 compare; only changed URLs trigger paid extraction.
    """
    try:
        response = requests.get(f"{BACKEND_URL}/api/grants/urls", timeout=15)
        if response.status_code != 200:
            logger.warning(
                f"/api/grants/urls returned {response.status_code}; "
                f"skipping DB-wide verify sweep."
            )
            return []
        data = response.json()
        if not isinstance(data, list):
            logger.warning(f"/api/grants/urls returned non-list payload; skipping.")
            return []
        return [u for u in data if isinstance(u, str) and u.strip()]
    except Exception as exc:
        logger.warning(f"Failed to fetch grant URLs from backend: {exc}")
        return []


def is_backend_alive(force: bool = False) -> bool:
    """Cheap probe to verify CoreBackend is reachable before spending Firecrawl tokens.

    Any HTTP response (including 401/403/404) means the server is up. Only
    connection-level failures (refused/timeout/DNS) are treated as down.
    Result is cached briefly so per-URL re-checks don't hammer the backend.
    """
    now = time.time()
    if not force:
        cached_at = _backend_alive_cache.get(BACKEND_URL)
        if cached_at and (now - cached_at) < _BACKEND_ALIVE_TTL_SECONDS:
            return True

    try:
        response = requests.get(f"{BACKEND_URL}/api/grants", timeout=5)
        _ = response.status_code  # any response = alive
        _backend_alive_cache[BACKEND_URL] = now
        return True
    except requests.exceptions.RequestException as exc:
        logger.error(f"Backend health probe failed for {BACKEND_URL}: {exc}")
        _backend_alive_cache.pop(BACKEND_URL, None)
        return False


def load_state():
    """Load the last known hashes for URLs."""
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_state(state):
    """Save the updated hashes for URLs."""
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def persist_run_summary(summary: dict) -> None:
    """Append this run's summary to RUNS_FILE (capped, newest last) so scraper
    health is inspectable without scraping logs. Best-effort; never raises."""
    try:
        history = []
        if os.path.exists(RUNS_FILE):
            try:
                with open(RUNS_FILE, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                if isinstance(loaded, list):
                    history = loaded
            except Exception:
                history = []
        # Drop the verbose seeds list to keep the file compact; keep errors tail.
        compact = {k: v for k, v in summary.items() if k != "seeds"}
        history.append(compact)
        history = history[-_MAX_PERSISTED_RUNS:]
        with open(RUNS_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)
    except Exception as exc:
        logger.warning(f"Could not persist run summary: {exc}")


# --- robots.txt -------------------------------------------------------------
# Per-domain cache. Fail-open: if robots.txt is unreachable / unparseable, we
# allow the URL — same posture as most major crawlers when the file is missing.
# Disabled by env var RESPECT_ROBOTS=false for testing or sites that incorrectly
# block well-behaved bots.
_robots_cache: dict[str, RobotFileParser | None] = {}


def _get_robots_for(url: str) -> RobotFileParser | None:
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return None
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin in _robots_cache:
        return _robots_cache[origin]

    rp = RobotFileParser()
    rp.set_url(f"{origin}/robots.txt")
    try:
        # Use curl_cffi here too — many sites Cloudflare-protect even robots.txt.
        response = cffi_requests.get(
            f"{origin}/robots.txt",
            headers={"User-Agent": SCRAPER_USER_AGENT},
            impersonate="chrome110",
            timeout=8,
        )
        if response.status_code == 200 and response.text:
            rp.parse(response.text.splitlines())
            _robots_cache[origin] = rp
            return rp
    except Exception as exc:
        logger.debug(f"robots.txt fetch failed for {origin}: {exc} (fail-open)")

    # Treat unreachable / non-200 as "no rules" (fail-open).
    _robots_cache[origin] = None
    return None


def is_url_allowed(url: str) -> bool:
    """Soft robots.txt check. Returns True if scraping is allowed (or unknown)."""
    if not RESPECT_ROBOTS:
        return True
    rp = _get_robots_for(url)
    if rp is None:
        return True  # fail-open
    try:
        return rp.can_fetch(SCRAPER_USER_AGENT, url)
    except Exception:
        return True  # fail-open on parser quirks


def discover_urls_from_sitemap(base_url):
    """
    Fix 3 - Auto-Discovery via Sitemap / RSS Parsing
    """
    logger.info(f"Attempting auto-discovery for {base_url} via sitemap/RSS...")
    parsed = urlparse(base_url)
    root_url = f"{parsed.scheme}://{parsed.netloc}"
    keywords = ["grant", "fellowship", "funding", "award", "scheme"]
    discovered = set()

    paths_to_check = ["/sitemap.xml", "/sitemap_index.xml", "/feed", "/rss.xml"]

    for path in paths_to_check:
        url_to_check = urljoin(root_url, path)
        try:
            response = cffi_requests.get(url_to_check, impersonate="chrome110", timeout=10)
            if response.status_code != 200:
                continue

            try:
                # Parse XML content
                root = ET.fromstring(response.content)
                for elem in root.iter():
                    tag = elem.tag.lower()
                    if "loc" in tag or "link" in tag:
                        link_url = elem.text
                        if link_url and isinstance(link_url, str):
                            link_url_lower = link_url.lower()
                            if any(k in link_url_lower for k in keywords):
                                discovered.add(link_url.strip())
            except ET.ParseError:
                pass
        except Exception as e:
            logger.warning(f"Failed to fetch or parse {url_to_check}: {e}")

    return list(discovered)

def get_page_hash(url):
    """Pass 1: Free extraction to get a fingerprint of the current page text.

    For PDF URLs we hash the raw bytes (HTML text-extraction would mangle
    them and produce an unstable hash). For HTML pages we extract a
    content-only fingerprint so chrome/footer/nav noise doesn't trigger
    false-positive change detections.
    """
    headers = {
        "User-Agent": SCRAPER_USER_AGENT,
    }

    try:
        # Fix 2: TLS Impersonation to Bypass Cloudflare
        response = cffi_requests.get(url, headers=headers, impersonate="chrome110", timeout=15)
        if response.status_code != 200:
            logger.warning(f"curl_cffi failed for {url} with status {response.status_code}. Returning None.")
            return None
    except Exception as e:
        logger.warning(f"Failed to fetch content for hash at {url} using curl_cffi: {e}")
        return None

    content_type = (response.headers.get("Content-Type") or "").lower()
    is_pdf = "application/pdf" in content_type or url.lower().endswith(".pdf")

    if is_pdf:
        body = response.content
        if not body:
            return None
        return hashlib.sha256(body).hexdigest()

    html_content = response.text or ""

    def extract_pure_text(html):
        """Content-Only Hashing (No False Positives)."""
        soup = BeautifulSoup(html, "html.parser")

        target = soup.find("main")
        if not target:
            target = soup.find("body")
        if not target:
            target = soup

        for tag in target(["script", "style", "footer", "nav", "header"]):
            tag.decompose()

        return target.get_text(separator=' ', strip=True)

    page_text = extract_pure_text(html_content)

    # SPA pages expose too little static text to hash reliably. Before giving
    # up (which used to silently skip JS-rendered grant pages forever), try a
    # headless-browser render so the page still gets monitored + scraped.
    if not page_text or len(page_text) < 300:
        if SPA_RENDER_FALLBACK:
            logger.info(f"Static text thin for {url} ({len(page_text or '')} chars); trying headless render...")
            rendered = _render_text_with_selenium(url)
            if rendered and len(rendered) >= 300:
                return hashlib.sha256(rendered.encode("utf-8")).hexdigest()
        logger.info(f"Page {url} is unhashable (insufficient text after fallback).")
        return None

    return hashlib.sha256(page_text.encode('utf-8')).hexdigest()

def run_smart_scraper(seed_urls, max_per_seed=8):
    started_at = time.time()
    logger.info("[*] Starting Smart Scheduler Two-Pass Scraping...")

    summary = {
        "started_at": started_at,
        "seeds": list(seed_urls),
        "candidates_total": 0,
        "candidates_from_seeds": 0,
        "candidates_from_db_sweep": 0,
        "robots_blocked": 0,
        "unhashable": 0,
        "unchanged": 0,
        "changed": 0,
        "extraction_failed": 0,
        "extraction_invalid": 0,
        "pushed_to_backend": 0,
        "backend_errors": 0,
        "skipped_backend_down": 0,
        "aborted": False,
        "errors": [],   # capped tail of per-URL error strings for debugging
    }

    # Pre-flight: refuse to run if CoreBackend is unreachable. Without this,
    # a change-detection would still call Firecrawl (burning paid tokens) and
    # then fail to push — and because state isn't saved on push failure, the
    # next run would detect the same "change" and burn tokens again.
    if not is_backend_alive(force=True):
        summary["aborted"] = True
        summary["finished_at"] = time.time()
        summary["duration_seconds"] = round(summary["finished_at"] - summary["started_at"], 2)
        logger.error(
            f"[!] CoreBackend at {BACKEND_URL} is not reachable. "
            f"Aborting run before any Firecrawl tokens are spent."
        )
        persist_run_summary(summary)
        return summary

    state = load_state()

    def _record_error(url: str, message: str) -> None:
        if len(summary["errors"]) < 25:
            summary["errors"].append(f"{url} :: {message}")

    candidates = []

    for seed in seed_urls:
        logger.info(f"[*] Crawling seed URL: {seed}")

        # Fix 3: Run auto-discovery first
        discovered_urls = discover_urls_from_sitemap(seed)
        for d_url in discovered_urls:
            if d_url not in state:
                logger.info(f"    -> Found new URL via auto-discovery: {d_url}")
                candidates.append(d_url)

        # If it's a known list/category page, discover child grants using your existing crawler logic
        if seed.count("/") <= 3 or "/type/" in seed.lower() or "/industry/" in seed.lower() or "page" in seed.lower():
            discovered = crawl_for_grants(seed, max_required=max_per_seed)
            if discovered:
                candidates.extend(discovered)
            else:
                candidates.append(seed)
        else:
            candidates.append(seed)

    # Track seed-derived candidates separately for the summary
    summary["candidates_from_seeds"] = len(set(candidates))

    # DB-wide verify sweep: pull every grant URL already in CoreBackend and
    # add them to the candidate set. Ensures the "Verified X ago" badge stays
    # fresh for grants whose source seed no longer links to them. Costs zero
    # Firecrawl tokens (only HTML hash-fetches + the cheap /verify endpoint
    # for unchanged URLs).
    db_urls = fetch_all_grant_urls()
    seed_set = set(candidates)
    new_from_db = [u for u in db_urls if u not in seed_set]
    summary["candidates_from_db_sweep"] = len(new_from_db)
    if new_from_db:
        logger.info(
            f"[*] DB sweep added {len(new_from_db)} grant URLs already in the "
            f"database (will hash-check + verify)."
        )
        candidates.extend(new_from_db)

    # Deduplicate candidate URLs
    candidates = list(dict.fromkeys(candidates))
    summary["candidates_total"] = len(candidates)
    logger.info(f"[*] Total unique candidate URLs to check: {len(candidates)}")

    for url in candidates:
        logger.info(f"[*] Checking {url}")

        # 0. Soft robots.txt check before any network work on this URL.
        if not is_url_allowed(url):
            summary["robots_blocked"] += 1
            logger.warning(f"    -> robots.txt disallows {url} for our user-agent. Skipping.")
            continue

        # 0.5 Politeness: honour per-domain crawl delay (and robots Crawl-delay).
        _throttle(url)

        # 1. Get the free hash (Pass 1)
        current_hash = get_page_hash(url)
        if not current_hash:
            summary["unhashable"] += 1
            continue

        last_known_hash = state.get(url)

        # 2. State Comparison
        if current_hash != last_known_hash:
            summary["changed"] += 1
            logger.info(f"\n[+] Change detected at {url}! (Tokens will be used...)")

            # Re-verify backend is still reachable before spending Firecrawl
            # tokens. If it died mid-run, a successful extraction would just
            # fail to push and waste the token on the next run too.
            if not is_backend_alive():
                summary["skipped_backend_down"] += 1
                _record_error(url, "Backend went down mid-run; skipped Firecrawl call to preserve tokens")
                logger.error(f"    -> Backend unreachable; skipping Firecrawl extraction for {url}.")
                continue

            # 3. The Paid Extractor (Pass 2)
            grant_data = scrape_grant(url)
            if not grant_data:
                summary["extraction_failed"] += 1
                _record_error(url, "Firecrawl extraction returned None (transport / 4xx / 5xx exhausted)")

            # Optional: ensure basic fields are present so we don't push empty dicts
            if grant_data and grant_data.get("grantTitle") and grant_data.get("fundingAgency"):
                # 1. Convert lists to comma-separated strings for Java backend
                for field in ["eligibleCountries", "eligibleApplicants", "institutionType", "field", "researchThemes", "citizenshipRequired", "targetCareerStages"]:
                    val = grant_data.get(field)
                    if isinstance(val, list):
                        grant_data[field] = ", ".join(str(v) for v in val)
                    elif val is None:
                        grant_data[field] = None

                # 2. Numeric funding amounts for Java's BigDecimal. Range-aware:
                #    the min field keeps the low bound, the max field the high.
                grant_data["fundingAmountMin"] = _parse_amount(grant_data.get("fundingAmountMin"), prefer="min")
                grant_data["fundingAmountMax"] = _parse_amount(grant_data.get("fundingAmountMax"), prefer="max")

                # 3. Dates → Java LocalDateTime "yyyy-MM-dd'T'HH:mm:ss".
                #    Accepts free-form dates ("March 15, 2026", "15/03/2026").
                for date_field in ("applicationDeadline", "openingDate", "loiDeadline",
                                   "decisionDate", "projectStartDate"):
                    grant_data[date_field] = _normalize_deadline(grant_data.get(date_field))

                # 4. Structured eligibility constraints (drive the recommender's
                #    hard-filter guards). Coerce loose model output to clean types.
                grant_data["requiresPhd"] = _coerce_bool(grant_data.get("requiresPhd"))
                grant_data["minExperienceYears"] = _coerce_years(grant_data.get("minExperienceYears"))

                # 5. Handle grantUrl missing mapping
                if not grant_data.get("grantUrl"):
                     grant_data["grantUrl"] = url

                # 6. Clean up the payload so Spring Boot's Jackson doesn't throw UnrecognizedPropertyException
                expected_keys = {
                    "grantTitle", "fundingAgency", "programName", "description",
                    "grantUrl", "applicationDeadline", "fundingAmountMin",
                    "fundingAmountMax", "fundingCurrency", "eligibleCountries",
                    "eligibleApplicants", "institutionType", "field",
                    "applicationLink", "checksum", "tags",
                    "objectives", "fundingScope", "eligibilityCriteria",
                    "selectionCriteria", "grantDuration", "researchThemes",
                    "requiresPhd", "minExperienceYears", "citizenshipRequired",
                    "grantType", "targetCareerStages",
                    "openingDate", "loiDeadline", "decisionDate", "projectStartDate"
                }

                clean_payload = {k: v for k, v in grant_data.items() if k in expected_keys}

                # Push `clean_payload` to your CoreBackend API
                try:
                    response = requests.post(
                        f"{BACKEND_URL}/api/grants",
                        json=clean_payload,
                        headers={"Content-Type": "application/json"},
                        timeout=30,
                    )
                    if response.status_code in [200, 201]:
                        summary["pushed_to_backend"] += 1
                        logger.info(f"    -> Successfully PUSHED grant '{grant_data['grantTitle']}' to backend (Status: {response.status_code})")

                        # Only update state hash if we successfully scraped AND pushed to backend!
                        state[url] = current_hash
                        save_state(state)
                    else:
                        summary["backend_errors"] += 1
                        _record_error(url, f"Backend {response.status_code}: {response.text[:200]}")
                        logger.error(f"    -> Backend error {response.status_code} for {url}: {response.text}")
                except Exception as e:
                    summary["backend_errors"] += 1
                    _record_error(url, f"Backend transport error: {e}")
                    logger.error(f"    -> Failed to communicate with backend at {BACKEND_URL}: {e}")
            elif grant_data:
                summary["extraction_invalid"] += 1
                _record_error(url, f"Missing required fields. Got: title={grant_data.get('grantTitle')!r}, agency={grant_data.get('fundingAgency')!r}")
                logger.warning(f"    -> Firecrawl extraction didn't return valid grant fields for {url}. State untouched.")
        else:
            summary["unchanged"] += 1
            logger.info(f"[-] No changes at {url} - Skipping Firecrawl.")
            # Even though content is unchanged, we DID just visit the page —
            # bump the grant's lastVerifiedAt so the "Verified X ago" badge
            # in the UI stays fresh. Cheap call (no Firecrawl, no Pinecone).
            try:
                resp = requests.post(
                    f"{BACKEND_URL}/api/grants/verify",
                    json={"grantUrl": url},
                    headers={"Content-Type": "application/json"},
                    timeout=10,
                )
                if resp.status_code == 200:
                    summary.setdefault("verified_unchanged", 0)
                    summary["verified_unchanged"] += 1
                elif resp.status_code == 404:
                    # Grant URL not in our DB yet — silent, nothing to verify.
                    pass
                else:
                    logger.warning(
                        f"    -> verify endpoint returned {resp.status_code} for {url}"
                    )
            except Exception as exc:
                logger.warning(f"    -> verify endpoint call failed for {url}: {exc}")

    # --- final run summary -------------------------------------------------
    summary["finished_at"] = time.time()
    summary["duration_seconds"] = round(summary["finished_at"] - summary["started_at"], 2)
    logger.info("=" * 60)
    logger.info("SCRAPER RUN SUMMARY")
    logger.info("=" * 60)
    logger.info(json.dumps(
        {k: v for k, v in summary.items() if k not in {"errors", "seeds"}},
        indent=2,
    ))
    if summary["errors"]:
        logger.info("First %d errors:", len(summary["errors"]))
        for err in summary["errors"]:
            logger.info("  - %s", err)
    logger.info("=" * 60)
    persist_run_summary(summary)
    return summary

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Smart Scheduled Scraper to minimize Firecrawl token usage.")
    parser.add_argument("--urls", "-u", nargs="+", default=[
        # Default seeds you can crawl
        "https://www.startupgrantsindia.com/",
        "https://serb.gov.in/page/english/research_grants",
        "https://www.indiascienceandtechnology.gov.in/funding-opportunities/grants-for-conference-seminars",
        "https://fundsforcompanies.fundsforngos.org/area/latest-grants-and-resources-for-artificial-intelligence/"
    ], help="Seed URLs to crawl and monitor")
    parser.add_argument("--max", "-m", type=int, default=8, help="Max items per seed URL")

    args = parser.parse_args()

    run_smart_scraper(args.urls, max_per_seed=args.max)
