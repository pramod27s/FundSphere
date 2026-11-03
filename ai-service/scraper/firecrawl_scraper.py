from __future__ import annotations

import os
import re
import requests
import json
import uuid
import hashlib
import logging
import random
import time
from datetime import datetime
import sys

from pathlib import Path
from dotenv import load_dotenv

# Load .env from parent directory (ai-service/.env) or fallback to local
_parent_env = Path(__file__).resolve().parent.parent / ".env"
if _parent_env.exists():
    load_dotenv(dotenv_path=_parent_env)
else:
    load_dotenv()

# Force UTF-8 for output to avoid charmap codec errors in Windows terminals
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")

# Firecrawl can fail transiently (504, 502, connection reset, timeout). We retry
# only on those — never on 4xx, which are deterministic client errors that won't
# improve with another attempt.
FIRECRAWL_MAX_RETRIES = int(os.getenv("FIRECRAWL_MAX_RETRIES", "3"))
FIRECRAWL_BACKOFF_BASE = float(os.getenv("FIRECRAWL_BACKOFF_BASE", "1.0"))
FIRECRAWL_TIMEOUT_SECONDS = int(os.getenv("FIRECRAWL_TIMEOUT_SECONDS", "60"))


FIRECRAWL_CREDIT_USAGE_URL = "https://api.firecrawl.dev/v1/team/credit-usage"
# Our scrape uses JSON (LLM) extraction: 1 credit + 4 for the JSON format.
CREDITS_PER_EXTRACTION = 5

# --- Link discovery on listing pages -----------------------------------------
# A listing seed whose plain HTML has no grant links is usually built by
# JavaScript (DST, MeitY). Discovery then asks Firecrawl for the page after its
# script has run: a plain scrape, 1 credit. Capped per seed, so a site whose
# listing is simply empty costs at most this much a day.
DISCOVERY_RENDER = os.getenv("DISCOVERY_RENDER", "true").strip().lower() not in ("false", "0", "no")
CREDITS_PER_RENDER = 1
MAX_RENDERS_PER_SEED = int(os.getenv("DISCOVERY_MAX_RENDERS", "2"))
# A listing's next pages followed (page 1 counts), and category pages
# ("Schemes", "Fellowships") opened from a seed.
MAX_LISTING_PAGES = int(os.getenv("DISCOVERY_MAX_PAGES", "3"))
MAX_CATEGORY_PAGES = int(os.getenv("DISCOVERY_MAX_CATEGORIES", "8"))
# Pause between page fetches during discovery, so a seed's pages aren't
# requested back to back.
DISCOVERY_DELAY_SECONDS = float(os.getenv("DISCOVERY_DELAY_SECONDS", "1.0"))


class FirecrawlCreditsExhausted(RuntimeError):
    """Every configured Firecrawl key is out of credits."""


def _mask(key: str) -> str:
    return f"...{key[-4:]}"


def _configured_firecrawl_keys() -> list[str]:
    """FIRECRAWL_API_KEY plus FIRECRAWL_API_KEYS (comma-separated), de-duplicated, in order."""
    keys: list[str] = []
    for key in [os.getenv("FIRECRAWL_API_KEY", "")] + os.getenv("FIRECRAWL_API_KEYS", "").split(","):
        key = key.strip()
        if key and key not in keys:
            keys.append(key)
    return keys


class FirecrawlKeyPool:
    """Spreads extractions over several Firecrawl keys.

    A key that answers 402 (insufficient_credits) is retired for the rest of
    the process and the request is retried on the next key. When every key
    is retired, current() raises FirecrawlCreditsExhausted so the caller can
    stop paying instead of failing page after page.
    """

    def __init__(self, keys: list[str]):
        self._keys = list(keys)
        self._retired: set[str] = set()

    def refresh(self) -> list[dict]:
        """Read each key's balance (a free call), retire empty keys, and order
        the rest so credits that reset soonest are spent first (unused
        credits are lost at the reset). Returns masked info for logging."""
        report = []
        for key in self._keys:
            info = {"key": _mask(key), "remaining": None, "resets": None}
            try:
                response = requests.get(FIRECRAWL_CREDIT_USAGE_URL,
                                        headers={"Authorization": f"Bearer {key}"}, timeout=15)
                data = response.json().get("data", {}) if response.ok else {}
                info["remaining"] = data.get("remaining_credits")
                info["resets"] = (data.get("billing_period_end") or "")[:10] or None
            except Exception as exc:
                info["error"] = str(exc)[:120]
            if info["remaining"] is not None and info["remaining"] < CREDITS_PER_EXTRACTION:
                self._retired.add(key)
            report.append((key, info))
        report.sort(key=lambda pair: (pair[1]["resets"] is None, pair[1]["resets"] or ""))
        self._keys = [key for key, _ in report]
        return [info for _, info in report]

    def current(self) -> str:
        if not self._keys:
            raise RuntimeError("Set FIRECRAWL_API_KEY or FIRECRAWL_API_KEYS to call Firecrawl")
        for key in self._keys:
            if key not in self._retired:
                return key
        raise FirecrawlCreditsExhausted("All Firecrawl keys are out of credits")

    def retire(self, key: str) -> None:
        self._retired.add(key)


FIRECRAWL_KEYS = FirecrawlKeyPool(_configured_firecrawl_keys())


