from datetime import datetime, timezone
from dateutil import parser as date_parser
from .schemas import UserProfile


def _normalize_text(value: str | None) -> str:
    return (value or "").strip().lower()


def _normalize_list(values: list[str] | None) -> set[str]:
    if not values:
        return set()
    return {str(v).strip().lower() for v in values if str(v).strip()}


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


def freshness_score(deadline: str | None) -> float:
    if not deadline:
        return 0.3

    try:
        dt = date_parser.parse(deadline)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        days_left = (dt - datetime.now(timezone.utc)).days

        if days_left < 0:
            return 0.0
        if days_left <= 30:
            return 1.0
        if days_left <= 90:
            return 0.7
        if days_left <= 180:
            return 0.5
        return 0.3
    except Exception:
        return 0.3


def overlap_score(left: list[str] | None, right: list[str] | None) -> float:
    a = _normalize_list(left)
    b = _normalize_list(right)
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def funding_fit(profile: UserProfile, grant_fields: dict) -> float:
    user_min = profile.preferredMinAmount
    user_max = profile.preferredMaxAmount
    grant_min = grant_fields.get("funding_amount_min")
    grant_max = grant_fields.get("funding_amount_max")

    if user_min is None and user_max is None:
        return 0.5
    if grant_min is None and grant_max is None:
        return 0.2

    low = grant_min if grant_min is not None else 0
    high = grant_max if grant_max is not None else float("inf")

    if user_max is not None and low > user_max:
        return 0.0
    if user_min is not None and high < user_min:
        return 0.0
    return 1.0


def eligibility_score(profile: UserProfile, grant_fields: dict) -> float:
    score = 0.0

    countries = grant_fields.get("eligible_countries", [])
    applicants = grant_fields.get("eligible_applicants", [])
    institution_types = grant_fields.get("institution_type", [])
    fields = grant_fields.get("field", [])

    if profile.country and _normalize_text(profile.country) in _normalize_list(countries):
        score += 0.25

    if profile.institutionType and _normalize_text(profile.institutionType) in _normalize_list(institution_types):
        score += 0.25

    if profile.applicantType and _normalize_text(profile.applicantType) in _normalize_list(applicants):
        score += 0.20

    score += 0.20 * overlap_score(profile.researchInterests, fields)

    score += 0.10 * funding_fit(profile, grant_fields)

    if deadline_is_open(grant_fields.get("application_deadline")):
        score += 0.10

    return min(score, 1.0)