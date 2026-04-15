import re
with open("/Users/divansingh/Documents/FundSphere/ai-service/scrape/scrape.py", "r", encoding="utf-8") as f:
    text = f.read()

# Replace definition
text = text.replace("def page_looks_like_listing(html_text):", "def page_looks_like_listing(html_text, url=\"\"):\n    from urllib.parse import urlparse\n    if url:\n        p = urlparse(url).path.lower()\n        if p in [\"\", \"/\"] or p.startswith(\"/type/\") or p.startswith(\"/industry/\") or p.startswith(\"/state/\"):\n            return True")

# Replace calls
text = text.replace("page_looks_like_listing(homepage_html)", "page_looks_like_listing(homepage_html, homepage)")
text = text.replace("page_looks_like_listing(html)", "page_looks_like_listing(html, url)")

with open("/Users/divansingh/Documents/FundSphere/ai-service/scrape/scrape.py", "w", encoding="utf-8") as f:
    f.write(text)

print("done")
