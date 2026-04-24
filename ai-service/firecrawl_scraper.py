import requests
import json
import uuid
import hashlib
from datetime import datetime
import sys
import os

# Force UTF-8 for output to avoid charmap codec errors in Windows terminals
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

FIRECRAWL_API_KEY = os.environ.get("FIRECRAWL_API_KEY")
if not FIRECRAWL_API_KEY:
    raise RuntimeError("FIRECRAWL_API_KEY environment variable is not set.")

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

def load_existing_checksums():
    # Simple deduplication state matching what exists in db/index.
    # In a real system, this would query the db. We simulate it by reading a local file.
    state_file = "scraper_state.json"
    if os.path.exists(state_file):
        try:
            with open(state_file, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_existing_checksums(state):
    with open("scraper_state.json", "w") as f:
        json.dump(state, f)

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
                "systemPrompt": "You are extracting data for a semantic RAG search engine. Richness and specificity of text matter far more than brevity. Strictly follow the schema. For 'description': Write a detailed 4-6 sentence summary. Explicitly forbidden to write 1-2 sentence summaries. For 'objectives': Copy or closely paraphrase the stated goals directly from the page. If a dedicated objectives section exists, use it fully. For 'eligibilityCriteria': Include ALL conditions found (degree, nationality, age, institution, prior work) — never truncate. For 'researchThemes': Extract specific sub-domains, not broad fields (e.g. prefer 'Quantum Error Correction' over 'Physics'). For 'fundingScope': List what is covered AND what is explicitly excluded if mentioned. If a value isn't found, use null or an empty array. Use null ONLY if genuinely not found. Never fabricate or hallucinate values. If the URL contains a #fragment, extract ONLY the grant matching that fragment. Ensure you find the exact funding amount; do not leave it null if the text mentions amounts like '10 Lakhs', '80 lakh', '50%', or 'Rs. 50,000'. Extensively search the text for any monetary limits, cost caps, overheads, or percentages awarded. In eligibleApplicants, explicitly include degrees (e.g. PhD, MS, B.Tech) and positions (e.g. Postdoc, Researcher) mentioned in the guidelines. Your output will be directly embedded into a vector database. Richer, more specific text produces better search matches. Do not summarize aggressively."
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
            extract["grantUrl"] = url
            extract["application_link"] = extract.get("applicationLink")
            extract["createdAt"] = None
            
            # Live ISO timestamp for updated and scraped at
            now_iso = datetime.utcnow().isoformat()
            extract["updatedAt"] = now_iso
            extract["lastScrapedAt"] = now_iso
            
            # Basic checksum fix matching requirements
            hash_str = f"{extract.get('grantTitle', '')}-{extract.get('fundingAgency', '')}-{extract.get('applicationDeadline', '')}"
            checksum = hashlib.sha256(hash_str.encode()).hexdigest()
            extract["checksum"] = checksum
            
            # Deduplication before upsert
            state = load_existing_checksums()
            if checksum in state:
                # Reuse existing id
                extract["id"] = state[checksum]
                print(f"[*] Reused existing id {extract['id']} for checksum {checksum}")
            else:
                # New id
                new_id = str(uuid.uuid4())
                extract["id"] = new_id
                state[checksum] = new_id
                save_existing_checksums(state)
                print(f"[*] Generated fresh id {new_id} for checksum {checksum}")
            
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
            grant_keywords = ["grant", "fellowship", "award", "scheme", "fund", "scholarship", "support", "artificial intelligence", "conference", "seminar", "call for proposal"]
            
            # Find specific grant links using the accordion/link structure found on serb.gov.in
            for a in soup.select("a.awards_btn"):
                # Ensure it contains a grant title
                link_div = a.find("div", class_="link")
                if not link_div:
                    continue
                
                # Check for actual grant keywords in the title text
                grant_title = link_div.text.strip().lower()
                
                # Relevance stop condition: min 2 grant keywords
                hit_count = sum(1 for kw in grant_keywords if kw in grant_title)
                
                # Minimum confidence threshold
                if not link_div.text.strip():
                    print(f"       [-] Skipped tracking: title empty")
                    continue
                
                if hit_count < 2:
                    print(f"       [-] Skipped tracking: hit count {hit_count} < 2")
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
                
                # Basic ignore list
                ignore_list = [".pdf", "assets", "contact", "about", "privacy", "terms", "login", "register", "faq", "committee", "structure", "proposal"]
                if any(bad in l.lower() for bad in ignore_list):
                    continue
                
                try:
                    text = a.text.strip().lower()
                except Exception:
                    text = ""

                if not text:
                    continue
                    
                # Relevance stop condition: min 2 grant keywords
                hit_count = sum(1 for kw in grant_keywords if kw in text)
                if hit_count < 2:
                    continue
                    
                if l not in valid_candidates and l not in visited:
                    valid_candidates.append(l)
                    print(f"       Found grant standard link: {text} -> {l}")

        return valid_candidates[:max_required]
    except Exception as e:
        print(f"[-] Crawl failed: {str(e)}")
        return []
