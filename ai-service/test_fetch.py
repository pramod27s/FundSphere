import sys
from bs4 import BeautifulSoup
sys.path.append("/Users/divansingh/Documents/FundSphere/ai-service")
from scrape.scrape import fetch
from scrape.extractor import parse_grants_from_funding_sections
resp = fetch("https://serb.gov.in/page/english/awards_fellowship")
html = resp.get("html") if isinstance(resp, dict) else resp

if html:
    soup = BeautifulSoup(html, "lxml")
    grants = parse_grants_from_funding_sections(soup, "https://serb.gov.in/page/english/awards_fellowship")
    for g in grants:
        print(g["grantTitle"], "|", g["fundingAmountMin"])
