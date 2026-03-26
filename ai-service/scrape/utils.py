import re
import hashlib
from datetime import datetime
from dateutil import parser as date_parser


def generate_checksum(text: str) -> str:
    if not text:
        return ""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def now_iso():
    return datetime.utcnow().isoformat()


def clean_text(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def clean_list(items):
    seen = set()
    out = []
    for item in items:
        if not item:
            continue
        val = clean_text(item)
        if val and val.lower() not in seen:
            seen.add(val.lower())
            out.append(val)
    return out


def parse_date(text: str):
    if not text:
        return None

    patterns = [
        r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
        r"\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b",
        r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b"
    ]

    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                return date_parser.parse(m.group(0)).isoformat()
            except Exception:
                pass
    return None


def parse_currency_and_amount(text: str):
    if not text:
        return None, None, None

    currency = None
    upper = text.upper()

    if "₹" in text or "INR" in upper:
        currency = "INR"
    elif "$" in text or "USD" in upper:
        currency = "USD"
    elif "€" in text or "EUR" in upper:
        currency = "EUR"
    elif "£" in text or "GBP" in upper:
        currency = "GBP"

    # better controlled amount extraction
    amount_patterns = [
        r"(?:₹|INR|USD|\$|EUR|€|GBP|£)\s*([\d,]+(?:\.\d+)?)\s*(?:-|to)\s*(?:₹|INR|USD|\$|EUR|€|GBP|£)?\s*([\d,]+(?:\.\d+)?)",
        r"(?:₹|INR|USD|\$|EUR|€|GBP|£)\s*([\d,]+(?:\.\d+)?)"
    ]

    for pat in amount_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            try:
                first = float(m.group(1).replace(",", ""))
                second = None
                if len(m.groups()) > 1 and m.group(2):
                    second = float(m.group(2).replace(",", ""))
                if second is None:
                    return currency, first, first
                return currency, min(first, second), max(first, second)
            except Exception:
                pass

    return currency, None, None