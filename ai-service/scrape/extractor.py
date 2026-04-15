from bs4 import BeautifulSoup
import re
from urllib.parse import urljoin, urlparse, unquote

from .utils import generate_checksum, parse_date, parse_currency_and_amount, clean_list, now_iso, clean_text


def get_text(el):
    return el.get_text(" ", strip=True) if el else ""


def normalize_whitespace(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def split_lines(text: str):
    if not text:
        return []
    lines = [normalize_whitespace(x) for x in text.split("\n")]
    return [x for x in lines if x]


def filename_from_url(url: str) -> str:
    try:
        path = urlparse(url).path
        name = path.split("/")[-1]
        name = unquote(name)
        name = re.sub(r"\.pdf$", "", name, flags=re.I)
        name = re.sub(r"[-_]+", " ", name)
        return normalize_whitespace(name)
    except Exception:
        return "Grant Document"


def safe_first_long_paragraph(soup, min_len=80, max_len=2000):
    for p in soup.find_all("p"):
        if p.find_parent(["nav", "header", "footer", "aside"]):
            continue
        txt = normalize_whitespace(get_text(p))
        if len(txt) >= min_len:
            return txt[:max_len]
    return None


def find_title(soup):
    h1 = soup.find("h1")
    if h1:
        txt = normalize_whitespace(get_text(h1))
        if txt:
            return txt

    meta_title = soup.find("meta", attrs={"property": "og:title"})
    if meta_title and meta_title.get("content"):
        txt = normalize_whitespace(meta_title["content"])
        if txt:
            return txt

    if soup.title:
        txt = normalize_whitespace(soup.title.get_text(strip=True))
        if txt:
            return txt

    return None


def find_description(soup):
    meta_desc = soup.find("meta", attrs={"name": "description"})
    if meta_desc and meta_desc.get("content"):
        txt = normalize_whitespace(meta_desc["content"])
        if txt and len(txt) > 40:
            return txt[:2000]

    chunks = []
    # Avoid picking up header/nav/footer as description
    for node in soup.find_all(["p", "li"]):
        if node.find_parent(["nav", "header", "footer", "aside"]):
            continue
        txt = normalize_whitespace(get_text(node))
        if len(txt) >= 60:
            chunks.append(txt)
        if len(" ".join(chunks)) >= 900:
            break

    if not chunks:
        return safe_first_long_paragraph(soup)

    return normalize_whitespace(" ".join(chunks))[:2000]


def find_application_link(soup, base_url):
    priority_words = ["apply", "application", "submit", "register", "how to apply"]

    for a in soup.find_all("a", href=True):
        txt = normalize_whitespace(get_text(a)).lower()
        if any(word in txt for word in priority_words):
            return urljoin(base_url, a["href"])

    for a in soup.find_all("a", href=True):
        href = a["href"].lower()
        if any(word in href for word in ["apply", "application", "register", "submit"]):
            return urljoin(base_url, a["href"])

    return None


def find_deadline(text):
    deadline_keywords = [
        "deadline",
        "last date",
        "application deadline",
        "closing date",
        "apply by",
        "submission deadline"
    ]

    lines = split_lines(text)
    for i, line in enumerate(lines):
        lower = line.lower()
        if any(k in lower for k in deadline_keywords):
            # Try to parse date from same line
            parsed = parse_date(line)
            if parsed:
                return parsed
            # If no date on same line, check next line
            if i + 1 < len(lines):
                parsed = parse_date(lines[i + 1])
                if parsed:
                    return parsed

    # Fallback: look for any date in the text near deadline keywords
    for i, line in enumerate(lines):
        lower = line.lower()
        if any(k in lower for k in deadline_keywords):
            # Look within a few lines
            for j in range(max(0, i-1), min(len(lines), i+3)):
                parsed = parse_date(lines[j])
                if parsed:
                    return parsed

    return None


def find_funding_info(text):
    lines = split_lines(text)

    keywords = [
        "amount", "award", "grant value", "budget", "remuneration", "funding", "fellowship", "rs.", "inr", "lakh", "per annum",
        "support worth", "grant amount", "financial support", "stipend"
    ]

    for i, line in enumerate(lines):
        lower = line.lower()
        if any(k in lower for k in keywords):
            # Try to parse amount from same line
            currency, mn, mx = parse_currency_and_amount(line)
            if currency or mn is not None or mx is not None:
                return currency, mn, mx
            # If no amount on same line, check next line
            if i + 1 < len(lines):
                currency, mn, mx = parse_currency_and_amount(lines[i + 1])
                if currency or mn is not None or mx is not None:
                    return currency, mn, mx
            # Also check one previous line because some sites place values above labels
            if i - 1 >= 0:
                currency, mn, mx = parse_currency_and_amount(lines[i - 1])
                if currency or mn is not None or mx is not None:
                    return currency, mn, mx

    # Fallback: search entire text for currency amounts
    currency, mn, mx = parse_currency_and_amount(text)
    if currency or mn is not None or mx is not None:
        return currency, mn, mx

    return None, None, None


def find_funding_agency(soup, text):
    possible_labels = [
        "funding agency",
        "funded by",
        "sponsor",
        "organization",
        "organisation"
    ]

    lines = split_lines(text)
    for i, line in enumerate(lines):
        lower = line.lower()
        for label in possible_labels:
            if label in lower:
                # Try to get value after colon on same line
                parts = line.split(":")
                if len(parts) > 1:
                    val = normalize_whitespace(parts[-1])
                    if val and len(val) > 3 and val.lower() not in ["agency", "sponsor", "organization", "organisation"]:
                        return val
                # If no value after colon, check next line
                if i + 1 < len(lines):
                    next_line = normalize_whitespace(lines[i + 1])
                    # Make sure next line looks like a value (not another label)
                    if next_line and len(next_line) > 3 and ":" not in next_line[:20]:
                        return next_line

    # Look for structured elements with agency-like content
    for a in soup.find_all(["h2", "h3", "strong", "b", "div", "span"], class_=re.compile(r"agency|sponsor|org|funder", re.I)):
        txt = normalize_whitespace(get_text(a))
        if 5 < len(txt) < 100 and any(k in txt.lower() for k in ["foundation", "ministry", "department", "council", "institute", "administration", "agency", "board", "commission"]):
            return txt

    # Final fallback for SERB
    low_text = text.lower()
    if "serb" in low_text or "anrf" in low_text or "anusandhan" in low_text:
        return "Anusandhan National Research Foundation (ANRF)"

    return None


def find_program_name(text):
    labels = ["program name", "scheme", "programme", "program"]

    lines = split_lines(text)
    for line in lines:
        lower = line.lower()
        for label in labels:
            if label in lower:
                parts = line.split(":")
                if len(parts) > 1:
                    val = normalize_whitespace(parts[-1])
                    if val:
                        return val
    return None


def find_eligible_countries(text):
    countries = set()
    lower_text = text.lower()
    
    known_countries = {
        "india": "India", 
        "usa": "USA", "united states": "USA", 
        "uk": "UK", "united kingdom": "UK",
        "canada": "Canada", 
        "australia": "Australia", 
        "europe": "Europe", 
        "asia": "Asia",
        "international": "International",
        "worldwide": "Worldwide"
    }
    
    for kw, val in known_countries.items():
        if re.search(rf"\b{kw}\b", lower_text):
            countries.add(val)

    return sorted(list(countries))


def find_eligible_applicants(text):
    result = set()
    lower_text = text.lower()
    
    keywords = {
        "phd": "PhD",
        "postdoc": "Postdoctoral Researcher",
        "post doctoral": "Postdoctoral Researcher",
        "post-doctoral": "Postdoctoral Researcher",
        "m.sc": "MSc",
        "msc": "MSc",
        "b.sc": "BSc",
        "bsc": "BSc",
        "b.tech": "BTech",
        "m.tech": "MTech",
        "md": "MD",
        "ms": "MS",
        "scientist": "Scientist",
        "faculty": "Faculty",
        "researcher": "Researcher",
        "student": "Student",
        "professor": "Professor",
        "startup": "Startup",
        "entrepreneur": "Entrepreneur",
        "women": "Women",
        "principal investigator": "Principal Investigator",
        "pi": "Principal Investigator"
    }

    for kw, val in keywords.items():
        if re.search(rf"\b{kw}\b", lower_text):
            result.add(val)

    if not result and ("who can apply" in lower_text or "eligibility" in lower_text):
        result.add("Researcher") # Generic fallback

    return sorted(list(result))


def find_institution_type(text):
    result = set()
    lower_text = text.lower()
    
    keywords = {
        "academic": "Academic",
        "university": "University", 
        "college": "College", 
        "public": "Public",
        "private": "Private",
        "government": "Government",
        "industry": "Industrial",
        "industrial": "Industrial",
        "startup": "Startup",
        "ngo": "NGO",
        "non-profit": "Non-profit",
        "non profit": "Non-profit",
        "research institute": "Research Institute",
        "research organization": "Research Organization"
    }

    for kw, val in keywords.items():
        if re.search(rf"\b{kw}\b", lower_text):
            result.add(val)

    return sorted(list(result))

def find_field(text):
    result = []
    keywords = [
        "artificial intelligence", "computer science", "biotechnology",
        "health", "physics", "chemistry", "mathematics", "engineering",
        "life sciences", "environment", "agriculture", "robotics",
        "data science", "machine learning", "biology", "medicine"
    ]

    lower_text = text.lower()
    for kw in keywords:
        if kw in lower_text:
            result.append(kw.title())

    return clean_list(result)


def build_tags(title, text, funding_agency, field_list):
    tags = []

    if title:
        words = re.findall(r"[A-Za-z]{4,}", title)
        tags.extend([w.lower() for w in words[:8]])

    if funding_agency:
        tags.append(funding_agency.lower())

    if field_list:
        tags.extend([f.lower() for f in field_list])

    important_keywords = [
        "grant", "funding", "research", "fellowship",
        "scholarship", "innovation", "startup"
    ]

    lower_text = text.lower()
    for kw in important_keywords:
        if kw in lower_text:
            tags.append(kw)

    return clean_list(tags)


def is_listing_page(soup):
    """Detect if the page is a listing page with multiple grants in tables."""
    tables = soup.find_all("table")
    for table in tables:
        rows = table.find_all("tr")
        if len(rows) >= 2:  # At least header + 1 data row
            # Check if headers look like grant listing
            header_row = rows[0]
            header_text = header_row.get_text(" ", strip=True).lower()
            listing_keywords = ["agency", "scheme", "deadline", "eligibility", "program", "grant", "fund", "amount"]
            if any(kw in header_text for kw in listing_keywords):
                return True

    # SERB-like grant pages often expose schemes in collapsible funding sections.
    funding_sections = soup.find_all(id=re.compile(r"^funding\d+$", re.I))
    if len(funding_sections) >= 2:
        return True

    return False


def is_probable_grant_title(title):
    if not title:
        return False

    t = clean_text(title)
    if len(t) < 4:
        return False

    low = t.lower()
    if re.fullmatch(r"\d+", low):
        return False
    if re.match(r"^dr\.?\s", low):
        return False

    grant_hints = [
        "grant",
        "fellow",
        "scheme",
        "support",
        "mission",
        "programme",
        "program",
        "proposal",
        "call",
        "network",
        "excellence",
        "matrics",
        "pair",
        "irg",
        "srg",
        "supra",
        "crg",
        "fire",
        "irhpa",
        "emeq",
        "its",
        "maha",
        "power",
        "vigyan",
    ]
    return any(h in low for h in grant_hints)


def parse_grants_from_table(soup, base_url):
    """Parse grants from HTML tables with headers."""
    grants = []
    
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) < 2:
            continue
        
        # Extract headers from first row
        header_row = rows[0]
        headers = []
        for th in header_row.find_all(["th", "td"]):
            header_text = clean_text(th.get_text(" ", strip=True)).lower()
            headers.append(header_text)
        
        # Check if this looks like a grant listing table
        listing_keywords = ["agency", "scheme", "deadline", "eligibility", "program", "grant", "fund", "amount", "duration"]
        if not any(kw in " ".join(headers) for kw in listing_keywords):
            continue
        
        # Parse data rows
        for tr in rows[1:]:
            cols = tr.find_all(["td", "th"])
            if not cols:
                continue
            
            # Build a mapping of header -> value
            row_data = {}
            for i, col in enumerate(cols):
                key = headers[i] if i < len(headers) else f"col_{i}"
                row_data[key] = clean_text(col.get_text(" ", strip=True))
            
            row_text = " | ".join(row_data.values())
            if len(row_text) < 10:
                continue
            
            # Extract grant data from row
            grant_title = None
            grant_url = None
            funding_agency = None
            program_name = None
            deadline = None
            eligibility = None
            funding_currency = None
            funding_min = None
            funding_max = None
            duration = None
            
            # Find link in the row (usually for grant title or scheme)
            for col in cols:
                a = col.find("a", href=True)
                if a and not grant_url:
                    link_text = clean_text(a.get_text(" ", strip=True))
                    if link_text and len(link_text) > 3:
                        grant_title = link_text
                        grant_url = urljoin(base_url, a["href"])
            
            # Map columns to fields based on header keywords
            for key, val in row_data.items():
                if not val or len(val) < 2:
                    continue
                key_lower = key.lower()
                
                if any(kw in key_lower for kw in ["agency", "sponsor", "organization", "funder", "funded by"]):
                    funding_agency = val
                elif any(kw in key_lower for kw in ["scheme", "program", "programme", "grant name", "title"]):
                    if not grant_title:
                        grant_title = val
                    program_name = val
                elif any(kw in key_lower for kw in ["deadline", "last date", "closing date", "due date", "apply by"]):
                    deadline = parse_date(val)
                elif any(kw in key_lower for kw in ["eligibility", "eligible", "who can apply"]):
                    eligibility = val
                elif any(kw in key_lower for kw in ["amount", "fund", "value", "budget", "grant value"]):
                    funding_currency, funding_min, funding_max = parse_currency_and_amount(val)
                elif any(kw in key_lower for kw in ["duration", "period", "tenure"]):
                    duration = val
            
            # Fallback: if no agency found, try first column
            if not funding_agency and len(cols) > 0:
                first_col_text = clean_text(cols[0].get_text(" ", strip=True))
                if first_col_text and len(first_col_text) > 2 and first_col_text != grant_title:
                    funding_agency = first_col_text
            
            # Fallback: if no title found, use first non-empty meaningful column
            if not grant_title:
                for val in row_data.values():
                    if val and len(val) > 5:
                        grant_title = val
                        break
            
            if not grant_title:
                continue

            if not is_probable_grant_title(grant_title):
                continue

            if grant_url and "/directory" in grant_url.lower():
                continue
            
            # Fallback: try to extract funding amount from entire row text if not found
            if funding_currency is None and funding_min is None:
                funding_currency, funding_min, funding_max = parse_currency_and_amount(row_text)
            
            # Also try extracting from grant title (e.g., "Research Grant - $50,000")
            if funding_currency is None and funding_min is None and grant_title:
                funding_currency, funding_min, funding_max = parse_currency_and_amount(grant_title)
            
            # Build description from row data
            description_parts = []
            if program_name and program_name != grant_title:
                description_parts.append(f"Program: {program_name}")
            if eligibility:
                description_parts.append(f"Eligibility: {eligibility}")
            if duration:
                description_parts.append(f"Duration: {duration}")
            if not description_parts:
                description_parts.append(row_text)
            
            description = " | ".join(description_parts)[:2000]

            eligibility_text = " | ".join([x for x in [eligibility, row_text] if x])
            eligible_countries = find_eligible_countries(eligibility_text)
            eligible_applicants = find_eligible_applicants(eligibility_text)
            institution_type = find_institution_type(eligibility_text)
            
            # Build tags
            tags = []
            if grant_title:
                words = re.findall(r"[A-Za-z]{4,}", grant_title)
                tags.extend([w.lower() for w in words[:6]])
            if funding_agency:
                tags.append(funding_agency.lower())
            
            return {
                "id": None,
                "grantTitle": grant_title,
                "fundingAgency": funding_agency,
                "programName": program_name,
                "description": description,
                "grantUrl": grant_url or base_url,
                "applicationDeadline": deadline,
                "fundingAmountMin": funding_min,
                "fundingAmountMax": funding_max,
                "fundingCurrency": funding_currency,
                "eligibleCountries": eligible_countries,
                "eligibleApplicants": eligible_applicants,
                "institutionType": institution_type,
                "field": find_field(row_text),
                "application_link": grant_url,
                "applicationLink": grant_url,
                "checksum": generate_checksum(row_text),
                "tags": clean_list(tags),
                "createdAt": None,
                "updatedAt": None,
                "lastScrapedAt": now_iso()
            }


            
            grants.append(grant)
    
    return grants


