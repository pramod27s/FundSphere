import sys
import re
from bs4 import BeautifulSoup
sys.path.append("/Users/divansingh/Documents/FundSphere/ai-service")
from scrape.scrape import fetch

resp = fetch("https://serb.gov.in/page/english/awards_fellowship")
html = resp.get("html") if isinstance(resp, dict) else resp
soup = BeautifulSoup(html, "lxml")
sections = soup.find_all(id=re.compile(r"^funding\d+$", re.I))

for sec in sections:
    title = None
    label_id = sec.get("aria-labelledby")
    if label_id:
        label_node = soup.find(id=label_id)
        if label_node:
            title = label_node.get_text(" ", strip=True)

    if not title:
        prev = sec.find_previous(["a", "button", "h2", "h3", "h4", "h5"])
        if prev:
            title = prev.get_text(" ", strip=True)

    print("Title:", repr(title))

    title_low = title.lower() if title else ""
    title_keep_hints = [
        "grant", "fellow", "research", "support", "mission",
        "programme", "program", "scheme", "award", "prize",
        "investigator", "excellence", "pair", "power", "matrics",
        "irg", "srg", "coe", "travel",
    ]
    if not any(k in title_low for k in title_keep_hints):
        print("  -> SKIPPED due to hints")
    else:
        text = sec.get_text(" ", strip=True)
        if len(text) < 80:
            print("  -> SKIPPED due to length < 80")
        else:
            print("  -> KEPT")