def _fetch_html(url: str, timeout: int = 15) -> str | None:
    """Lightweight HTML fetch for the local crawler.

    Replaces the previous `from scrape.scrape import fetch, fetch_selenium`
    dependency (that module didn't exist in the repo, so the crawler was
    silently returning zero candidates). Uses curl_cffi for TLS impersonation
    so Cloudflare-protected pages still work, with a plain-requests fallback
    if curl_cffi is unavailable.

    Returns the HTML body on success, None on any failure (caller decides).
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    try:
        from curl_cffi import requests as cffi_requests
        response = cffi_requests.get(
            url, headers=headers, impersonate="chrome120", timeout=timeout
        )
        if 200 <= response.status_code < 300 and response.text:
            return response.text
        logger.warning("curl_cffi fetch %s returned status %s", url, response.status_code)
    except Exception as exc:
        logger.warning("curl_cffi fetch failed for %s: %s", url, exc)

    # Last-resort fallback: plain requests. Some hosts will refuse without TLS
    # impersonation, but for hosts that don't care it's good enough.
    try:
        response = requests.get(url, headers=headers, timeout=timeout)
        if response.status_code == 200 and response.text:
            return response.text
    except Exception as exc:
        logger.warning("plain requests fetch failed for %s: %s", url, exc)

    return None

# The schema definition we want Firecrawl to strictly extract for us
GRANT_SCHEMA = {
    "type": "object",
    "properties": {
        # Gate against listing / index / home pages: the model must otherwise
        # fill grantTitle + fundingAgency, so without this a page listing 20
        # calls gets saved as one made-up "grant".
        "isSingleGrant": {"type": "boolean", "description": "true ONLY if this page (or the #fragment section of it, if the URL has one) describes ONE specific funding opportunity — one grant, fellowship, award, scheme or call. false for listing/index pages, home pages, category pages, news feeds, or pages that link to several calls without detailing one."},
        "grantTitle": {"type": "string", "description": "Title of the grant or fellowship"},
        "fundingAgency": {"type": "string", "description": "The organization providing the funding"},
        "programName": {"type": ["string", "null"], "description": "Specific program name, if applicable"},
        "description": {
            "type": "string",
            "description": "A detailed 4-6 sentence summary covering: core objective, type of research/project funded, intended impact, and any unique aspects. Never 1-2 sentences."
        },
        "applicationDeadline": {"type": ["string", "null"], "description": "Deadline in ISO format if possible, else text. Return null if not strictly found."},
        "deadlineType": {"type": "string", "description": "How applications close. FIXED: a specific closing date is given. ROLLING: the page explicitly says applications are accepted throughout the year, at any time, or on a rolling/continuous basis. CALL_BASED: the scheme opens through periodic or annual calls for proposals and no current closing date is given. UNKNOWN: the page does not say, or the page marks the opportunity as closed (even if it mentions rolling applications). A question in an FAQ ('Can I apply throughout the year?') is not evidence; use its answer."},
        "fundingAmountMin": {"type": ["string", "null"], "description": "Minimum funding amount. Must extract if present (e.g. '$10,000', '10 Lakhs', 'Rs. 10,00,000')."},
        "fundingAmountMax": {"type": ["string", "null"], "description": "Maximum funding amount. Must extract if present (e.g. '$50,000', '50 Lakhs', '80 lakh', '50%'). Look for limits, caps, per month/year budgets, or percentages."},
        "fundingCurrency": {"type": ["string", "null"]},
        "eligibleCountries": {"type": "array", "items": {"type": "string"}, "description": "Array of country names. Keep concise."},
        "eligibleApplicants": {"type": "array", "items": {"type": "string"}, "description": "Applicant types including degrees (e.g. PhD, MS, B.Tech) and positions (e.g. Postdoc, Researcher, Student, Faculty, Startup). Keep concise."},
        "institutionType": {"type": "array", "items": {"type": "string"}, "description": "e.g. Government, Private, Startup. Keep concise."},
        "field": {"type": "array", "items": {"type": "string"}, "description": "e.g. AI, Healthcare, Biotechnology"},
        "applicationLink": {"type": ["string", "null"], "description": "Direct URL or mailto link to apply"},
        "tags": {"type": "array", "items": {"type": "string"}, "description": "Keywords related to this grant"},

        # --- NEW SEMANTIC RAG FIELDS ---
        # Improves RAG by matching exact stated goals against user queries
        "objectives": {"type": ["string", "null"], "description": "Full stated objectives or goals of the grant program, closely paraphrased or copied from the page text."},
        # Improves RAG by filtering out irrelevant queries based on allowed use of funds
        "fundingScope": {"type": ["string", "null"], "description": "What expenses or activities the grant covers or excludes — e.g., equipment, salaries, travel, overheads, conference attendance, prototype development, indirect costs."},
        # Improves RAG by ensuring user constraints (e.g. nationality, degree) match exact rules
        "eligibilityCriteria": {"type": ["string", "null"], "description": "ALL detailed eligibility rules — degree level, nationality, institution type, age limits, prior publication requirements, co-PI conditions, industry collaboration requirements."},
        # Improves RAG by letting users search for grants prioritizing specific values (e.g. 'societal impact')
        "selectionCriteria": {"type": ["string", "null"], "description": "How applications are evaluated — scientific merit, innovation, societal impact, panel review process, scoring rubric if mentioned."},
        # Improves RAG by allowing length-based matching if specified
        "grantDuration": {"type": ["string", "null"], "description": "Duration of the funded project e.g. '1 year', '3 years', 'up to 36 months'."},
        # Improves RAG by providing dense, high-value keyword targets for vector search instead of broad domains
        "researchThemes": {"type": ["array", "null"], "items": {"type": "string"}, "description": "Specific research sub-domains and focus areas — prefer granular themes like 'Computer Vision for Agriculture' or 'Rural Healthcare AI' over broad terms like just 'AI' or 'Healthcare'."},

        # --- STRUCTURED ELIGIBILITY CONSTRAINTS ---
        # Parsed out of the eligibility text so the recommender can apply hard
        # filters (PhD requirement, minimum experience, citizenship) instead of
        # relying on fuzzy text matching alone.
        "requiresPhd": {"type": ["boolean", "null"], "description": "true ONLY if a completed PhD/doctorate is explicitly required to apply. false if the text explicitly allows non-PhD applicants (students, Master's, etc.). null if not stated."},
        "minExperienceYears": {"type": ["integer", "null"], "description": "Minimum years of professional/research experience required to apply, as an integer. null if not stated."},
        "citizenshipRequired": {"type": ["array", "null"], "items": {"type": "string"}, "description": "Country/nationality names the applicant MUST hold citizenship of to be eligible (distinct from where the work happens). Empty/null if there is no citizenship restriction."},

        # --- FUNDING MECHANISM + CAREER-STAGE TARGETING ---
        # Lets the recommender match the researcher's preferred grant type and
        # career stage, instead of relying on fuzzy text overlap.
        "grantType": {"type": ["string", "null"], "description": "The funding mechanism, normalized to ONE of: 'Research Grant', 'Fellowship', 'Travel Grant', 'Scholarship', 'Startup Funding', 'Equipment Grant', 'Conference/Seminar Grant', 'Other'. Pick the closest match to how the call describes itself. null if genuinely unclear."},
        "targetCareerStages": {"type": ["array", "null"], "items": {"type": "string"}, "description": "Career stages the grant is aimed at, e.g. ['PhD Student', 'Postdoc', 'Early Career', 'Mid Career', 'Senior', 'Faculty']. Use ['Any'] if explicitly open to all stages. Empty/null if the call does not restrict or mention career stage."},

        # --- KEY DATES (beyond the main application deadline) ---
        # Power a timeline / "opens in 2 weeks" display. ISO 8601 where possible.
        "openingDate": {"type": ["string", "null"], "description": "Date applications OPEN / the call goes live. ISO format (YYYY-MM-DD) if possible. null if not stated."},
        "loiDeadline": {"type": ["string", "null"], "description": "Letter of Intent / pre-proposal / concept-note deadline, if the program has a two-stage process. ISO format if possible. null if not stated."},
        "decisionDate": {"type": ["string", "null"], "description": "Date results / award decisions are announced or applicants are notified. ISO format if possible. null if not stated."},
        "projectStartDate": {"type": ["string", "null"], "description": "Expected project / funding start date for awarded grants. ISO format if possible. null if not stated."}
    },
    "required": ["isSingleGrant", "grantTitle", "fundingAgency", "description"]
}

# Fields that define a grant's *content*. The checksum is derived from these so
# that ANY meaningful change (deadline, funding amount, eligibility, scope, …)
# flips the checksum and forces CoreBackend to update the stored record.
#
# Previously the checksum was sha256(title-agency), which meant a grant whose
# deadline or amount changed — but whose title/agency stayed the same — was
# re-scraped (paying Firecrawl) and then silently discarded by CoreBackend as
# "unchanged". Hashing the actual content fields fixes that staleness bug.
_CHECKSUM_FIELDS = (
    "grantTitle", "fundingAgency", "programName", "description",
    "applicationDeadline", "fundingAmountMin", "fundingAmountMax",
    "fundingCurrency", "eligibleCountries", "eligibleApplicants",
    "institutionType", "field", "applicationLink", "tags",
    "objectives", "fundingScope", "eligibilityCriteria",
    "selectionCriteria", "grantDuration", "researchThemes",
    "requiresPhd", "minExperienceYears", "citizenshipRequired",
    "grantType", "targetCareerStages",
    "openingDate", "loiDeadline", "decisionDate", "projectStartDate",
)


def _normalize_for_checksum(value) -> str:
    """Stable, whitespace/order-insensitive string form of a field value."""
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        # Order-insensitive: a re-ordered list isn't a content change.
        items = sorted(_normalize_for_checksum(v) for v in value)
        return "|".join(i for i in items if i)
    return " ".join(str(value).strip().lower().split())


def _compute_content_checksum(extract: dict) -> str:
    """SHA-256 over the normalized content fields (see _CHECKSUM_FIELDS)."""
    parts = [f"{k}={_normalize_for_checksum(extract.get(k))}" for k in _CHECKSUM_FIELDS]
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()


def _firecrawl_post(url: str, payload: dict) -> requests.Response | None:
    """POST to Firecrawl with bounded retries on transient failures.

    Retries on:
      - 5xx responses (server errors are usually transient)
      - 429 rate-limit (with the Retry-After hint when provided)
      - Connection errors / read timeouts
    Does NOT retry on 4xx (other than 429) — those are deterministic and
    won't improve with another attempt.

    Returns the final Response (success or non-retryable failure) or None
    if all retries were exhausted with transport errors. A 402 (key out of
    credits) switches to the next key without using up a retry; raises
    FirecrawlCreditsExhausted once no key has credits left.
    """
    last_exc: Exception | None = None
    attempt = 0
    while attempt < FIRECRAWL_MAX_RETRIES:
        key = FIRECRAWL_KEYS.current()
        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        attempt += 1
        try:
            response = requests.post(
                "https://api.firecrawl.dev/v1/scrape",
                headers=headers,
                json=payload,
                timeout=FIRECRAWL_TIMEOUT_SECONDS,
            )
        except (requests.ConnectionError, requests.Timeout) as exc:
            last_exc = exc
            sleep_for = _backoff_seconds(attempt)
            print(f"[!] Firecrawl transport error (attempt {attempt}/{FIRECRAWL_MAX_RETRIES}): {exc}. Retrying in {sleep_for:.1f}s...")
            time.sleep(sleep_for)
            continue

        if response.status_code == 402:
            # This key is out of credits: retire it and retry on the next one.
            FIRECRAWL_KEYS.retire(key)
            print(f"[!] Firecrawl key {_mask(key)} is out of credits; switching to the next key.")
            attempt -= 1  # a key switch isn't a failed attempt
            continue

        if response.status_code < 500 and response.status_code != 429:
            # Either success or a deterministic 4xx — return as-is.
            return response

        # Retryable: 5xx or 429.
        if response.status_code == 429:
            retry_after = _parse_retry_after(response.headers.get("Retry-After"))
            sleep_for = retry_after if retry_after is not None else _backoff_seconds(attempt)
            print(f"[!] Firecrawl rate-limited (attempt {attempt}/{FIRECRAWL_MAX_RETRIES}). Sleeping {sleep_for:.1f}s...")
        else:
            sleep_for = _backoff_seconds(attempt)
            print(f"[!] Firecrawl {response.status_code} (attempt {attempt}/{FIRECRAWL_MAX_RETRIES}). Retrying in {sleep_for:.1f}s...")

        if attempt < FIRECRAWL_MAX_RETRIES:
            time.sleep(sleep_for)
        else:
            return response

    if last_exc is not None:
        print(f"[-] Firecrawl unreachable after {FIRECRAWL_MAX_RETRIES} attempts: {last_exc}")
    return None


def _backoff_seconds(attempt: int) -> float:
    """Exponential backoff with jitter: base * 2^(attempt-1) +/- 25%."""
    base = FIRECRAWL_BACKOFF_BASE * (2 ** (attempt - 1))
    return base * (0.75 + random.random() * 0.5)


def _parse_retry_after(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def scrape_grant(url):
    print(f"[*] Asking Firecrawl to extract schema from {url}...")

    payload = {
        "url": url,
        "formats": ["extract"],
        "extract": {
            "schema": GRANT_SCHEMA,
            "systemPrompt": "You are extracting data for a semantic RAG search engine. First decide 'isSingleGrant': true only when the page (or its #fragment section) describes one specific funding opportunity; false for listing, index, category or home pages that list several calls — in that case still return short placeholder strings for the required text fields. Richness and specificity of text matter far more than brevity. Strictly follow the schema. For 'description': Write a detailed 4-6 sentence summary. Explicitly forbidden to write 1-2 sentence summaries. For 'objectives': Copy or closely paraphrase the stated goals directly from the page. If a dedicated objectives section exists, use it fully. For 'eligibilityCriteria': Include ALL conditions found (degree, nationality, age, institution, prior work) — never truncate. For 'researchThemes': Extract specific sub-domains, not broad fields (e.g. prefer 'Quantum Error Correction' over 'Physics'). For 'fundingScope': List what is covered AND what is explicitly excluded if mentioned. If a value isn't found, use null or an empty array. Use null ONLY if genuinely not found. Never fabricate or hallucinate values. If the URL contains a #fragment, extract ONLY the grant matching that fragment. Ensure you find the exact funding amount; do not leave it null if the text mentions amounts like '10 Lakhs', '80 lakh', '50%', or 'Rs. 50,000'. Extensively search the text for any monetary limits, cost caps, overheads, or percentages awarded. In eligibleApplicants, explicitly include degrees (e.g. PhD, MS, B.Tech) and positions (e.g. Postdoc, Researcher) mentioned in the guidelines. For 'requiresPhd': set true ONLY when a completed PhD/doctorate is explicitly mandatory; set false when the text explicitly admits non-PhD applicants; use null when the requirement is unstated — never guess. For 'minExperienceYears': extract the minimum required years of experience as a plain integer only if explicitly stated, else null. For 'citizenshipRequired': list nationality/citizenship restrictions only (e.g. 'must be an Indian citizen' -> ['India']); leave empty when the call is open regardless of nationality. For 'grantType': choose the single closest mechanism from the allowed list (Research Grant, Fellowship, Travel Grant, Scholarship, Startup Funding, Equipment Grant, Conference/Seminar Grant, Other). For 'targetCareerStages': list the career stages addressed (e.g. 'open to early-career researchers within 5 years of PhD' -> ['Early Career']); use ['Any'] when explicitly open to all, and leave empty when unstated. For 'deadlineType': use ROLLING only when the page states applications are accepted year-round or on a rolling basis, CALL_BASED when it opens through periodic calls without a current date, otherwise FIXED (date given) or UNKNOWN. For the key dates ('openingDate', 'loiDeadline', 'decisionDate', 'projectStartDate'): extract each only if explicitly stated, preferring ISO format (YYYY-MM-DD); use null when a given date is not mentioned — never invent or guess dates. Your output will be directly embedded into a vector database. Richer, more specific text produces better search matches. Do not summarize aggressively."
        }
    }

    response = _firecrawl_post(url, payload)
    if response is None:
        return None

    if response.status_code == 200:
        data = response.json()
        if data.get("success") and "extract" in data.get("data", {}):
            extract = data["data"]["extract"]
            
            # Application deadline default value
            if not extract.get("applicationDeadline") or str(extract.get("applicationDeadline")).strip().lower() in ["null", "none"]:
                extract["applicationDeadline"] = "Not Specified"
                
            # A lone minimum is a single stated amount, so it's also the maximum.
            # A lone maximum is a cap ("up to ₹50 lakh"): leave the minimum
            # empty, or the UI would show "₹50 L – ₹50 L" as if it were fixed.
            min_amt = extract.get("fundingAmountMin")
            max_amt = extract.get("fundingAmountMax")
            if min_amt and not max_amt:
                extract["fundingAmountMax"] = min_amt
            
            # Fill in the system-managed fields required by our schema
            extract["id"] = str(uuid.uuid4())
            extract["grantUrl"] = url
            extract["application_link"] = extract.get("applicationLink")
            extract["createdAt"] = None
            extract["updatedAt"] = None
            extract["lastScrapedAt"] = datetime.utcnow().isoformat()
            
            # Content-derived checksum: any change to a meaningful field flips
            # it, so CoreBackend correctly updates the record instead of treating
            # a freshly re-extracted grant as "unchanged".
            extract["checksum"] = _compute_content_checksum(extract)
            
            return extract
        else:
            print("[-] Firecrawl extraction failed:", data)
    else:
        print(f"[-] API Error {response.status_code}: {response.text}")
    return None

# Per-domain CSS selectors for anchors that wrap a grant link. The crawler is
# otherwise generic (keyword scan over all <a> tags); this registry lets us add
# site-specific structure without hardcoding it into the crawl loop. Match is by
# domain substring, so "serb.gov.in" covers "www.serb.gov.in" too. Add a new
# site by appending an entry here — no other code change required.
SITE_LINK_SELECTORS: dict[str, list[str]] = {
    "serb.gov.in": ["a.awards_btn"],
}

# Keywords that mark an anchor's text as a likely grant link.
GRANT_LINK_KEYWORDS = [
    "grant", "fellowship", "award", "scheme", "fund", "scholarship",
    "support", "artificial intelligence", "conference", "seminar",
    "call for proposal",
]

# Link labels that say nothing about the target ("View", "Download (1.2 MB)",
# "Click here"). Indian government sites put the call's title in the table row
# or list item instead (ICMR's call list), so such links are judged by that text.
GENERIC_LINK_TEXT = re.compile(r"^(view|download|open document|click here|here|read more|more|details|pdf)\b", re.I)

# Notices that are not open calls: results and selection lists, amendments,
# administrative circulars, tenders and job adverts (UGC's notices are mostly
# these), plus the committee, report and media pages that the broader grant
# words below ("scheme", "programme", "fund") would otherwise let through.
NON_GRANT_LINK_TEXT = re.compile(
    r"\b(results?|list of selected|selected (candidates|proposals)|shortlisted|corrigendum|addendum|"
    r"circular|tender|vacanc(y|ies)|recruitment|dearness|committees?|minutes|annual reports?|"
    r"newsletters?|press releases?|gallery|user manual|manual for|regulations|list of eligible|"
    r"rti|right to information)\b",
    re.I,
)

# Link text that marks a likely call. Whole words, so "fund" doesn't match
# "refund" or "fundamental", and "award" doesn't match "awardees".
# Strong words name a call outright ("Call for Proposals", "Travel Grant",
# "Senior Fellowship"). Weak ones also name calls ("Seed Grant Scheme",
# "Startup Seed Fund", "Young Scientist Programme") but just as often a
# programme's general page, so their links rank after the strong ones: a
# seed's link budget goes to the clearest calls first.
STRONG_GRANT_LINK_TEXT = re.compile(
    r"\b(grants?|fellowships?|awards?|scholarships?|funding|"
    r"calls? for (research )?proposals?|calls? for applications?|calls? for nominations?|special calls?|"
    r"proposals invited|expression of interest)\b",
    re.I,
)


def _url_words(url: str) -> str:
    """A URL's path as words: "/pdf/User manual for new user registration.pdf",
    "/pdfnews/0064351_CIRCULAR_003.pdf", "/subpage/RTI-Act.aspx". Noise is
    often named only in the file name, behind a "Download" link."""
    from urllib.parse import unquote, urlparse
    return re.sub(r"[-_./]+", " ", unquote(urlparse(url).path))
WEAK_GRANT_LINK_TEXT = re.compile(r"\b(schemes?|programmes?|programs?|funds?)\b", re.I)

# Link text of a section worth opening from a seed to look for calls in.
CATEGORY_LINK_TEXT = re.compile(
    r"\b(grants?|fellowships?|scholarships?|schemes?|programmes?|programs?|funding|"
    r"opportunit(y|ies)|calls? for proposals?)\b",
    re.I,
)

# "Next" controls of a paginated listing: "Next", "Next »", "›", "Older posts".
# A doubled arrow ("»»") is usually "last page", so it isn't followed.
NEXT_LINK_TEXT = re.compile(r"^(next( page)?(\s*[»›>])?|[»›>]|older( posts| entries)?)$", re.I)
# Where a numbered page link carries its page number.
PAGE_IN_URL = re.compile(r"[?&](page|pg|p|paged|pageno|page_no|start|offset)=\d+|/page/\d+/?$", re.I)


# Pages that never hold a single grant: site chrome, machine endpoints
# (sitemaps, APIs, feeds), and non-grant sections. Matched against whole URL
# path segments, not substrings of the URL, so "call-for-proposals" pages and
# PDFs under /assets/ are kept: Firecrawl's /v1/scrape parses PDFs with the
# same schema, and many .gov.in calls are PDF-only.
NON_GRANT_PATH_SEGMENTS = {
    "contact", "contact-us", "contactus", "about", "about-us", "aboutus",
    "privacy", "privacy-policy", "terms", "terms-of-use", "terms-and-conditions",
    "login", "signin", "sign-in", "register", "signup", "sign-up",
    "faq", "faqs", "committee", "committees", "structure",
    "organisation-structure", "organization-structure",
    "sitemap", "sitemaps", "api", "feed", "rss",
    "events", "event", "blog", "careers", "career", "jobs", "job",
    "glossary", "calculators", "listingpage", "intranet",
}
# Video and social hosts linked from funder pages ("watch the webinar").
NON_GRANT_HOSTS = {
    "youtube.com", "youtu.be", "facebook.com", "twitter.com", "x.com",
    "linkedin.com", "instagram.com", "wa.me", "t.me",
    # UGC links its bank's fellowship disbursement portal (payments, not a grant).
    "scholarship.canarabank.bank.in", "scholarship.canarabank.in",
    # Fee payment (INSA) and government press releases (PIB): never a call.
    "onlinesbi.sbi.bank.in", "onlinesbi.sbi", "pib.gov.in",
}
# Words inside a segment that mark announcements of winners, circulars or
# photo pages, not open calls (e.g. "SF-Result-2026-27.pdf",
# "/result/announcement-award-...", "0064351_CIRCULAR_003.pdf", "/photo-gallery/...").
NON_GRANT_SEGMENT_WORDS = {"result", "results", "awardee", "awardees", "shortlisted", "circular", "gallery"}


def _is_non_grant_url(url: str) -> bool:
    from urllib.parse import parse_qs, urlparse
    parsed = urlparse(url)
    host = (parsed.netloc or "").lower().removeprefix("www.")
    if host in NON_GRANT_HOSTS:
        return True
    path = parsed.path.lower()
    if path.endswith(".xml") or "sitemap" in path:
        return True
    if "page" in parse_qs(parsed.query):  # paginated listing (?page=3)
        return True
    segments = [s for s in path.split("/") if s]
    if segments:
        segments[-1] = segments[-1].rsplit(".", 1)[0]  # "about-us.html" -> "about-us"
    for segment in segments:
        if segment in NON_GRANT_PATH_SEGMENTS:
            return True
        if NON_GRANT_SEGMENT_WORDS & set(re.split(r"[-_.]+", segment)):
            return True
    return False


def _join_link(base: str, href: str) -> str | None:
    """Absolute URL for an <a href>, or None if it can't be parsed (e.g. an
    email disguised as a link: "https://cc [at] icssr [dot] org")."""
    from urllib.parse import urljoin
    try:
        return urljoin(base, href.strip())
    except ValueError:
        return None


def _selectors_for(url: str) -> list[str]:
    from urllib.parse import urlparse
    host = (urlparse(url).netloc or "").lower()
    selectors: list[str] = []
    for domain, sels in SITE_LINK_SELECTORS.items():
        if domain in host:
            selectors.extend(sels)
    return selectors


def _safe_print(*args):
    """print() that survives Windows terminals without UTF-8."""
    try:
        print(*args)
    except UnicodeEncodeError:
        print(" ".join(str(a) for a in args).encode("utf-8", "ignore").decode("utf-8"))


_BINARY_EXTENSIONS = (".zip", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".gif")


def _grant_links_on_page(soup, current_url: str, known: set[str]) -> tuple[list[str], list[str]]:
    """Links on one page that look like single calls, in page order, as
    (strong, weak) by how clearly their text names a call. Anything in
    `known` (already found or already visited) is left out."""
    strong: list[str] = []
    weak: list[str] = []

    def keep(link: str | None, bucket: list[str]) -> bool:
        if link and link != current_url and link not in known and link not in strong and link not in weak:
            bucket.append(link)
            return True
        return False

    # Site-specific structured links (configured per domain). On sites with no
    # registered selectors this is skipped and the text scan below finds the links.
    for selector in _selectors_for(current_url):
        for a in soup.select(selector):
            # Title text: prefer a nested <div class="link"> (SERB-style
            # accordion), else fall back to the anchor's own text.
            link_div = a.find("div", class_="link")
            title_source = link_div if link_div is not None else a
            grant_title = title_source.get_text(strip=True).lower()
            if not grant_title or not any(kw in grant_title for kw in GRANT_LINK_KEYWORDS):
                continue
            href = a.get("href")
            # Same-page anchors ("#accordion") can't be scraped as their own
            # grant: the #fragment never reaches the server, so Firecrawl sees
            # the whole page and extracts its FIRST grant.
            if not href or href.startswith("#"):
                continue
            link = _join_link(current_url, href)
            if keep(link, strong):
                _safe_print(f"       Found structured grant target: {title_source.get_text(strip=True)} -> {link}")

    # Any link whose text names a call, with at least two words so bare menu
    # items ("Schemes", "Funding") aren't taken for one.
    for a in soup.find_all("a", href=True):
        if a["href"].startswith("#"):
            continue
        link = _join_link(current_url, a["href"])
        # javascript:, mailto: and tel: links can't be fetched
        if not link or not link.startswith(("http://", "https://")):
            continue
        if _is_non_grant_url(link) or link.lower().endswith(_BINARY_EXTENSIONS):
            continue  # PDFs are kept: many calls are PDF-only
        text = " ".join(a.get_text(" ", strip=True).split()).lower()
        if not text:
            continue
        if GENERIC_LINK_TEXT.match(text):
            # "View", "Download": the call's name is in the table row or list item.
            row = a.find_parent(["tr", "li"])
            if row is not None:
                text = " ".join(row.get_text(" ", strip=True).split())[:300].lower()
        if NON_GRANT_LINK_TEXT.search(text) or NON_GRANT_LINK_TEXT.search(_url_words(link)) or len(text.split()) < 2:
            continue
        if STRONG_GRANT_LINK_TEXT.search(text):
            bucket = strong
        elif WEAK_GRANT_LINK_TEXT.search(text):
            bucket = weak
        else:
            continue
        if keep(link, bucket):
            _safe_print(f"       Found explicit grant link: {text} -> {link}")

    return strong, weak


def _category_links(soup, current_url: str) -> list[str]:
    """Sections of a seed worth opening to look for calls in ("Schemes", "Fellowships")."""
    links: list[str] = []
    for a in soup.find_all("a", href=True):
        if a["href"].startswith("#"):
            continue
        link = _join_link(current_url, a["href"])
        text = " ".join(a.get_text(" ", strip=True).split())
        if (link and link.startswith("http") and link != current_url and link not in links
                and CATEGORY_LINK_TEXT.search(text) and not NON_GRANT_LINK_TEXT.search(text)
                and not _is_non_grant_url(link)):
            links.append(link)
    return links


def _next_page_url(soup, current_url: str, page_no: int) -> str | None:
    """The listing's next page on the same site: rel="next", a "Next" control,
    or the link numbered page_no + 1. None when there isn't one."""
    from urllib.parse import urldefrag, urlparse
    host = urlparse(current_url).netloc.lower()
    hrefs: list[str] = [tag.get("href") for tag in soup.select('a[rel~="next"], link[rel~="next"]')]
    for a in soup.find_all("a", href=True):
        text = " ".join(a.get_text(" ", strip=True).split()).lower()
        label = (a.get("aria-label") or a.get("title") or "").strip().lower()
        if NEXT_LINK_TEXT.match(text) or label.startswith("next"):
            hrefs.append(a["href"])
        elif text == str(page_no + 1) and PAGE_IN_URL.search(a["href"]):
            hrefs.append(a["href"])
    for href in hrefs:
        if not href or href.startswith(("#", "javascript:")):
            continue
        link = _join_link(current_url, href)
        if not link:
            continue
        link = urldefrag(link)[0]
        if urlparse(link).netloc.lower() == host and link != urldefrag(current_url)[0]:
            return link
    return None