def parse_grants_from_funding_sections(soup, base_url):
    """Parse grant-like entries from collapsible sections (e.g. SERB funding blocks)."""
    grants = []
    sections = soup.find_all(id=re.compile(r"^funding\d+$", re.I))

    for sec in sections:
        title = None
        label_id = sec.get("aria-labelledby")
        if label_id:
            # Serg website duplicates IDs (e.g. headingFunding3 used twice). 
            # Use find_previous to get the closest one above this section instead of global find.
            label_node = sec.find_previous(id=label_id)
            if label_node:
                title = clean_text(label_node.get_text(" ", strip=True))

        if not title:
            prev = sec.find_previous(["a", "button", "h2", "h3", "h4", "h5"])
            if prev:
                title = clean_text(prev.get_text(" ", strip=True))

        if not title or len(title) < 4:
            continue

        title_low = title.lower()
        if title_low.startswith("dr.") or title_low.startswith("dr "):
            continue

        title_keep_hints = [
            "grant",
            "fellow",
            "research",
            "support",
            "mission",
            "programme",
            "program",
            "scheme",
            "award",
            "prize",
            "investigator",
            "excellence",
            "pair",
            "power",
            "matrics",
            "irg",
            "srg",
            "coe",
            "travel",
        ]
        if not any(k in title_low for k in title_keep_hints):
            continue

        # Strip out embedded modals and FAQs before text extraction
        for modal in sec.find_all(class_=re.compile(r"modal|faq", re.I)):
            modal.decompose()
        for faq in sec.find_all(id=re.compile(r"faq", re.I)):
            faq.decompose()

        section_text = clean_text(sec.get_text(" ", strip=True))
        if len(section_text) < 50: # Reduced from 80 just in case
            continue

        application_link = None
        for a in sec.find_all("a", href=True):
            href = urljoin(base_url, a["href"])
            txt = clean_text(a.get_text(" ", strip=True)).lower()
            if any(k in txt for k in ["apply", "proposal", "register", "submit", "call for proposals"]):
                application_link = href
                break

        if not application_link:
            for a in sec.find_all("a", href=True):
                href = urljoin(base_url, a["href"])
                hlow = href.lower()
                if "serbonline" in hlow or "proposal" in hlow or "registration" in hlow:
                    application_link = href
                    break

        deadline = find_deadline(section_text)
        funding_currency, funding_min, funding_max = find_funding_info(section_text)
        funding_agency = find_funding_agency(sec, section_text)
        program_name = find_program_name(section_text)
        eligible_countries = find_eligible_countries(section_text)
        eligible_applicants = find_eligible_applicants(section_text)
        institution_type = find_institution_type(section_text)
        field_list = find_field(section_text)

        sec_id = sec.get("id")
        base_clean_url = base_url.split("#", 1)[0]
        grant_url = base_clean_url
        if title:
            import urllib.parse
            grant_url = f"{base_clean_url}#{urllib.parse.quote(title.strip())}"
        elif sec_id:
            grant_url = f"{base_clean_url}#{sec_id}"

        checksum = generate_checksum(f"{title}||{grant_url}||{section_text[:2000]}")
        tags = build_tags(title, section_text, funding_agency, field_list)

        grants.append(
            {
                "id": None,
                "grantTitle": title,
                "fundingAgency": funding_agency,
                "programName": program_name,
                "description": section_text[:2000],
                "grantUrl": grant_url,
                "applicationDeadline": deadline,
                "fundingAmountMin": funding_min,
                "fundingAmountMax": funding_max,
                "fundingCurrency": funding_currency,
                "eligibleCountries": eligible_countries,
                "eligibleApplicants": eligible_applicants,
                "institutionType": institution_type,
                "field": field_list,
                "application_link": application_link,
                "applicationLink": application_link,
                "checksum": checksum,
                "tags": tags,
                "createdAt": None,
                "updatedAt": None,
                "lastScrapedAt": now_iso(),
            }
        )

    return grants


