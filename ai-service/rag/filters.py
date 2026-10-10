import re
from datetime import datetime, timezone
from dateutil import parser as date_parser
from .config import settings
from .schemas import UserProfile


# Score for an eligibility component when the grant or the profile doesn't say:
# no evidence either way, so neither a match (1.0) nor a mismatch (0.0).
UNKNOWN_FIT = 0.5

_WORD_RE = re.compile(r"[a-z0-9]+")

# Query words with no topical signal: English filler plus vocabulary every
# grant shares ("looking for research grants" would otherwise match everything).
_STOP_WORDS = frozenset({
    "a", "about", "after", "all", "also", "an", "and", "any", "are", "as", "at",
    "be", "been", "but", "by", "can", "could", "do", "does", "for", "from",
    "get", "has", "have", "help", "how", "i", "if", "in", "into", "is", "it",
    "its", "me", "my", "need", "needs", "new", "no", "not", "of", "on", "or",
    "our", "so", "some", "such", "that", "the", "their", "them", "there",
    "these", "they", "this", "those", "to", "up", "us", "want", "was", "we",
    "what", "when", "where", "which", "who", "will", "with", "would", "you",
    "your", "looking", "find", "seeking", "search", "grant", "grants",
    "funding", "fund", "funds", "funded", "research", "opportunity",
    "opportunities", "support", "program", "programme", "programs",
    "programmes", "scheme", "schemes", "apply", "application", "applications",
})


COUNTRY_ALIASES = {
    "usa": "united states",
    "us": "united states",
    "u.s.": "united states",
    "u.s.a.": "united states",
    "united states of america": "united states",
    "america": "united states",
    "uk": "united kingdom",
    "u.k.": "united kingdom",
    "great britain": "united kingdom",
    "britain": "united kingdom",
    "england": "united kingdom",
    "in": "india",
    "republic of india": "india",
    "uae": "united arab emirates",
    "ksa": "saudi arabia",
    "prc": "china",
    "people's republic of china": "china",
    "south korea": "korea",
    "republic of korea": "korea",
    "all": "any",
    "any country": "any",
    "global": "any",
    "international": "any",
    "worldwide": "any",
}


# Keys include the values CoreBackend actually sends (humanized enums such as
# "Startup Company"); synonyms cover what scraped grants list ("startups",
# "scientists", "SMEs"). Labels compare with plurals folded (see _term).
APPLICANT_ALIASES = {
    "phd student": ["student", "doctoral", "graduate", "graduate student"],
    "postdoc": ["postdoctoral", "early-career researcher", "researcher"],
    "faculty": ["professor", "academic", "researcher", "principal investigator", "pi"],
    "professor": ["faculty", "academic", "principal investigator", "pi"],
    "researcher": ["faculty", "academic", "principal investigator", "pi", "scientist"],
    "startup": ["entrepreneur", "small business", "sme", "founder"],
    "ngo": ["non-profit", "non-governmental organization", "nonprofit"],
    "student": ["phd student", "graduate student", "doctoral student", "undergraduate student"],
    "professor faculty": ["professor", "faculty", "academic", "researcher", "scientist", "principal investigator", "pi"],
    "startup company": ["startup", "start up", "company", "entrepreneur", "founder", "small business", "sme", "business"],
    "nonprofit organization": ["ngo", "non-profit", "nonprofit", "non-governmental organization", "civil society organization"],
}


INSTITUTION_ALIASES = {
    "university": ["academic institution", "college", "higher education", "academic", "research institution"],
    "college": ["academic institution", "university", "higher education", "academic"],
    "academic institution": ["university", "college", "higher education", "academic"],
    "research institute": ["research institution", "research organization", "research organisation",
                           "r&d institution", "academic", "academic institution"],
    "government lab": ["government", "public", "public body", "national laboratory", "government institution"],
    "startup": ["small business", "sme", "early-stage", "private", "private sector", "company", "start up"],
    "industry": ["private", "private sector", "company", "business"],
    "ngo": ["non-profit", "non-governmental organization", "nonprofit", "civil society"],
    "hospital": ["healthcare institution", "medical institution"],
}


def _norm(value: str | None) -> str:
    if value is None:
        return ""
    v = " ".join(str(value).strip().lower().split())
    return COUNTRY_ALIASES.get(v, v)


def _norm_set(values) -> set[str]:
    if not values:
        return set()
    if isinstance(values, str):
        values = [values]
    out = set()
    for v in values:
        n = _norm(v)
        if n:
            out.add(n)
    return out