def _render_html_with_firecrawl(url: str) -> str | None:
    """The page's HTML after its JavaScript has run, from a plain Firecrawl
    scrape (1 credit, no extraction). None if it can't be had."""
    try:
        response = _firecrawl_post(url, {"url": url, "formats": ["rawHtml"], "waitFor": 3000})
    except FirecrawlCreditsExhausted:
        print("       No Firecrawl credits left to render this page.")
        return None
    except RuntimeError as exc:  # no Firecrawl key configured
        print(f"       Can't render this page: {exc}")
        return None
    if response is None or response.status_code != 200:
        print(f"       Firecrawl couldn't render the page ({getattr(response, 'status_code', 'no response')}).")
        return None
    try:
        data = response.json().get("data", {})
    except ValueError:
        return None
    return data.get("rawHtml") or data.get("html")


def crawl_for_grants(start_url, max_required=8, render=True, stats=None):
    """Find single-call pages linked from a listing seed.

    Scans each page's links for call-like text, opens the seed's category links
    one level down ("Schemes", "Fellowships"), and follows each listing's next
    pages up to MAX_LISTING_PAGES. Links whose text clearly names a call come
    first; ones named only "Scheme", "Programme" or "Fund" fill what's left of
    the max_required * 2 budget. When the seed's plain HTML has no grant
    links, the page is probably built by JavaScript: it's fetched again through
    Firecrawl, which runs the script first (CREDITS_PER_RENDER each). Its
    category pages then get the same treatment, within MAX_RENDERS_PER_SEED.

    `render=False` (dry runs) spends nothing and only counts, in
    stats["would_render"], the pages a paid run would render; stats["renders"]
    counts the ones rendered.
    """
    print(f"[*] Crawling {start_url} to discover up to {max_required} valid grant pages...")
    render = render and DISCOVERY_RENDER
    stats = stats if stats is not None else {}
    visited: set[str] = set()
    queue = [(start_url, 0, 1)]  # (url, depth, page number within its listing)
    strong_links: list[str] = []
    weak_links: list[str] = []
    budget = max_required * 2
    categories_queued = 0
    renders = 0
    site_needs_render = False
    try:
        from bs4 import BeautifulSoup

        # Keep looking until there are enough clear calls; weak links only fill in.
        while queue and len(strong_links) < budget:
            current_url, depth, page_no = queue.pop(0)
            if current_url in visited:
                continue
            if visited and DISCOVERY_DELAY_SECONDS > 0:
                time.sleep(DISCOVERY_DELAY_SECONDS)
            visited.add(current_url)
            print(f"    -> Fetching {current_url} (Depth: {depth}, page {page_no})")

            page_html = _fetch_html(current_url)
            if not page_html:
                # Not rendered either: a site that refuses us is left alone.
                print(f"       Could not fetch {current_url} (skipping).")
                continue

            soup = BeautifulSoup(page_html, "lxml")
            known = set(strong_links) | set(weak_links) | visited
            strong, weak = _grant_links_on_page(soup, current_url, known)

            # No grant links in the plain HTML: on the seed, or on a site whose
            # seed needed it, look at the page once its JavaScript has run.
            is_seed = depth == 0 and page_no == 1
            if not (strong or weak) and (is_seed or site_needs_render):
                if not render:
                    stats["would_render"] = stats.get("would_render", 0) + 1
                    print(f"       No grant links in the plain HTML; a paid run would render it ({CREDITS_PER_RENDER} credit).")
                elif renders < MAX_RENDERS_PER_SEED:
                    renders += 1
                    print("       No grant links in the plain HTML; rendering it with Firecrawl...")
                    rendered = _render_html_with_firecrawl(current_url)
                    if rendered:
                        stats["renders"] = stats.get("renders", 0) + 1
                        soup = BeautifulSoup(rendered, "lxml")
                        strong, weak = _grant_links_on_page(soup, current_url, known)
                        site_needs_render = site_needs_render or is_seed
                        print(f"       Rendered: {len(strong) + len(weak)} grant links.")

            strong_links.extend(strong)
            weak_links.extend(weak)

            if is_seed:
                # A link can be both a candidate and a section to open ("Senior
                # Fellowships" may list several calls), so candidates are opened too.
                for link in _category_links(soup, current_url):
                    if categories_queued >= MAX_CATEGORY_PAGES:
                        break
                    if link not in visited and not any(q[0] == link for q in queue):
                        queue.append((link, 1, 1))
                        categories_queued += 1

            if page_no < MAX_LISTING_PAGES:
                next_url = _next_page_url(soup, current_url, page_no)
                if next_url and next_url not in visited and not any(q[0] == next_url for q in queue):
                    print(f"       Next page: {next_url}")
                    queue.append((next_url, depth, page_no + 1))

        found = (strong_links + weak_links)[:budget]
        print(f"[+] Crawler discovered {len(found)} candidate grant URLs "
              f"({len(strong_links)} clearly named, {len(weak_links)} scheme/programme/fund links).")
        return found

    except Exception as e:
        # Keep what was found before the error rather than losing the whole seed.
        print(f"[-] Local crawler encountered an error: {str(e)}")
        return (strong_links + weak_links)[:budget]