def extract_from_detail_html(html: str, url: str):
    """Extract grant data from HTML. Returns a single grant dict or a list of grants for listing pages."""
    soup = BeautifulSoup(html, "lxml")
    parsed_path = (urlparse(url).path or "").lower()
    
    # Check if this is a listing page with tables
    if is_listing_page(soup):
        section_grants = []
        table_grants = []
        
        if "serb.gov.in" in url.lower():
            section_grants = parse_grants_from_funding_sections(soup, url)

        # Only parse global tables if we aren't already grabbing them via specialized accordion sections.
        # Alternatively, parse tables that are NOT inside a funding section.
        for table in soup.find_all("table"):
            if section_grants and table.find_parent(id=re.compile(r"^funding\d+$", re.I)):
                continue
            
            # Wrap the single table in a temporary soup to reuse parse_grants_from_table
            temp_soup = BeautifulSoup(str(table), "lxml")
            t_grants = parse_grants_from_table(temp_soup, url)
            if t_grants:
                table_grants.extend(t_grants)

        merged = []
        if section_grants:
            merged.extend(section_grants)
        if table_grants:
            merged.extend(table_grants)

        if merged:
            return merged[0] if len(merged) == 1 else merged
    
    page_text = soup.get_text("\n", strip=True)

    grant_title = find_title(soup)
    description = find_description(soup)
    funding_agency = find_funding_agency(soup, page_text)
    program_name = find_program_name(page_text)
    application_link = find_application_link(soup, url)
    application_deadline = find_deadline(page_text)

    funding_currency, funding_min, funding_max = find_funding_info(page_text)
    eligible_countries = find_eligible_countries(page_text)
    eligible_applicants = find_eligible_applicants(page_text)
    institution_type = find_institution_type(page_text)
    field_list = find_field(page_text)

    checksum = generate_checksum(page_text)
    tags = build_tags(grant_title, page_text, funding_agency, field_list)

    return {
        "id": None,
        "grantTitle": grant_title,
        "fundingAgency": funding_agency,
        "programName": program_name,
        "description": description,
        "grantUrl": url,
        "applicationDeadline": application_deadline,
        "fundingAmountMin": funding_min,
        "fundingAmountMax": funding_max,
        "fundingCurrency": funding_currency,
        "eligibleCountries": eligible_countries,
        "eligibleApplicants": eligible_applicants,
        "institutionType": institution_type,
        "field": field_list,
        "application_link": application_link,
        "applicationLink": application_link,
        "checksum": checksum,
        "tags": tags,
        "createdAt": None,
        "updatedAt": None,
        "lastScrapedAt": now_iso()
    }

    # -- JSON-LD EXTRACTION --
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            import json
            data = json.loads(script.string)
            items = data.get("@graph", [data]) if isinstance(data, dict) else data
            
            for item in items:
                grant_obj = item.get("about") if item.get("@type") == "WebPage" else (item if item.get("@type") == "MonetaryGrant" else None)
                if grant_obj:
                    if grant_obj.get("validThrough"):
                        grant["applicationDeadline"] = str(grant_obj["validThrough"])
                    if grant_obj.get("amount", {}).get("maxValue"):
                        grant["fundingAmountMax"] = str(grant_obj["amount"]["maxValue"])
                    if grant_obj.get("amount", {}).get("currency"):
                        grant["fundingCurrency"] = grant_obj["amount"]["currency"]
                    if grant_obj.get("potentialAction", {}).get("target"):
                        grant["applicationLink"] = grant_obj["potentialAction"]["target"]
                        grant["application_link"] = grant_obj["potentialAction"]["target"]
        except Exception:
            pass

    return grant