def _fold(word: str) -> str:
    """Crude plural folding ("networks" -> "network", "faculties" -> "faculty").
    Applied to both sides of every comparison, so it only has to be
    consistent, not linguistically correct."""
    if len(word) <= 3:
        return word
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"
    if word.endswith(("sses", "ches", "shes", "xes")):
        return word[:-2]
    if word.endswith("s") and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    return word


def _words(text) -> list[str]:
    return _WORD_RE.findall(str(text).lower())


def _term(value) -> str:
    """A short label's comparable form: lowercase words, punctuation dropped,
    plurals folded — "Researchers", "researcher" and "RESEARCHER" are equal."""
    return " ".join(_fold(w) for w in _words(value or ""))


def _label_aliases(value: str | None, alias_map: dict) -> set[str]:
    """`value` plus its synonyms, compared by _term. A canonical key brings
    in all its synonyms; a synonym brings in its canonical key."""
    base = _term(value)
    if not base:
        return set()
    out = {base}
    for canonical, synonyms in alias_map.items():
        synonym_terms = {_term(s) for s in synonyms}
        if _term(canonical) == base:
            out |= synonym_terms
        elif base in synonym_terms:
            out.add(_term(canonical))
    return out - {""}


def _expand_aliases(value: str | None, alias_map: dict) -> set[str]:
    if not value:
        return set()
    base = _norm(value)
    expanded = {base}
    extras = alias_map.get(base, [])
    if isinstance(extras, str):
        extras = [extras]
    for e in extras:
        expanded.add(_norm(e))
    # Reverse lookup: if value appears as a synonym, include the canonical key too
    for canonical, syns in alias_map.items():
        syn_set = {_norm(s) for s in (syns if isinstance(syns, list) else [syns])}
        if base in syn_set:
            expanded.add(_norm(canonical))
    return {x for x in expanded if x}


def deadline_is_open(deadline: str | None) -> bool:
    if not deadline:
        return True
    try:
        dt = date_parser.parse(deadline)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt >= datetime.now(timezone.utc)
    except Exception:
        return True


