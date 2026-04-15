with open("/Users/divansingh/Documents/FundSphere/ai-service/scrape/extractor.py", "r", encoding="utf-8") as f:
    text = f.read()

bad_block = """    # -- JSON-LD EXTRACTION (StartupGrantsIndia & compatible) --
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
    # --------------------------------------------------------"""

text = text.replace(bad_block, "")
text = text.replace("grant = grant", "grant = {") # reverse if needed

# Now inject it ONLY after `tags = build_tags(grant_title, page_text, funding_agency, field_list)`
replacement = """    grant = {
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
""" + bad_block + "\n\n    return grant"

import re
pattern = r'return\s*\{\s*"id":\s*None,\s*"grantTitle":\s*grant_title,.*?lastScrapedAt":\s*now_iso\(\)\s*\}'
text = re.sub(pattern, replacement, text, flags=re.DOTALL, count=1)

with open("/Users/divansingh/Documents/FundSphere/ai-service/scrape/extractor.py", "w", encoding="utf-8") as f:
    f.write(text)
print("done")
