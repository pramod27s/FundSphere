with open("/Users/divansingh/Documents/FundSphere/ai-service/scrape/extractor.py", "r", encoding="utf-8") as f:
    text = f.read()

replacement = """        "lastScrapedAt": now_iso()
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

    return grant"""

import re
# Just replace everything from `"lastScrapedAt": now_iso()\n    }` up to `def extract_from_row_text` with the replacement and 2 newlines
text = re.sub(r'        "lastScrapedAt": now_iso\(\)\s*\}\s*return grant\s*(def extract_from_row_text)', replacement + "\n\n\n\\1", text, flags=re.DOTALL)
text = re.sub(r'        "lastScrapedAt": now_iso\(\)\s*\}\s*(def extract_from_row_text)', replacement + "\n\n\n\\1", text, flags=re.DOTALL)

with open("/Users/divansingh/Documents/FundSphere/ai-service/scrape/extractor.py", "w", encoding="utf-8") as f:
    f.write(text)
print("done")
