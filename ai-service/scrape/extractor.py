from bs4 import BeautifulSoup
import re
from urllib.parse import urljoin, urlparse, unquote

from .utils import generate_checksum, parse_date, parse_currency_and_amount, clean_list, now_iso


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

    return safe_first_long_paragraph(soup)


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
    for line in lines:
        lower = line.lower()
        if any(k in lower for k in deadline_keywords):
            parsed = parse_date(line)
            if parsed:
                return parsed

    return None


def find_funding_info(text):
    lines = split_lines(text)

    keywords = [
        "funding", "amount", "award", "grant value", "budget",
        "support worth", "grant amount", "financial support"
    ]

    for line in lines:
        lower = line.lower()
        if any(k in lower for k in keywords):
            currency, mn, mx = parse_currency_and_amount(line)
            if currency or mn is not None or mx is not None:
                return currency, mn, mx

    return None, None, None


def find_funding_agency(soup, text):
    possible_labels = [
        "funding agency",
        "agency",
        "sponsor",
        "funded by",
        "organization",
        "organisation"
    ]

    lines = split_lines(text)
    for line in lines:
        lower = line.lower()
        for label in possible_labels:
            if label in lower:
                parts = line.split(":")
                if len(parts) > 1:
                    val = normalize_whitespace(parts[-1])
                    if val:
                        return val

    for a in soup.find_all(["h2", "h3", "strong", "b"]):
        txt = normalize_whitespace(get_text(a))
        if len(txt) < 100 and any(k in txt.lower() for k in ["foundation", "ministry", "agency", "department", "council"]):
            return txt

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
    countries = []
    lines = split_lines(text)
    for line in lines:
        lower = line.lower()
        if "eligible countries" in lower or "countries eligible" in lower:
            parts = line.split(":")
            if len(parts) > 1:
                countries.extend([x.strip() for x in parts[-1].split(",")])
    return clean_list(countries)


def find_eligible_applicants(text):
    result = []
    keywords = [
        "researchers", "faculty", "students", "scientists", "startups",
        "women", "entrepreneurs", "institutions", "universities", "ngo",
        "individuals", "applicants", "investigators", "scholars"
    ]

    lower_text = text.lower()
    for kw in keywords:
        if kw in lower_text:
            result.append(kw.title())

    return clean_list(result)


def find_institution_type(text):
    result = []
    keywords = [
        "university", "college", "research institute", "startup",
        "industry", "ngo", "government organization",
        "academic institution", "research organisation", "research organization"
    ]

    lower_text = text.lower()
    for kw in keywords:
        if kw in lower_text:
            result.append(kw.title())

    return clean_list(result)


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


def extract_from_detail_html(html: str, url: str):
    soup = BeautifulSoup(html, "lxml")
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
        "checksum": checksum,
        "tags": tags,
        "createdAt": None,
        "updatedAt": None,
        "lastScrapedAt": now_iso()
    }


def extract_from_row_text(title: str, text: str, url: str, meta=None):
    meta = meta or {}
    row_text = normalize_whitespace(text or "")
    title = normalize_whitespace(title or "")

    application_deadline = None
    if meta.get("deadline"):
        application_deadline = parse_date(meta.get("deadline"))
    if not application_deadline:
        application_deadline = find_deadline(row_text)

    funding_currency, funding_min, funding_max = None, None, None
    if meta.get("amount"):
        funding_currency, funding_min, funding_max = parse_currency_and_amount(meta.get("amount"))
    if funding_currency is None and funding_min is None and funding_max is None:
        funding_currency, funding_min, funding_max = parse_currency_and_amount(row_text)

    funding_agency = None
    program_name = None

    lines = split_lines(row_text)
    for line in lines:
        lower = line.lower()

        if not funding_agency and any(k in lower for k in ["agency", "sponsor", "funded by", "organization", "organisation"]):
            parts = line.split(":")
            if len(parts) > 1:
                funding_agency = normalize_whitespace(parts[-1])

        if not program_name and any(k in lower for k in ["program", "programme", "scheme"]):
            parts = line.split(":")
            if len(parts) > 1:
                program_name = normalize_whitespace(parts[-1])

    field_list = find_field(row_text)
    tags = build_tags(title, row_text, funding_agency, field_list)
    checksum = generate_checksum(f"{title}||{url}||{row_text}")

    return {
        "id": None,
        "grantTitle": title if title else filename_from_url(url),
        "fundingAgency": funding_agency,
        "programName": program_name,
        "description": row_text[:2000] if row_text else None,
        "grantUrl": url,
        "applicationDeadline": application_deadline,
        "fundingAmountMin": funding_min,
        "fundingAmountMax": funding_max,
        "fundingCurrency": funding_currency,
        "eligibleCountries": [],
        "eligibleApplicants": [],
        "institutionType": [],
        "field": field_list,
        "application_link": url,
        "checksum": checksum,
        "tags": tags,
        "createdAt": None,
        "updatedAt": None,
        "lastScrapedAt": now_iso()
    }


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
        "checksum": checksum,
        "tags": build_tags(title, snippet, None, []),
        "createdAt": None,
        "updatedAt": None,
        "lastScrapedAt": now_iso()
    }


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


def extract_grant_items(items):
    grants = []
    seen = set()

    for item in items or []:
        parsed = extract_grant_item(item)
        if not parsed:
            continue

        key = parsed.get("checksum") or parsed.get("grantUrl")
        if not key or key in seen:
            continue

        seen.add(key)
        grants.append(parsed)

    return grants