def extract_from_row_text(title: str, text: str, url: str, meta=None):
    meta = meta or {}
    row_text = normalize_whitespace(text or "")
    title = normalize_whitespace(title or "")

    # Extract deadline from meta first, then fallback to text parsing
    application_deadline = None
    if meta.get("deadline"):
        application_deadline = parse_date(meta.get("deadline"))
    if not application_deadline:
        application_deadline = find_deadline(row_text)

    # Extract funding amount from meta first, then fallback to text parsing
    funding_currency, funding_min, funding_max = None, None, None
    if meta.get("amount"):
        funding_currency, funding_min, funding_max = parse_currency_and_amount(meta.get("amount"))
    if funding_currency is None and funding_min is None and funding_max is None:
        funding_currency, funding_min, funding_max = parse_currency_and_amount(row_text)
    # Also try extracting from title (e.g., "Fellowship - €75,000")
    if funding_currency is None and funding_min is None and title:
        funding_currency, funding_min, funding_max = parse_currency_and_amount(title)

    # Extract agency from meta first
    funding_agency = meta.get("agency")
    if not funding_agency:
        # Fallback: try to find in text
        lines = split_lines(row_text)
        for line in lines:
            lower = line.lower()
            if any(k in lower for k in ["agency", "sponsor", "funded by", "organization", "organisation"]):
                parts = line.split(":")
                if len(parts) > 1:
                    funding_agency = normalize_whitespace(parts[-1])
                    break

    # Extract program name from meta first
    program_name = meta.get("program")
    if not program_name:
        lines = split_lines(row_text)
        for line in lines:
            lower = line.lower()
            if any(k in lower for k in ["program", "programme", "scheme"]):
                parts = line.split(":")
                if len(parts) > 1:
                    program_name = normalize_whitespace(parts[-1])
                    break

    # Build description from available data
    description_parts = []
    if meta.get("eligibility"):
        description_parts.append(f"Eligibility: {meta.get('eligibility')}")
    if meta.get("duration"):
        description_parts.append(f"Duration: {meta.get('duration')}")
    if description_parts:
        description = " | ".join(description_parts)
        if row_text and len(row_text) > len(description):
            description = row_text[:2000]
    else:
        description = row_text[:2000] if row_text else None

    field_list = find_field(row_text)
    tags = build_tags(title, row_text, funding_agency, field_list)
    checksum = generate_checksum(f"{title}||{url}||{row_text}")

    return {
        "id": None,
        "grantTitle": title if title else filename_from_url(url),
        "fundingAgency": funding_agency,
        "programName": program_name,
        "description": description,
        "grantUrl": url,
        "applicationDeadline": application_deadline,
        "fundingAmountMin": funding_min,
        "fundingAmountMax": funding_max,
        "fundingCurrency": funding_currency,
        "eligibleCountries": find_eligible_countries(row_text),
        "eligibleApplicants": find_eligible_applicants(row_text),
        "institutionType": find_institution_type(row_text),
        "field": field_list,
        "application_link": url,
        "applicationLink": url,
        "checksum": checksum,
        "tags": tags,
        "createdAt": None,
        "updatedAt": None,
        "lastScrapedAt": now_iso()
    }


    
    return grant