import argparse

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract grant data from a URL using Firecrawl.")
    parser.add_argument("url", help="The URL to scrape or map (e.g., https://example.com/grant or https://www.startupgrantsindia.com/)")
    parser.add_argument("--output", "-o", default="grants_firecrawl_output.json", help="Output JSON file path")
    parser.add_argument("--max", "-m", type=int, default=8, help="Maximum number of grants to extract")
    args = parser.parse_args()
    
    candidates = [args.url]
    # Heuristic: If it's a root domain or a listing page, invoke the crawler
    if args.url.count("/") <= 3 or "/type/" in args.url.lower() or "/industry/" in args.url.lower() or "page" in args.url.lower():
        candidates = crawl_for_grants(args.url, args.max)
        if not candidates:
            print("[-] No candidate links found. Falling back to scraping the original URL.")
            candidates = [args.url]
    
    scraped_data = []
    print(f"[*] Beginning extraction for up to {args.max} candidate pages...")
    for link in candidates:
        if len(scraped_data) >= args.max:
            break
            
        grant_data = scrape_grant(link)
        if grant_data and grant_data.get("isSingleGrant") is False:
            print(f"[-] {link} is not a single grant page (listing/index); skipped.")
            continue
        if grant_data and grant_data.get("grantTitle") and grant_data.get("fundingAgency"):
            # Optional: Check if we just hallucinated a dummy object that wasn't a grant
            # e.g., if grantTitle is something silly like "Terms of Service"
            if "terms" not in grant_data["grantTitle"].lower() and "privacy" not in grant_data["grantTitle"].lower():
                scraped_data.append(grant_data)
            
    if scraped_data:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(scraped_data, f, indent=2, ensure_ascii=False)
        print(f"[+] Saved {len(scraped_data)} grants to {args.output} matching schema!")
        # Print just the first one to console to keep it clean
        print(json.dumps(scraped_data[0], indent=2, ensure_ascii=False))
        if len(scraped_data) > 1:
            print(f"... and {len(scraped_data)-1} more grants.")
