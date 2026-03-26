from bs4 import BeautifulSoup
from urllib.parse import urljoin
import re

from .utils import generate_checksum, parse_date, parse_currency_and_amount, clean_text, clean_list, now_iso


def is_listing_page(soup):
    tables = soup.find_all("table")
    if tables:
        return True

    # many repeated links/cards often means listing
    links = soup.find_all("a", href=True)
    if len(links) >= 8:
        return True

    return False


def build_tags(title, agency, field_list, description):
    tags = []

    if title:
        for w in re.findall(r"[A-Za-z]{4,}", title):
            tags.append(w.lower())

    if agency:
        tags.append(agency.lower())

    for f in field_list or []:
        tags.append(f.lower())

    for kw in ["grant", "funding", "research", "fellowship", "scholarship", "innovation"]:
        if description and kw in description.lower():
            tags.append(kw)

    return clean_list(tags)[:15]


def parse_table_rows(soup, base_url):
    grants = []

    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if len(rows) <= 1:
            continue

        headers = []
        first_row = rows[0]
        ths = first_row.find_all(["th", "td"])
        headers = [clean_text(th.get_text(" ", strip=True)).lower() for th in ths]

        for tr in rows[1:]:
            cols = tr.find_all(["td", "th"])
            if not cols:
                continue

            row_map = {}
            for i, col in enumerate(cols):
                key = headers[i] if i < len(headers) else f"col_{i}"
                row_map[key] = clean_text(col.get_text(" ", strip=True))

            row_text = " | ".join(row_map.values())
            if len(row_text) < 10:
                continue

            title = None
            detail_url = None

            # first anchor in row
            a = tr.find("a", href=True)
            if a:
                title = clean_text(a.get_text(" ", strip=True))
                detail_url = urljoin(base_url, a["href"])

            if not title:
                # fallback to first non-empty column
                for val in row_map.values():
                    if val and len(val) > 5:
                        title = val
                        break

            deadline = None
            funding_currency = None
            funding_min = None
            funding_max = None
            funding_agency = None
            program_name = None

            for key, val in row_map.items():
                low = key.lower()
                if "deadline" in low or "last date" in low:
                    deadline = parse_date(val)
                elif "agency" in low or "sponsor" in low or "fund" in low:
                    funding_agency = val
                elif "program" in low or "scheme" in low:
                    program_name = val
                elif "amount" in low or "fund" in low or "grant value" in low:
                    funding_currency, funding_min, funding_max = parse_currency_and_amount(val)

            description = row_text[:1500]

            grant = {
                "id": None,
                "grantTitle": title,
                "fundingAgency": funding_agency,
                "programName": program_name,
                "description": description,
                "grantUrl": detail_url if detail_url else base_url,
                "applicationDeadline": deadline,
                "fundingAmountMin": funding_min,
                "fundingAmountMax": funding_max,
                "fundingCurrency": funding_currency,
                "eligibleCountries": [],
                "eligibleApplicants": [],
                "institutionType": [],
                "field": [],
                "application_link": detail_url,
                "checksum": generate_checksum(row_text),
                "tags": build_tags(title, funding_agency, [], description),
                "createdAt": None,
                "updatedAt": None,
                "lastScrapedAt": now_iso()
            }

            if grant["grantTitle"]:
                grants.append(grant)

    return grants


def parse_detail_page(soup, url):
    text = soup.get_text("\n", strip=True)

    title = None
    if soup.find("h1"):
        title = clean_text(soup.find("h1").get_text(" ", strip=True))
    elif soup.title:
        title = clean_text(soup.title.get_text(strip=True))

    description = None
    for p in soup.find_all("p"):
        ptxt = clean_text(p.get_text(" ", strip=True))
        if len(ptxt) > 80:
            description = ptxt[:2000]
            break

    application_link = None
    for a in soup.find_all("a", href=True):
        txt = clean_text(a.get_text(" ", strip=True)).lower()
        if any(k in txt for k in ["apply", "application", "submit", "register"]):
            application_link = urljoin(url, a["href"])
            break

    deadline = None
    for line in text.split("\n"):
        low = line.lower()
        if any(k in low for k in ["deadline", "last date", "closing date", "apply by"]):
            deadline = parse_date(line)
            if deadline:
                break

    funding_currency, funding_min, funding_max = parse_currency_and_amount(text)

    funding_agency = None
    for line in text.split("\n"):
        low = line.lower()
        if "funding agency" in low or "sponsor" in low or "funded by" in low:
            parts = line.split(":")
            if len(parts) > 1:
                funding_agency = clean_text(parts[-1])
                break

    field_list = []
    for kw in [
        "artificial intelligence", "computer science", "biotechnology",
        "health", "physics", "chemistry", "engineering",
        "life sciences", "environment", "agriculture", "robotics"
    ]:
        if kw in text.lower():
            field_list.append(kw.title())

    grant = {
        "id": None,
        "grantTitle": title,
        "fundingAgency": funding_agency,
        "programName": None,
        "description": description,
        "grantUrl": url,
        "applicationDeadline": deadline,
        "fundingAmountMin": funding_min,
        "fundingAmountMax": funding_max,
        "fundingCurrency": funding_currency,
        "eligibleCountries": [],
        "eligibleApplicants": [],
        "institutionType": [],
        "field": clean_list(field_list),
        "application_link": application_link,
        "checksum": generate_checksum(text),
        "tags": build_tags(title, funding_agency, field_list, description),
        "createdAt": None,
        "updatedAt": None,
        "lastScrapedAt": now_iso()
    }

    return [grant]


def extract_grants_from_html(html, url):
    soup = BeautifulSoup(html, "lxml")

    if is_listing_page(soup):
        table_grants = parse_table_rows(soup, url)
        if table_grants:
            return table_grants

    return parse_detail_page(soup, url)