def _parse_date(value: str | None):
    if not value:
        return None
    try:
        dt = date_parser.parse(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def freshness_score(grant_fields: dict) -> float:
    """
    Composite freshness:
      0.6 * deadline-proximity score + 0.4 * scrape-recency score
    """
    now = datetime.now(timezone.utc)

    deadline_dt = _parse_date(grant_fields.get("application_deadline"))
    if deadline_dt is None:
        # Year-round schemes are always open to apply; unknown/call-based stay neutral.
        deadline_score = 1.0 if grant_fields.get("deadline_type") == "ROLLING" else 0.5
    else:
        days = (deadline_dt - now).days
        if days < 0:
            deadline_score = 0.0
        elif 7 < days < 90:
            deadline_score = 1.0
        elif 90 <= days < 180:
            deadline_score = 0.5
        elif days >= 180:
            deadline_score = 0.2
        else:
            # 0..7 days — very tight, still relevant but risky
            deadline_score = 0.6

    scrape_dt = _parse_date(grant_fields.get("last_scraped_at") or grant_fields.get("updated_at"))
    if scrape_dt is None:
        scrape_score = 0.5
    else:
        age = (now - scrape_dt).days
        if age < 7:
            scrape_score = 1.0
        elif age <= 30:
            scrape_score = 0.7
        else:
            scrape_score = 0.3

    return 0.6 * deadline_score + 0.4 * scrape_score


def funding_fit(profile: UserProfile, grant_fields: dict) -> float:
    """
    Range-overlap percentage. Returns 1.0 for perfect fit, 0.0 for no overlap,
    0.5 when either side is unspecified (neutral).
    """
    user_min = profile.preferredMinAmount
    user_max = profile.preferredMaxAmount
    grant_min = grant_fields.get("funding_amount_min")
    grant_max = grant_fields.get("funding_amount_max")

    if user_min is None and user_max is None:
        return 0.5
    if grant_min is None and grant_max is None:
        return 0.5

    g_lo = grant_min if grant_min is not None else 0.0
    g_hi = grant_max if grant_max is not None else max(g_lo, (user_max or 0.0)) * 2 or 1.0
    u_lo = user_min if user_min is not None else 0.0
    u_hi = user_max if user_max is not None else max(u_lo, g_hi)

    overlap = min(g_hi, u_hi) - max(g_lo, u_lo)
    if overlap <= 0:
        return 0.0

    user_range = max(u_hi - u_lo, 1.0)
    return max(0.0, min(1.0, overlap / user_range))


def _match_strength(profile_value: str | None, grant_values, alias_map: dict) -> float:
    """Exact 1.0, alias 0.7, mismatch 0.0; UNKNOWN_FIT when either side is
    empty. Labels compare by _term, so the profile's "Researcher" matches a
    grant's "researchers" exactly and "Startup Company" matches "startups"
    through its aliases."""
    if isinstance(grant_values, str):
        grant_values = [grant_values]
    grant_terms = {_term(v) for v in (grant_values or [])} - {""}
    base = _term(profile_value)
    if not base or not grant_terms:
        return UNKNOWN_FIT
    if base in grant_terms:
        return 1.0
    if _label_aliases(profile_value, alias_map) & grant_terms:
        return 0.7
    return 0.0


def _country_match(profile_country: str | None, grant_countries) -> float:
    """Country-specific: exact 1.0, alias 0.7, 'any/global' 0.6, mismatch 0.0;
    UNKNOWN_FIT when the grant lists no countries or the profile has none."""
    grant_set = _norm_set(grant_countries)
    if not grant_set:
        return UNKNOWN_FIT
    # Open-to-all signals
    if grant_set & {"any", "global", "international", "worldwide", "all"}:
        return 0.6
    if not profile_country:
        return UNKNOWN_FIT
    aliases = _expand_aliases(profile_country, COUNTRY_ALIASES)
    if _norm(profile_country) in grant_set:
        return 1.0
    if aliases & grant_set:
        return 0.7
    return 0.0


def overlap_score(left, right) -> float:
    a = _norm_set(left)
    b = _norm_set(right)
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def eligibility_score(profile: UserProfile, grant_fields: dict) -> float:
    """
    Alias-aware eligibility scoring. Combines country, applicant, institution,
    and field overlap. Returns a value in [0,1].

    A component the grant (or profile) doesn't state scores UNKNOWN_FIT, not 0:
    scraped grants often lack structured eligibility, and a missing field is
    no evidence of a mismatch.
    """
    country = _country_match(profile.country, grant_fields.get("eligible_countries", []))
    applicant = _match_strength(profile.applicantType, grant_fields.get("eligible_applicants", []), APPLICANT_ALIASES)
    institution = _match_strength(profile.institutionType, grant_fields.get("institution_type", []), INSTITUTION_ALIASES)
    grant_field = grant_fields.get("field", [])
    if _norm_set(profile.researchInterests) and _norm_set(grant_field):
        field = overlap_score(profile.researchInterests, grant_field)
    else:
        field = UNKNOWN_FIT

    # Component weights within eligibility
    score = (
        0.35 * country
        + 0.25 * applicant
        + 0.20 * institution
        + 0.20 * field
    )

    # Hard-constraint guards: PhD requirement / experience / citizenship.
    if grant_fields.get("requires_phd") is True and getattr(profile, "hasPhd", None) is False:
        score *= 0.3

    min_exp = grant_fields.get("min_experience_years")
    yrs = getattr(profile, "yearsOfExperience", None)
    if min_exp is not None and yrs is not None and yrs < min_exp:
        score *= 0.5

    cit_required = _norm_set(grant_fields.get("citizenship_required", []))
    if cit_required:
        cit = getattr(profile, "citizenship", None)
        if cit and _norm(cit) not in cit_required:
            score *= 0.5

    return min(score, 1.0)


def is_strictly_disqualified(profile: UserProfile, grant_fields: dict) -> tuple[bool, str | None]:
    """
    Evaluates whether a candidate strictly violates non-negotiable hard constraints.
    Returns (True, reason) if strictly disqualified, else (False, None).

    Safety guard: Only disqualifies if profile data is EXPLICITLY known and conflicts.
    Never disqualifies on missing or null profile fields.
    """
    # 1. PhD requirement guard
    if grant_fields.get("requires_phd") is True:
        has_phd = getattr(profile, "hasPhd", None)
        if has_phd is False:
            return True, "Grant requires PhD, but applicant does not have PhD"

    # 2. Strict citizenship guard
    cit_required = _norm_set(grant_fields.get("citizenship_required", []))
    if cit_required and not (cit_required & {"any", "all", "global", "open"}):
        user_cit = getattr(profile, "citizenship", None)
        if user_cit:
            user_cit_aliases = _expand_aliases(user_cit, COUNTRY_ALIASES)
            if not (user_cit_aliases & cit_required):
                return True, f"Citizenship restriction: requires {', '.join(cit_required)}"

    # 3. Strict country eligibility guard
    grant_countries = _norm_set(grant_fields.get("eligible_countries", []))
    if grant_countries and not (grant_countries & {"any", "all", "global", "international", "worldwide"}):
        user_country = getattr(profile, "country", None)
        if user_country:
            user_country_aliases = _expand_aliases(user_country, COUNTRY_ALIASES)
            if not (user_country_aliases & grant_countries):
                return True, f"Geographic restriction: grant limited to {', '.join(grant_countries)}"

    # 4. Mandatory minimum experience guard
    min_exp = grant_fields.get("min_experience_years")
    if min_exp is not None and min_exp > 0:
        yrs = getattr(profile, "yearsOfExperience", None)
        if yrs is not None and yrs < min_exp:
            return True, f"Requires minimum {min_exp} years experience (applicant has {yrs})"

    return False, None


def keyword_overlap_score(profile: UserProfile, query: str | None, grant_fields: dict) -> float:
    """
    Share of the user's terms found in the grant's title, program, fields,
    tags or chunk_text, matched on whole words. Each profile keyword/interest
    is one phrase ("machine learning" must appear as those words in order);
    each query word counts on its own, minus stop words and generic grant
    vocabulary. So "ai" matches "AI for health" but not "maintain".
    """
    terms: set[tuple[str, ...]] = set()
    for phrase in list(profile.keywords or []) + list(profile.researchInterests or []):
        words = _words(phrase)
        if not words or all(w in _STOP_WORDS for w in words):
            continue
        if len(words) == 1 and len(words[0]) < 2:
            continue
        terms.add(tuple(_fold(w) for w in words))
    for word in _words(query or ""):
        if len(word) >= 2 and word not in _STOP_WORDS:
            terms.add((_fold(word),))
    if not terms:
        return 0.0

    haystack_parts = [
        grant_fields.get("grant_title") or "",
        grant_fields.get("program_name") or "",
        grant_fields.get("chunk_text") or "",
    ]
    for f in (grant_fields.get("field") or []):
        haystack_parts.append(str(f))
    for t in (grant_fields.get("tags") or []):
        haystack_parts.append(str(t))

    haystack_words = [_fold(w) for w in _words(" ".join(haystack_parts))]
    if not haystack_words:
        return 0.0

    # Space-padded so a term only matches whole words.
    haystack = " " + " ".join(haystack_words) + " "
    hits = sum(1 for term in terms if f" {' '.join(term)} " in haystack)
    return hits / len(terms)


def grant_type_fit(profile: UserProfile, grant_fields: dict) -> float:
    """
    Preference alignment between the researcher's preferred grant type and the
    grant's funding mechanism. Returns 1.0 on match, 0.0 on a clear mismatch,
    and 0.5 (neutral) when either side is unknown — applied downstream as a
    positive-only nudge, so a mismatch is never penalized (preferences are
    soft, not eligibility).
    """
    pref = _norm(getattr(profile, "preferredGrantType", None))
    gt = _norm(grant_fields.get("grant_type"))
    if not pref or not gt:
        return 0.5
    if pref == gt or pref in gt or gt in pref:
        return 1.0
    return 0.0


def career_stage_fit(profile: UserProfile, grant_fields: dict) -> float:
    """
    Soft match between the researcher's career stage and the stages a grant
    targets. 1.0 = direct match or grant open to any stage; 0.7 = alias match
    (e.g. "PhD student" ~ "student"); 0.5 = grant doesn't restrict stage or we
    can't tell (neutral); 0.0 = grant restricts and the researcher doesn't fit.

    Kept as a positive-only signal upstream so the coarse Position→stage
    mapping can't produce false eligibility penalties.
    """
    targets = _norm_set(grant_fields.get("target_career_stages", []))
    if not targets:
        return 0.5  # grant places no career-stage restriction
    if targets & {"any", "all", "any stage", "all stages", "all career stages"}:
        return 1.0
    hay = {_norm(profile.careerStage), _norm(profile.applicantType)} - {""}
    if not hay:
        return 0.5
    if hay & targets:
        return 1.0
    expanded: set[str] = set()
    for h in hay:
        expanded |= _expand_aliases(h, APPLICANT_ALIASES)
    if expanded & targets:
        return 0.7
    return 0.0