def extract_from_pdf_stub(item: dict):
    url = item.get("url")
    title = item.get("title") or filename_from_url(url)
    snippet = item.get("snippet") or "PDF grant document"

    checksum = item.get("checksum") or generate_checksum(f"{title}||{url}")

    return {
        "id": None,
        "grantTitle": title,
        "fundingAgency": None,
        "programName": None,
        "description": snippet,
        "grantUrl": url,
        "applicationDeadline": None,
        "fundingAmountMin": None,
        "fundingAmountMax": None,
        "fundingCurrency": None,
        "eligibleCountries": [],
        "eligibleApplicants": [],
        "institutionType": [],
        "field": [],
        "application_link": url,
        "applicationLink": url,
        "checksum": checksum,
        "tags": build_tags(title, snippet, None, []),
        "createdAt": None,
        "updatedAt": None,
        "lastScrapedAt": now_iso()
    }


    
    return grant


def extract_grant_item(item):
    if not item:
        return None

    if item.get("html"):
        return extract_from_detail_html(item["html"], item["url"])

    if item.get("is_pdf"):
        return extract_from_pdf_stub(item)

    if item.get("snippet"):
        return extract_from_row_text(
            title=item.get("title"),
            text=item.get("snippet"),
            url=item.get("url"),
            meta=item.get("meta", {})
        )

    return None


