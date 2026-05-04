import os
import requests
import json
import uuid
import hashlib
import logging
import random
import time
from datetime import datetime
import sys

from dotenv import load_dotenv

load_dotenv()

# Force UTF-8 for output to avoid charmap codec errors in Windows terminals
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

logger = logging.getLogger(__name__)

FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY", "")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")

# Firecrawl can fail transiently (504, 502, connection reset, timeout). We retry
# only on those — never on 4xx, which are deterministic client errors that won't
# improve with another attempt.
FIRECRAWL_MAX_RETRIES = int(os.getenv("FIRECRAWL_MAX_RETRIES", "3"))
FIRECRAWL_BACKOFF_BASE = float(os.getenv("FIRECRAWL_BACKOFF_BASE", "1.0"))
FIRECRAWL_TIMEOUT_SECONDS = int(os.getenv("FIRECRAWL_TIMEOUT_SECONDS", "60"))


def _require_firecrawl_key() -> str:
    if not FIRECRAWL_API_KEY:
        raise RuntimeError("FIRECRAWL_API_KEY env var must be set to call Firecrawl")
    return FIRECRAWL_API_KEY


def _fetch_html(url: str, timeout: int = 15) -> str | None:
    """Lightweight HTML fetch for the local crawler.

    Replaces the previous `from scrape.scrape import fetch, fetch_selenium`
    dependency (that module didn't exist in the repo, so the crawler was
    silently returning zero candidates). Uses curl_cffi for TLS impersonation
    so Cloudflare-protected pages still work, with a plain-requests fallback
    if curl_cffi is unavailable.

    Returns the HTML body on success, None on any failure (caller decides).
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    try:
        from curl_cffi import requests as cffi_requests
        response = cffi_requests.get(
            url, headers=headers, impersonate="chrome120", timeout=timeout
        )
        if 200 <= response.status_code < 300 and response.text:
            return response.text
        logger.warning("curl_cffi fetch %s returned status %s", url, response.status_code)
    except Exception as exc:
        logger.warning("curl_cffi fetch failed for %s: %s", url, exc)

    # Last-resort fallback: plain requests. Some hosts will refuse without TLS
    # impersonation, but for hosts that don't care it's good enough.
    try:
        response = requests.get(url, headers=headers, timeout=timeout)
        if response.status_code == 200 and response.text:
            return response.text
    except Exception as exc:
        logger.warning("plain requests fetch failed for %s: %s", url, exc)

    return None

# The schema definition we want Firecrawl to strictly extract for us
GRANT_SCHEMA = {
    "type": "object",
    "properties": {
        "grantTitle": {"type": "string", "description": "Title of the grant or fellowship"},
        "fundingAgency": {"type": "string", "description": "The organization providing the funding"},
        "programName": {"type": ["string", "null"], "description": "Specific program name, if applicable"},
        "description": {
            "type": "string",
            "description": "A detailed 4-6 sentence summary covering: core objective, type of research/project funded, intended impact, and any unique aspects. Never 1-2 sentences."
        },
        "applicationDeadline": {"type": ["string", "null"], "description": "Deadline in ISO format if possible, else text. Return null if not strictly found."},
        "fundingAmountMin": {"type": ["string", "null"], "description": "Minimum funding amount. Must extract if present (e.g. '$10,000', '10 Lakhs', 'Rs. 10,00,000')."},
        "fundingAmountMax": {"type": ["string", "null"], "description": "Maximum funding amount. Must extract if present (e.g. '$50,000', '50 Lakhs', '80 lakh', '50%'). Look for limits, caps, per month/year budgets, or percentages."},
        "fundingCurrency": {"type": ["string", "null"]},
        "eligibleCountries": {"type": "array", "items": {"type": "string"}, "description": "Array of country names. Keep concise."},
        "eligibleApplicants": {"type": "array", "items": {"type": "string"}, "description": "Applicant types including degrees (e.g. PhD, MS, B.Tech) and positions (e.g. Postdoc, Researcher, Student, Faculty, Startup). Keep concise."},
        "institutionType": {"type": "array", "items": {"type": "string"}, "description": "e.g. Government, Private, Startup. Keep concise."},
        "field": {"type": "array", "items": {"type": "string"}, "description": "e.g. AI, Healthcare, Biotechnology"},
        "applicationLink": {"type": ["string", "null"], "description": "Direct URL or mailto link to apply"},
        "tags": {"type": "array", "items": {"type": "string"}, "description": "Keywords related to this grant"},

        # --- NEW SEMANTIC RAG FIELDS ---
        # Improves RAG by matching exact stated goals against user queries
        "objectives": {"type": ["string", "null"], "description": "Full stated objectives or goals of the grant program, closely paraphrased or copied from the page text."},
        # Improves RAG by filtering out irrelevant queries based on allowed use of funds
        "fundingScope": {"type": ["string", "null"], "description": "What expenses or activities the grant covers or excludes — e.g., equipment, salaries, travel, overheads, conference attendance, prototype development, indirect costs."},
        # Improves RAG by ensuring user constraints (e.g. nationality, degree) match exact rules
        "eligibilityCriteria": {"type": ["string", "null"], "description": "ALL detailed eligibility rules — degree level, nationality, institution type, age limits, prior publication requirements, co-PI conditions, industry collaboration requirements."},
        # Improves RAG by letting users search for grants prioritizing specific values (e.g. 'societal impact')
        "selectionCriteria": {"type": ["string", "null"], "description": "How applications are evaluated — scientific merit, innovation, societal impact, panel review process, scoring rubric if mentioned."},
        # Improves RAG by allowing length-based matching if specified
        "grantDuration": {"type": ["string", "null"], "description": "Duration of the funded project e.g. '1 year', '3 years', 'up to 36 months'."},
        # Improves RAG by providing dense, high-value keyword targets for vector search instead of broad domains
        "researchThemes": {"type": ["array", "null"], "items": {"type": "string"}, "description": "Specific research sub-domains and focus areas — prefer granular themes like 'Computer Vision for Agriculture' or 'Rural Healthcare AI' over broad terms like just 'AI' or 'Healthcare'."}
    },
    "required": ["grantTitle", "fundingAgency", "description"]
}

def _firecrawl_post(url: str, payload: dict) -> requests.Response | None:
    """POST to Firecrawl with bounded retries on transient failures.

    Retries on:
      - 5xx responses (server errors are usually transient)
      - 429 rate-limit (with the Retry-After hint when provided)
      - Connection errors / read timeouts
    Does NOT retry on 4xx (other than 429) — those are deterministic and
    won't improve with another attempt.

    Returns the final Response (success or non-retryable failure) or None
    if all retries were exhausted with transport errors.
    """
    headers = {
        "Authorization": f"Bearer {_require_firecrawl_key()}",
        "Content-Type": "application/json",
    }

    last_exc: Exception | None = None
    for attempt in range(1, FIRECRAWL_MAX_RETRIES + 1):
        try:
            response = requests.post(
                "https://api.firecrawl.dev/v1/scrape",
                headers=headers,
                json=payload,
                timeout=FIRECRAWL_TIMEOUT_SECONDS,
            )
        except (requests.ConnectionError, requests.Timeout) as exc:
            last_exc = exc
            sleep_for = _backoff_seconds(attempt)
            print(f"[!] Firecrawl transport error (attempt {attempt}/{FIRECRAWL_MAX_RETRIES}): {exc}. Retrying in {sleep_for:.1f}s...")
            time.sleep(sleep_for)
            continue

        if response.status_code < 500 and response.status_code != 429:
            # Either success or a deterministic 4xx — return as-is.
            return response

        # Retryable: 5xx or 429.
        if response.status_code == 429:
            retry_after = _parse_retry_after(response.headers.get("Retry-After"))
            sleep_for = retry_after if retry_after is not None else _backoff_seconds(attempt)
            print(f"[!] Firecrawl rate-limited (attempt {attempt}/{FIRECRAWL_MAX_RETRIES}). Sleeping {sleep_for:.1f}s...")
        else:
            sleep_for = _backoff_seconds(attempt)
            print(f"[!] Firecrawl {response.status_code} (attempt {attempt}/{FIRECRAWL_MAX_RETRIES}). Retrying in {sleep_for:.1f}s...")

        if attempt < FIRECRAWL_MAX_RETRIES:
            time.sleep(sleep_for)
        else:
            return response

    if last_exc is not None:
        print(f"[-] Firecrawl unreachable after {FIRECRAWL_MAX_RETRIES} attempts: {last_exc}")
    return None


def _backoff_seconds(attempt: int) -> float:
    """Exponential backoff with jitter: base * 2^(attempt-1) +/- 25%."""
    base = FIRECRAWL_BACKOFF_BASE * (2 ** (attempt - 1))
    return base * (0.75 + random.random() * 0.5)


def _parse_retry_after(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def scrape_grant(url):
    print(f"[*] Asking Firecrawl to extract schema from {url}...")

    payload = {
        "url": url,
        "formats": ["extract"],
        "extract": {
            "schema": GRANT_SCHEMA,
            "systemPrompt": "You are extracting data for a semantic RAG search engine. Richness and specificity of text matter far more than brevity. Strictly follow the schema. For 'description': Write a detailed 4-6 sentence summary. Explicitly forbidden to write 1-2 sentence summaries. For 'objectives': Copy or closely paraphrase the stated goals directly from the page. If a dedicated objectives section exists, use it fully. For 'eligibilityCriteria': Include ALL conditions found (degree, nationality, age, institution, prior work) — never truncate. For 'researchThemes': Extract specific sub-domains, not broad fields (e.g. prefer 'Quantum Error Correction' over 'Physics'). For 'fundingScope': List what is covered AND what is explicitly excluded if mentioned. If a value isn't found, use null or an empty array. Use null ONLY if genuinely not found. Never fabricate or hallucinate values. If the URL contains a #fragment, extract ONLY the grant matching that fragment. Ensure you find the exact funding amount; do not leave it null if the text mentions amounts like '10 Lakhs', '80 lakh', '50%', or 'Rs. 50,000'. Extensively search the text for any monetary limits, cost caps, overheads, or percentages awarded. In eligibleApplicants, explicitly include degrees (e.g. PhD, MS, B.Tech) and positions (e.g. Postdoc, Researcher) mentioned in the guidelines. Your output will be directly embedded into a vector database. Richer, more specific text produces better search matches. Do not summarize aggressively."
        }
    }

    response = _firecrawl_post(url, payload)
    if response is None:
        return None

    if response.status_code == 200:
        data = response.json()
        if data.get("success") and "extract" in data.get("data", {}):
            extract = data["data"]["extract"]
            
            # Application deadline default value
            if not extract.get("applicationDeadline") or str(extract.get("applicationDeadline")).strip().lower() in ["null", "none"]:
                extract["applicationDeadline"] = "Not Specified"
                
            # If only one amount is present, copy it to the other
            min_amt = extract.get("fundingAmountMin")
            max_amt = extract.get("fundingAmountMax")
            if min_amt and not max_amt:
                extract["fundingAmountMax"] = min_amt
            elif max_amt and not min_amt:
                extract["fundingAmountMin"] = max_amt
            
            # Fill in the system-managed fields required by our schema
            extract["id"] = str(uuid.uuid4())
            extract["grantUrl"] = url
            extract["application_link"] = extract.get("applicationLink")
            extract["createdAt"] = None
            extract["updatedAt"] = None
            extract["lastScrapedAt"] = datetime.utcnow().isoformat()
            
            # Basic checksum
            hash_str = f"{extract.get('grantTitle', '')}-{extract.get('fundingAgency', '')}"
            extract["checksum"] = hashlib.sha256(hash_str.encode()).hexdigest()
            
            return extract
        else:
            print("[-] Firecrawl extraction failed:", data)
    else:
        print(f"[-] API Error {response.status_code}: {response.text}")
    return None

def crawl_for_grants(start_url, max_required=8):
    print(f"[*] Crawling {start_url} to discover up to {max_required} valid grant pages...")
    try:
        from urllib.parse import urljoin
        from bs4 import BeautifulSoup

        visited = set()
        # queue stores tuples of (url, depth)
        queue = [(start_url, 0)]
        valid_candidates = []

        while queue and len(valid_candidates) < max_required * 2:
            current_url, depth = queue.pop(0)
            if current_url in visited:
                continue

            visited.add(current_url)
            print(f"    -> Fetching {current_url} (Depth: {depth})")

            page_html = _fetch_html(current_url)
            if not page_html:
                print(f"       Could not fetch {current_url} (skipping).")
                continue

            soup = BeautifulSoup(page_html, "lxml")
            
            # Find specific grant links using the accordion/link structure found on serb.gov.in
            for a in soup.select("a.awards_btn"):
                # Ensure it contains a grant title
                link_div = a.find("div", class_="link")
                if not link_div:
                    continue
                
                # Check for actual grant keywords in the title text
                grant_title = link_div.text.strip().lower()
                grant_keywords = ["grant", "fellowship", "award", "scheme", "fund", "scholarship", "support", "artificial intelligence", "conference", "seminar", "call for proposal"]

                if not any(kw in grant_title for kw in grant_keywords):
                    continue

                href = a.get("href")
                if not href:
                    continue
                
                # For fragments indicating specific grants (like #CRG), we append them as unique URLs so Firecrawl extracts each specific grant.
                fragment = href
                
                # Sometime href is "#accordion". Let's append the actual grant title as a fragment if so,
                # to instruct Firecrawl properly. 
                if fragment == "#accordion":
                    import urllib.parse
                    try:
                        safe_title = urllib.parse.quote(link_div.text.strip())
                    except:
                        safe_title = "accordion"
                    l = f"{current_url}#{safe_title}"
                else:
                    from urllib.parse import urljoin
                    l = urljoin(current_url, fragment)
                
                # For printing safely on Windows terminals
                def safe_print(*args):
                    try:
                        print(*args)
                    except UnicodeEncodeError:
                        print(" ".join(str(a) for a in args).encode("utf-8", "ignore").decode("utf-8"))

                if l not in valid_candidates and l not in visited:
                    valid_candidates.append(l)
                    try:
                        safe_print(f"       Found grant accordion target: {link_div.text.strip()} -> {l}")
                    except Exception:
                        pass

            # Catch standard href links that explicitly mention grant keywords in text
            # but only if they are clearly grants (avoid menu items)
            for a in soup.find_all("a", href=True):
                l = urljoin(current_url, a["href"])
                
                # Ignore fragment-only links unless we want the current page
                if a["href"].startswith("#"):
                    continue
                
                # Basic ignore list. NOTE: PDFs are *allowed* — Firecrawl's
                # /v1/scrape endpoint parses PDFs server-side and runs the
                # same schema extraction. Many .gov.in grants are PDF-only,
                # so we keep them in the candidate set.
                ignore_list = ["assets", "contact", "about", "privacy", "terms", "login", "register", "faq", "committee", "structure", "proposal"]
                if any(bad in l.lower() for bad in ignore_list):
                    continue
                # Skip non-PDF binary asset extensions; PDFs are handled.
                lower_l = l.lower()
                if any(lower_l.endswith(ext) for ext in (".zip", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".gif")):
                    continue
                
                try:
                    text = a.text.strip().lower()
                except Exception:
                    text = ""

                if not text:
                    continue
                
                # For printing safely on Windows terminals
                def safe_print(*args):
                    try:
                        print(*args)
                    except UnicodeEncodeError:
                        print(" ".join(str(a) for a in args).encode("utf-8", "ignore").decode("utf-8"))

                is_grant = False
                grant_keywords = ["fellowship", "research grant", "award", "scholarship", "funding", "call for proposal", "grants for artificial intelligence", "grants for conference"]
                for kw in grant_keywords:
                    # Require the keyword and at least 2 words to avoid generic links
                    if kw in text and len(text.split()) > 1: 
                        is_grant = True
                        break
                
                if is_grant and l not in valid_candidates and l not in visited and l != current_url:
                    valid_candidates.append(l)
                    safe_print(f"       Found explicit grant link: {text} -> {l}")
                    if len(valid_candidates) >= max_required * 2:
                        break

            # If depth 0, look for category links to crawl further
            if depth == 0:
                for a in soup.find_all("a", href=True):
                    l = urljoin(current_url, a["href"])
                    if l.startswith("http") and ("grant" in a.text.lower() or "fellowship" in a.text.lower()):
                         if l not in visited and not any(q[0] == l for q in queue) and l != current_url and not a["href"].startswith("#"):
                             queue.append((l, depth + 1))
                            
        print(f"[+] Crawler discovered {len(valid_candidates)} candidate grant URLs.")
        return valid_candidates[:max_required * 2]
        
    except Exception as e:
        print(f"[-] Local crawler encountered an error: {str(e)}")
        return []

import argparse

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract grant data from a URL using Firecrawl.")
    parser.add_argument("url", help="The URL to scrape or map (e.g., https://example.com/grant or https://www.startupgrantsindia.com/)")
    parser.add_argument("--output", "-o", default="grants_firecrawl_output.json", help="Output JSON file path")
    parser.add_argument("--max", "-m", type=int, default=8, help="Maximum number of grants to extract")
    args = parser.parse_args()
    
    candidates = [args.url]
    # Heuristic: If it's a root domain or a listing page, invoke the crawler
    if args.url.count("/") <= 3 or "/type/" in args.url.lower() or "/industry/" in args.url.lower() or "page" in args.url.lower():
        candidates = crawl_for_grants(args.url, args.max)
        if not candidates:
            print("[-] No candidate links found. Falling back to scraping the original URL.")
            candidates = [args.url]
    
    scraped_data = []
    print(f"[*] Beginning extraction for up to {args.max} candidate pages...")
    for link in candidates:
        if len(scraped_data) >= args.max:
            break
            
        grant_data = scrape_grant(link)
        if grant_data and grant_data.get("grantTitle") and grant_data.get("fundingAgency"):
            # Optional: Check if we just hallucinated a dummy object that wasn't a grant
            # e.g., if grantTitle is something silly like "Terms of Service"
            if "terms" not in grant_data["grantTitle"].lower() and "privacy" not in grant_data["grantTitle"].lower():
                scraped_data.append(grant_data)
            
    if scraped_data:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(scraped_data, f, indent=2, ensure_ascii=False)
        print(f"[+] Saved {len(scraped_data)} grants to {args.output} matching schema!")
        # Print just the first one to console to keep it clean
        print(json.dumps(scraped_data[0], indent=2, ensure_ascii=False))
        if len(scraped_data) > 1:
            print(f"... and {len(scraped_data)-1} more grants.")
