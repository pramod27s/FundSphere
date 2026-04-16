import os
import json
import hashlib
import requests
import argparse
from bs4 import BeautifulSoup

# Import your existing scraper logic
from firecrawl_scraper import scrape_grant, crawl_for_grants

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

def get_page_hash(url):
    """Pass 1: Free extraction to get a fingerprint of the current page text."""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
        }
        # A quick standard GET request (costs nothing)
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        # Extract just the text to avoid changing HTML metadata/timestamps/ads
        page_text = soup.get_text(separator=' ', strip=True)
        return hashlib.sha256(page_text.encode('utf-8')).hexdigest()
    except Exception as e:
        print(f"Failed to fetch content for hash at {url}: {e}")
        return None

def run_smart_scraper(seed_urls, max_per_seed=8):
    print("[*] Starting Smart Scheduler Two-Pass Scraping...")
    state = load_state()

    candidates = []
    for seed in seed_urls:
        print(f"[*] Crawling seed URL: {seed}")
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
    print(f"[*] Total unique candidate URLs to check: {len(candidates)}")

    for url in candidates:
        # 1. Get the free hash (Pass 1)
        current_hash = get_page_hash(url)
        if not current_hash:
            continue

        last_known_hash = state.get(url)

        # 2. State Comparison
        if current_hash != last_known_hash:
            print(f"\n[+] Change detected at {url}! (Tokens will be used...)")

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
                        print(f"    -> Successfully PUSHED grant '{grant_data['grantTitle']}' to backend (Status: {response.status_code})")

                        # Only update state hash if we successfully scraped AND pushed to backend!
                        state[url] = current_hash
                        save_state(state)
                    else:
                        print(f"    -> Backend error {response.status_code} for {url}: {response.text}")
                except Exception as e:
                    print(f"    -> Failed to communicate with backend at http://localhost:8080: {e}")
            else:
                print(f"    -> Firecrawl extraction didn't return valid grant fields for {url}. State untouched.")
        else:
            print(f"[-] No changes at {url} - Skipping Firecrawl.")

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

