import re
with open("/Users/divansingh/Documents/FundSphere/ai-service/scrape/scrape.py", "r") as f:
    code = f.read()

new_code = code.replace(
    "results.extend(collect_inline_grants(page_html, page_url))",
    'if not re.search(r"id=[\'\\\"]funding\\d+", page_html, re.I):\n            results.extend(collect_inline_grants(page_html, page_url))'
)

with open("/Users/divansingh/Documents/FundSphere/ai-service/scrape/scrape.py", "w") as f:
    f.write(new_code)