def is_header_like_grant(grant):
    if not grant:
        return False

    title = normalize_whitespace(grant.get("grantTitle") or "")
    if not title:
        return False

    title_low = title.lower()
    header_titles = {
        "agency",
        "scheme",
        "program",
        "programme",
        "deadline",
        "eligibility",
        "duration",
        "amount",
        "grant",
    }
    if title_low in header_titles:
        return True

    desc = (grant.get("description") or "").lower()
    if "|" in desc and "agency" in desc and "deadline" in desc and "eligibility" in desc and len(title.split()) <= 2:
        return True

    return False


def extract_grant_items(items):
    grants = []
    seen = set()

    for item in items or []:
        parsed = extract_grant_item(item)
        if not parsed:
            continue

        # Handle both single grants and lists of grants (from listing pages)
        parsed_list = parsed if isinstance(parsed, list) else [parsed]
        
        for grant in parsed_list:
            if not grant:
                continue

            if is_header_like_grant(grant):
                continue
                
            # Filter out non-grant items
            title_text = (grant.get("grantTitle") or "").lower()
            desc_text = (grant.get("description") or "").lower()
            combined_text = title_text + " " + desc_text
            
            junk_titles = {
                "home", "about", "about us", "directory", "contact", "contact us", "vision", "mission", 
                "faq", "faqs", "sitemap", "disclaimer", "privacy policy", "terms of use", "policies",
                "anu \u0938\u0902\u0927\u093e\u0928 \u0928\u0947\u0936\u0928\u0932 \u0930\u093f\u0938\u0930\u094d\u091a \u092b\u093e\u0909\u0902\u0921\u0947\u0936\u0928 anusandhan national research foundation",
                "\u0905\u0928\u0941\u0938\u0902\u0927\u093e\u0928 \u0928\u0947\u0936\u0928\u0932 \u0930\u093f\u0938\u0930\u094d\u091a \u092b\u093e\u0909\u0902\u0921\u0947\u0936\u0928 anusandhan national research foundation",
                "anusandhan national research foundation", "\u0905\u0928\u0941\u0938\u0902\u0927\u093e\u0928 \u0928\u0947\u0936\u0928\u0932 \u0930\u093f\u0938\u0930\u094d\u091a \u092b\u093e\u0909\u0902\u0921\u0947\u0936\u0928",
                "anusandhan national research foundation (anrf)",
                "vision mission goals"
            }
            
            # Simple check if title is in junk titles or contains generic anrf headers
            title_lower = title_text.lower().strip(" -.")
            if any(j in title_lower for j in ["anusandhan national research foundation", "vision. mission.", "directory"]):
                continue
            if title_lower in junk_titles:
                continue
                
            clean_t = re.sub(r'[^a-zA-Z\s]', '', title_lower).strip()
            if clean_t in junk_titles:
                continue
                
            if "vision" in title_text and "mission" in title_text:
                continue

            target_keywords = ["grant", "funding", "fellow", "research support", "call for proposal", "scholarship", "scheme", "award", "support"]
            if not any(kw in combined_text for kw in target_keywords):
                continue
                
            # If the grant has NO deadline, NO amount, NO agency, AND title doesn't look like a grant, drop it as likely noise
            has_strong_data = grant.get("applicationDeadline") or grant.get("fundingAmountMin")
            if not has_strong_data and (grant.get("fundingAgency") and grant.get("fundingAgency").lower() not in ["directory", "vision.", "contact"]):
                has_strong_data = True
                
            if not has_strong_data and not is_probable_grant_title(grant.get("grantTitle")):
                continue
                
            key = grant.get("checksum") or grant.get("grantUrl")
            if not key or key in seen:
                continue

            # Check if eligibleCountries is empty, default to India
            if not grant.get("eligibleCountries"):
                grant["eligibleCountries"] = ["India"]
                
            # If applicationLink is missing but we see pdfs on the page/description
            if not grant.get("applicationLink") or not grant.get("application_link"):
                url = grant.get("grantUrl") or ""
                desc = grant.get("description") or ""
                if ".pdf" in url.lower() or "pdf" in desc.lower():
                    msg = f"Application documents are provided on {url}"
                    grant["applicationLink"] = msg
                    grant["application_link"] = msg

            # Generate random ID
            import uuid
            grant["id"] = str(uuid.uuid4())

            seen.add(key)
            grants.append(grant)

    return grants