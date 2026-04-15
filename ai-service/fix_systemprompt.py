import re

with open("/Users/divansingh/Documents/FundSphere/ai-service/firecrawl_scraper.py", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update min/max description
content = content.replace(
    '"fundingAmountMin": {"type": ["string", "null"], "description": "Minimum funding amount. Must extract if present (e.g. \'$10,000\', \'10 Lakhs\')."},',
    '"fundingAmountMin": {"type": ["string", "null"], "description": "Minimum funding amount. Must extract if present (e.g. \'$10,000\', \'10 Lakhs\', \'Rs. 10,00,000\')."},'
)
content = content.replace(
    '"fundingAmountMax": {"type": ["string", "null"], "description": "Maximum funding amount. Must extract if present (e.g. \'$50,000\', \'50 Lakhs\')."},',
    '"fundingAmountMax": {"type": ["string", "null"], "description": "Maximum funding amount. Must extract if present (e.g. \'$50,000\', \'50 Lakhs\', \'80 lakh\', \'50%\'). Look for limits, caps, per month/year budgets, or percentages."},'
)

# 2. Update systemPrompt
prompt_old = '"systemPrompt": "Extract grant and fellowship details strictly following the schema. If a value isn\'t found, use null or an empty array. Ensure you find the exact funding amount; do not leave it null if the text mentions amounts like \'10 Lakhs\' or \'$50,000\'. In eligibleApplicants, explicitly include degrees (e.g. PhD, MS, B.Tech) and positions (e.g. Postdoc, Researcher, Student, Faculty, Startup) mentioned in the guidelines."'
prompt_new = '"systemPrompt": "Extract grant and fellowship details strictly following the schema. If a value isn\'t found, use null or an empty array. If the URL contains a #fragment, extract ONLY the grant matching that fragment. Ensure you find the exact funding amount; do not leave it null if the text mentions amounts like \'10 Lakhs\', \'80 lakh\', \'50%\', or \'Rs. 50,000\'. Extensively search the text for any monetary limits, cost caps, overheads, or percentages awarded. In eligibleApplicants, explicitly include degrees (e.g. PhD, MS, B.Tech) and positions (e.g. Postdoc, Researcher, Student, Faculty, Startup) mentioned in the guidelines."'
content = content.replace(prompt_old, prompt_new)
if prompt_old not in content and prompt_new not in content:
    print("PROMPT NOT REPLACED. Check formatting.")

# 3. Update crawler to add fragments AND ignore proposals
# I'll use regex for these.
content = re.sub(
    r'grant_keywords = \["fellowship", "research grant", "award", "scholarship", "proposals", "funding"\]',
    r'grant_keywords = ["fellowship", "research grant", "award", "scholarship", "funding"]',
    content
)

content = content.replace(
    '"login", "register", "faq", "committee", "structure"]',
    '"login", "register", "faq", "committee", "structure", "proposal"]'
)

# 4. Also fix accordion loop to add the precise fragment URL instead of current_url
accordion_code_old = """                # Check if it acts as a tab toggler
                if href.startswith("#") and "accordion" not in a.get("class", []):
                    # We might extract the actual content directly, but to keep the scraping loop simple,
                    # we just add the current URL. But if all accordions are on the same page, we only need to scrape it once.
                    pass
                
                # Usually href might just be #accordion. If the content is on the same page, current_url is the one to scrape.
                # However, if there are multiple grants on this page, Firecrawl can extract them all if max is set, or we can just send the current page.
                
                # We will add it as a valid candidate and let the scraper handle the full page.
                if current_url not in valid_candidates:
                    valid_candidates.append(current_url)
                    print(f"       Found grant accordion on page: {link_div.text.strip()}")"""

accordion_code_new = """                # For fragments indicating specific grants (like #CRG), we append them as unique URLs so Firecrawl extracts each specific grant.
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
                    print(f"       Found grant accordion target: {link_div.text.strip()} -> {l}")"""
content = content.replace(accordion_code_old, accordion_code_new)

with open("/Users/divansingh/Documents/FundSphere/ai-service/firecrawl_scraper.py", "w", encoding="utf-8") as f:
    f.write(content)

print("Applied modifications to firecrawl_scraper.py")
