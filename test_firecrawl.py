import requests
import json
url = "https://api.firecrawl.dev/v1/scrape"
headers = {"Authorization": "Bearer fc-02adebc8ff4b4d5e9c7c9dc7542576ab", "Content-Type": "application/json"}
payload = {
    "url": "https://www.startupgrantsindia.com/oshaughnessy-fellowships-and-grants-by-oshaughnessy-ventures-osv-367",
    "formats": ["extract"],
    "extract": {
        "schema": {
            "type": "object",
            "properties": {"grantTitle": {"type": "string"}, "fundingAgency": {"type": "string"}}
        }
    }
}
resp = requests.post(url, headers=headers, json=payload)
print(resp.status_code)
print(json.dumps(resp.json(), indent=2))
