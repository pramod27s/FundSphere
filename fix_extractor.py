import re
with open("/Users/divansingh/Documents/FundSphere/ai-service/scrape/extractor.py", "r", encoding="utf-8") as f:
    text = f.read()

# I want to find the return { ... } block around line 800 in `extract_from_detail_html`
# and replace it with:
# grant = { ... }
# (my JSON-LD)
# return grant

pattern = r'(return\s+\{\s*"id": None,\s*"grantTitle".*?"lastScrapedAt": now_iso\(\)\n\s+\})'

replacement = r"""grant = \1

    # -- JSON-LD EXTRACTION (StartupGrantsIndia & compatible) --
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
    # --------------------------------------------------------
    
    return grant"""

replacement = replacement.replace(r'grant = return {', r'grant = {')

text_new = re.sub(pattern, replacement, text, flags=re.DOTALL)

with open("/Users/divansingh/Documents/FundSphere/ai-service/scrape/extractor.py", "w", encoding="utf-8") as f:
    f.write(text_new)

print("did replacement:", text != text_new)
