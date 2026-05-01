from datetime import datetime, timezone
from dateutil import parser as date_parser
from .config import settings
from .schemas import UserProfile


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


APPLICANT_ALIASES = {
    "phd student": ["student", "doctoral", "graduate", "graduate student"],
    "postdoc": ["postdoctoral", "early-career researcher", "researcher"],
    "faculty": ["professor", "academic", "researcher", "principal investigator", "pi"],
    "professor": ["faculty", "academic", "principal investigator", "pi"],
    "researcher": ["faculty", "academic", "principal investigator", "pi", "scientist"],
    "startup": ["entrepreneur", "small business", "sme", "founder"],
    "ngo": ["non-profit", "non-governmental organization", "nonprofit"],
}


INSTITUTION_ALIASES = {
    "university": ["academic institution", "college", "higher education"],
    "college": ["academic institution", "university", "higher education"],
    "academic institution": ["university", "college", "higher education"],
    "startup": ["small business", "sme", "early-stage"],
    "ngo": ["non-profit", "non-governmental organization"],
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
        deadline_score = 0.5
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
    if not profile_value or not grant_values:
        return 0.0
    profile_aliases = _expand_aliases(profile_value, alias_map)
    grant_set = _norm_set(grant_values)
    if not profile_aliases or not grant_set:
        return 0.0
    base = _norm(profile_value)
    if base in grant_set:
        return 1.0
    if profile_aliases & grant_set:
        return 0.7
    return 0.0


def _country_match(profile_country: str | None, grant_countries) -> float:
    """Country-specific: exact 1.0, alias 0.7, 'any/global' 0.6, none 0.0."""
    grant_set = _norm_set(grant_countries)
    if not grant_set:
        return 0.0
    # Open-to-all signals
    if grant_set & {"any", "global", "international", "worldwide", "all"}:
        return 0.6
    if not profile_country:
        return 0.0
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
    """
    country = _country_match(profile.country, grant_fields.get("eligible_countries", []))
    applicant = _match_strength(profile.applicantType, grant_fields.get("eligible_applicants", []), APPLICANT_ALIASES)
    institution = _match_strength(profile.institutionType, grant_fields.get("institution_type", []), INSTITUTION_ALIASES)
    field = overlap_score(profile.researchInterests, grant_fields.get("field", []))

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


def keyword_overlap_score(profile: UserProfile, query: str | None, grant_fields: dict) -> float:
    """
    Lightweight FTS-style keyword overlap. Counts user keywords/interests/query
    tokens that appear in the grant's title, themes, fields, or chunk_text.
    """
    bag: list[str] = []
    if profile.keywords:
        bag.extend(profile.keywords)
    if profile.researchInterests:
        bag.extend(profile.researchInterests)
    if query:
        bag.extend(query.split())

    tokens = {_norm(t) for t in bag if t and len(str(t).strip()) > 2}
    if not tokens:
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

    haystack = _norm(" ".join(haystack_parts))
    if not haystack:
        return 0.0

    hits = sum(1 for t in tokens if t and t in haystack)
    return min(1.0, hits / max(len(tokens), 1))
