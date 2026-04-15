import re
with open("/Users/divansingh/Documents/FundSphere/ai-service/firecrawl_scraper.py", "r", encoding="utf-8") as f:
    text = f.read()

# Replace the exact systemPrompt text in the file.
text = re.sub(
    r'"systemPrompt":\s*".*?"',
    r'''"systemPrompt": "Extract grant and fellowship details strictly following the schema. If a value isn't found, use null or an empty array. If the URL contains a #fragment, extract ONLY the grant matching that fragment. Ensure you find the exact funding amount; do not leave it null if the text mentions amounts like '10 Lakhs', '80 lakh', '50%', or 'Rs. 50,000'. Extensively search the text for any monetary limits, cost caps, overheads, or percentages awarded. In eligibleApplicants, explicitly include degrees (e.g. PhD, MS, B.Tech) and positions (e.g. Postdoc, Researcher, Student, Faculty, Startup) mentioned in the guidelines."''',
    text
)

# And fix schema properties description
text = re.sub(
    r'"fundingAmountMin": \{.*?\}',
    r'"fundingAmountMin": {"type": ["string", "null"], "description": "Minimum funding amount. Must extract if present (e.g. \'$10,000\', \'10 Lakhs\', \'Rs. 10,00,000\')."}',
    text
)

text = re.sub(
    r'"fundingAmountMax": \{.*?\}',
    r'"fundingAmountMax": {"type": ["string", "null"], "description": "Maximum funding amount. Must extract if present (e.g. \'$50,000\', \'50 Lakhs\', \'80 lakh\', \'50%\'). Look for limits, caps, per month/year budgets, or percentages."}',
    text
)

with open("/Users/divansingh/Documents/FundSphere/ai-service/firecrawl_scraper.py", "w", encoding="utf-8") as f:
    f.write(text)

