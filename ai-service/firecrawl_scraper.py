import requests
import json
import uuid
import hashlib
from datetime import datetime

FIRECRAWL_API_KEY = "fc-02adebc8ff4b4d5e9c7c9dc7542576ab"

# The schema definition we want Firecrawl to strictly extract for us
GRANT_SCHEMA = {
    "type": "object",
    "properties": {
        "grantTitle": {"type": "string", "description": "Title of the grant or fellowship"},
        "fundingAgency": {"type": "string", "description": "The organization providing the funding"},
        "programName": {"type": ["string", "null"], "description": "Specific program name, if applicable"},
        "description": {"type": "string", "description": "A very brief 1-2 sentence description of the grant"},
        "applicationDeadline": {"type": ["string", "null"], "description": "Deadline in ISO format if possible, else text. Return null if not strictly found."},
        "fundingAmountMin": {"type": ["string", "null"], "description": "Minimum funding amount. Must extract if present (e.g. \'$10,000\', \'10 Lakhs\', \'Rs. 10,00,000\')."},
        "fundingAmountMax": {"type": ["string", "null"], "description": "Maximum funding amount. Must extract if present (e.g. \'$50,000\', \'50 Lakhs\', \'80 lakh\', \'50%\'). Look for limits, caps, per month/year budgets, or percentages."},
        "fundingCurrency": {"type": ["string", "null"]},
        "eligibleCountries": {"type": "array", "items": {"type": "string"}, "description": "Array of country names. Keep concise."},
        "eligibleApplicants": {"type": "array", "items": {"type": "string"}, "description": "Applicant types including degrees (e.g. PhD, MS, B.Tech) and positions (e.g. Postdoc, Researcher, Student, Faculty, Startup). Keep concise."},
        "institutionType": {"type": "array", "items": {"type": "string"}, "description": "e.g. Government, Private, Startup. Keep concise."},
        "field": {"type": "array", "items": {"type": "string"}, "description": "e.g. AI, Healthcare, Biotechnology"},
        "applicationLink": {"type": ["string", "null"], "description": "Direct URL or mailto link to apply"},
        "tags": {"type": "array", "items": {"type": "string"}, "description": "Keywords related to this grant"}
    },
    "required": ["grantTitle", "fundingAgency", "description"]
}

def scrape_grant(url):
    print(f"[*] Asking Firecrawl to extract schema from {url}...")
    
    # We use v1/scrape as it features extraction cleanly. v2/scrape has similar features but v1 is standard for LLM extraction
    response = requests.post(
        "https://api.firecrawl.dev/v1/scrape",
        headers={
            "Authorization": f"Bearer {FIRECRAWL_API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "url": url,
            "formats": ["extract"],
            "extract": {
                "schema": GRANT_SCHEMA,
                "systemPrompt": "Extract grant and fellowship details strictly following the schema. If a value isn't found, use null or an empty array. If the URL contains a #fragment, extract ONLY the grant matching that fragment. Ensure you find the exact funding amount; do not leave it null if the text mentions amounts like '10 Lakhs', '80 lakh', '50%', or 'Rs. 50,000'. Extensively search the text for any monetary limits, cost caps, overheads, or percentages awarded. In eligibleApplicants, explicitly include degrees (e.g. PhD, MS, B.Tech) and positions (e.g. Postdoc, Researcher, Student, Faculty, Startup) mentioned in the guidelines."
            }
        },
        timeout=60
    )
    
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
        import sys
        import os
        from urllib.parse import urljoin
        from bs4 import BeautifulSoup
        sys.path.append(os.path.dirname(os.path.abspath(__file__)))
        from scrape.scrape import fetch, fetch_selenium
        
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
            
            res = fetch(current_url)
            if not res or ("text" not in res and res.get("status_code") != 200):
                print(f"       Failed with basic fetch, falling back to Selenium for {current_url}...")
                try:
                    html_content = fetch_selenium(current_url, driver_path="scrape/chromedriver", wait=2.0)
                    page_html = html_content
                except Exception as e:
                    print(f"       Selenium fetch also failed: {str(e)}")
                    continue
            else:
                page_html = res.get("text", "")
                
            if not page_html:
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
                grant_keywords = ["grant", "fellowship", "award", "scheme", "fund", "scholarship", "support"]
                
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
                    safe_title = urllib.parse.quote(link_div.text.strip())
                    l = f"{current_url}#{safe_title}"
                else:
                    from urllib.parse import urljoin
                    l = urljoin(current_url, fragment)
                
                if l not in valid_candidates and l not in visited:
                    valid_candidates.append(l)
                    print(f"       Found grant accordion target: {link_div.text.strip()} -> {l}")
            
            # Catch standard href links that explicitly mention grant keywords in text
            # but only if they are clearly grants (avoid menu items)
            for a in soup.find_all("a", href=True):
                l = urljoin(current_url, a["href"])
                
                # Ignore fragment-only links unless we want the current page
                if a["href"].startswith("#"):
                    continue
                
                # Basic ignore list
                ignore_list = [".pdf", "assets", "contact", "about", "privacy", "terms", "login", "register", "faq", "committee", "structure", "proposal"]
                if any(bad in l.lower() for bad in ignore_list):
                    continue
                
                text = a.text.strip().lower()
                if not text:
                    continue
                
                is_grant = False
                grant_keywords = ["fellowship", "research grant", "award", "scholarship", "funding"]
                for kw in grant_keywords:
                    # Require the keyword and at least 2 words to avoid generic links
                    if kw in text and len(text.split()) > 1: 
                        is_grant = True
                        break
                
                if is_grant and l not in valid_candidates and l not in visited and l != current_url:
                    valid_candidates.append(l)
                    print(f"       Found explicit grant link: {text} -> {l}")
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
