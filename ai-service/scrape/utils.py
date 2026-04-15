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
        r"\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[\s,-]+\d{2,4}\b",
        r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?[\s,]+\d{2,4}\b",
        r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?[\s,]+\d{4}\b",
        r"\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)[\s,]+\d{4}\b"
    ]

    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            try:
                # Remove ordinal suffixes for parsing
                date_str = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', m.group(0))
                return date_parser.parse(date_str).isoformat()
            except Exception:
                pass
    return None


def parse_currency_and_amount(text: str):
    if not text:
        return None, None, None

    currency = None
    upper = text.upper()

    if "₹" in text or "INR" in upper or "RS" in upper or "RUPEES" in upper:
        currency = "INR"
    elif "$" in text or "USD" in upper:
        currency = "USD"
    elif "€" in text or "EUR" in upper:
        currency = "EUR"
    elif "£" in text or "GBP" in upper:
        currency = "GBP"

    def parse_num(raw):
        try:
            return float(raw.replace(",", ""))
        except Exception:
            return None

    def multiplier_for_suffix(suffix):
        if not suffix:
            return 1.0
        s = suffix.strip().lower()
        if s in {"k", "thousand"}:
            return 1_000.0
        if s in {"mn", "million"}:
            return 1_000_000.0
        if s in {"bn", "billion"}:
            return 1_000_000_000.0
        if s in {"lakh", "lakhs", "lac", "lacs"}:
            return 100_000.0
        if s in {"crore", "crores", "cr"}:
            return 10_000_000.0
        return 1.0

    range_patterns = [
        r"(?:₹|Rs\.?|INR|USD|\$|EUR|€|GBP|£)?\s*([\d,]+(?:\.\d+)?)\s*(k|mn|bn|thousand|million|billion|lakh|lakhs|lac|lacs|crore|crores|cr)?\s*(?:-|to|–|—)\s*(?:₹|Rs\.?|INR|USD|\$|EUR|€|GBP|£)?\s*([\d,]+(?:\.\d+)?)\s*(k|mn|bn|thousand|million|billion|lakh|lakhs|lac|lacs|crore|crores|cr)?",
    ]

    for pat in range_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if not m:
            continue

        matched_text = m.group(0)
        has_currency_marker = bool(re.search(r"(?:₹|Rs\.?|INR|USD|\$|EUR|€|GBP|£)", matched_text, re.IGNORECASE))
        has_suffix_marker = bool(m.group(2) or m.group(4))
        if not has_currency_marker and not has_suffix_marker:
            continue

        first = parse_num(m.group(1) or "")
        second = parse_num(m.group(3) or "")
        if first is None or second is None:
            continue

        first *= multiplier_for_suffix(m.group(2))
        second *= multiplier_for_suffix(m.group(4))
        if currency is None and (m.group(2) or m.group(4)):
            suffix_text = ((m.group(2) or "") + " " + (m.group(4) or "")).lower()
            if any(x in suffix_text for x in ["lakh", "lac", "crore", "cr"]):
                currency = "INR"
        return currency, min(first, second), max(first, second)

    single_patterns = [
        r"(?:₹|Rs\.?|INR|USD|\$|EUR|€|GBP|£)\s*([\d,]+(?:\.\d+)?)\s*(k|mn|bn|thousand|million|billion|lakh|lakhs|lac|lacs|crore|crores|cr)?",
        r"\b([\d,]+(?:\.\d+)?)\s*(k|mn|bn|thousand|million|billion|lakh|lakhs|lac|lacs|crore|crores|cr)\b",
    ]

    for pat in single_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if not m:
            continue

        first = parse_num(m.group(1) or "")
        if first is None:
            continue

        suffix = m.group(2) if len(m.groups()) >= 2 else ""
        first *= multiplier_for_suffix(suffix)
        
        if currency is None and suffix:
            suffix_text = suffix.lower()
            if any(x in suffix_text for x in ["lakh", "lac", "crore", "cr"]):
                currency = "INR"
        return currency, first, first

    return currency, None, None