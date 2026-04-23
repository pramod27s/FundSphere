import os
import json
import hashlib
import argparse
import logging
import xml.etree.ElementTree as ET
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
from curl_cffi import requests as cffi_requests

# Import your existing scraper logic
from firecrawl_scraper import scrape_grant, crawl_for_grants

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

STATE_FILE = os.path.join(os.path.dirname(__file__), "scraper_state.json")

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
    """Pass 1: Free extraction to get a fingerprint of the current page text."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    }

    html_content = ""
    try:
        # Fix 2: TLS Impersonation to Bypass Cloudflare
        response = cffi_requests.get(url, headers=headers, impersonate="chrome110", timeout=15)
        if response.status_code == 200:
            html_content = response.text
        else:
            logger.warning(f"curl_cffi failed for {url} with status {response.status_code}. Returning None.")
            return None
    except Exception as e:
        logger.warning(f"Failed to fetch content for hash at {url} using curl_cffi: {e}")
        return None

    def extract_pure_text(html):
        """Fix 1: Content-Only Hashing (No False Positives)"""
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

    # Fix 4: SPA Detection and Playwright Fallback
    if page_text and len(page_text) < 300:
        logger.info(f"Page text length < 300 for {url}. Likely SPA. Invoking Playwright fallback.")
        try:
            from playwright.sync_api import sync_playwright
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                page.goto(url, wait_until="networkidle", timeout=20000)
                html_content = page.content()
                browser.close()

            page_text = extract_pure_text(html_content)
        except Exception as e:
            logger.warning(f"Playwright fallback failed for {url}: {e}")
            return None

    if not page_text:
        return None

    return hashlib.sha256(page_text.encode('utf-8')).hexdigest()

def run_smart_scraper(seed_urls, max_per_seed=8):
    logger.info("[*] Starting Smart Scheduler Two-Pass Scraping...")
    state = load_state()

    candidates = []
    import requests  # For backend POST requests later

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

    # Deduplicate candidate URLs
    candidates = list(dict.fromkeys(candidates))
    logger.info(f"[*] Total unique candidate URLs to check: {len(candidates)}")

    for url in candidates:
        logger.info(f"[*] Checking {url}")
        # 1. Get the free hash (Pass 1)
        current_hash = get_page_hash(url)
        if not current_hash:
            continue

        last_known_hash = state.get(url)

        # 2. State Comparison
        if current_hash != last_known_hash:
            logger.info(f"\n[+] Change detected at {url}! (Tokens will be used...)")

            # 3. The Paid Extractor (Pass 2)
            grant_data = scrape_grant(url)

            # Optional: ensure basic fields are present so we don't push empty dicts
            if grant_data and grant_data.get("grantTitle") and grant_data.get("fundingAgency"):
                import re

                # 1. Convert lists to comma-separated strings for Java backend
                for field in ["eligibleCountries", "eligibleApplicants", "institutionType", "field"]:
                    val = grant_data.get(field)
                    if isinstance(val, list):
                        grant_data[field] = ", ".join(val)
                    elif val is None:
                        grant_data[field] = None

                # 2. Extract numeric amount for Java's BigDecimal and handle Lakhs/Crores
                def parse_amount(val):
                    if not val: return None
                    if isinstance(val, (int, float)): return val

                    s = str(val).lower().replace(',', '')
                    # Look for numbers, optionally with decimals, ignoring lone periods
                    nums = re.findall(r'\d+(?:\.\d+)?', s)
                    if not nums: return None

                    # Double check it parses correctly
                    try:
                        base_val = float(nums[0])
                    except ValueError:
                        return None

                    # Apply multipliers based on Indian and International numbering words
                    if 'lakh' in s or 'lac' in s:
                        base_val *= 100000
                    elif 'crore' in s or re.search(r'\bcr\b', s):
                        base_val *= 10000000
                    elif 'million' in s or re.search(r'\d+\s*m\b', s):
                        base_val *= 1000000
                    elif 'billion' in s or re.search(r'\d+\s*b\b', s):
                        base_val *= 1000000000
                    elif re.search(r'\d+\s*k\b', s):
                        base_val *= 1000

                    return base_val

                grant_data["fundingAmountMin"] = parse_amount(grant_data.get("fundingAmountMin"))
                grant_data["fundingAmountMax"] = parse_amount(grant_data.get("fundingAmountMax"))

                # 3. Handle applicationDeadline - Java expects LocalDateTime "yyyy-MM-dd'T'HH:mm:ss"
                deadline = grant_data.get("applicationDeadline")
                if not deadline or "Not Specified" in str(deadline):
                     grant_data["applicationDeadline"] = None
                else:
                     deadline_str = str(deadline).strip()
                     # If it looks like a valid YYYY-MM-DD but misses time, append time
                     if re.match(r"^\d{4}-\d{2}-\d{2}$", deadline_str):
                         grant_data["applicationDeadline"] = f"{deadline_str}T23:59:59"
                     elif "T" not in deadline_str:
                         grant_data["applicationDeadline"] = None

                # 4. Handle grantUrl missing mapping
                if not grant_data.get("grantUrl"):
                     grant_data["grantUrl"] = url

                # 5. Clean up the payload so Spring Boot's Jackson doesn't throw UnrecognizedPropertyException
                expected_keys = {
                    "grantTitle", "fundingAgency", "programName", "description",
                    "grantUrl", "applicationDeadline", "fundingAmountMin",
                    "fundingAmountMax", "fundingCurrency", "eligibleCountries",
                    "eligibleApplicants", "institutionType", "field",
                    "applicationLink", "checksum", "tags"
                }

                clean_payload = {k: v for k, v in grant_data.items() if k in expected_keys}

                # Push `clean_payload` to your CoreBackend API
                try:
                    response = requests.post(
                        "http://localhost:8080/api/grants",
                        json=clean_payload,
                        headers={"Content-Type": "application/json"}
                    )
                    if response.status_code in [200, 201]:
                        logger.info(f"    -> Successfully PUSHED grant '{grant_data['grantTitle']}' to backend (Status: {response.status_code})")

                        # Only update state hash if we successfully scraped AND pushed to backend!
                        state[url] = current_hash
                        save_state(state)
                    else:
                        logger.error(f"    -> Backend error {response.status_code} for {url}: {response.text}")
                except Exception as e:
                    logger.error(f"    -> Failed to communicate with backend at http://localhost:8080: {e}")
            else:
                logger.warning(f"    -> Firecrawl extraction didn't return valid grant fields for {url}. State untouched.")
        else:
            logger.info(f"[-] No changes at {url} - Skipping Firecrawl.")

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

