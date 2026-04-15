with open("/Users/divansingh/Documents/FundSphere/ai-service/scrape/extractor.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
in_dict = False
for i, line in enumerate(lines):
    if 'return {' in line and 'tags:' in lines[min(i-2, len(lines)-1)] and 'createdAt:' in lines[max(i+18, 0)]:
        new_lines.append(line.replace('return {', 'grant = {'))
        in_dict = True
    elif in_dict and '}' in line and '"lastScrapedAt"' in lines[i-1]:
        new_lines.append(line)
        new_lines.append("""
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
""")
        in_dict = False
    else:
        new_lines.append(line)

with open("/Users/divansingh/Documents/FundSphere/ai-service/scrape/extractor.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
