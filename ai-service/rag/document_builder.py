from datetime import datetime, timezone
from dateutil import parser as date_parser
from .schemas import GrantData


def _clean_str(value: str | None) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split())


def _clean_list(values: list[str] | None) -> list[str]:
    if not values:
        return []
    cleaned = []
    for value in values:
        v = _clean_str(value)
        if v:
            cleaned.append(v)
    return cleaned


def _to_epoch(date_value: str | None) -> int | None:
    if not date_value:
        return None
    try:
        dt = date_parser.parse(date_value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except Exception:
        return None


def build_grant_document(grant: GrantData) -> str:
    parts: list[str] = []

    if grant.grantTitle:
        parts.append(f"Grant Title: {grant.grantTitle}")
    if grant.fundingAgency:
        parts.append(f"Funding Agency: {grant.fundingAgency}")
    if grant.programName:
        parts.append(f"Program Name: {grant.programName}")
    if grant.description:
        parts.append(f"Description: {grant.description}")
    if grant.applicationDeadline:
        parts.append(f"Application Deadline: {grant.applicationDeadline}")
    if grant.fundingAmountMin is not None or grant.fundingAmountMax is not None:
        parts.append(
            f"Funding Amount: {grant.fundingAmountMin or ''} to {grant.fundingAmountMax or ''} {grant.fundingCurrency or ''}".strip()
        )

    countries = _clean_list(grant.eligibleCountries)
    applicants = _clean_list(grant.eligibleApplicants)
    institution_types = _clean_list(grant.institutionType)
    fields = _clean_list(grant.field)
    tags = _clean_list(grant.tags)

    if countries:
        parts.append(f"Eligible Countries: {', '.join(countries)}")
    if applicants:
        parts.append(f"Eligible Applicants: {', '.join(applicants)}")
    if institution_types:
        parts.append(f"Institution Types: {', '.join(institution_types)}")
    if fields:
        parts.append(f"Research Fields: {', '.join(fields)}")
    if tags:
        parts.append(f"Tags: {', '.join(tags)}")

    if grant.grantUrl:
        parts.append(f"Grant URL: {grant.grantUrl}")
    if grant.application_link:
        parts.append(f"Application Link: {grant.application_link}")

    return "\n".join(parts)


def build_pinecone_record(grant: GrantData) -> dict:
    record = {
        "_id": f"grant#{grant.id}",
        "chunk_text": build_grant_document(grant),
        "grant_id": grant.id,
        "grant_title": _clean_str(grant.grantTitle),
        "funding_agency": _clean_str(grant.fundingAgency),
        "program_name": _clean_str(grant.programName),
        "grant_url": _clean_str(grant.grantUrl),
        "application_link": _clean_str(grant.application_link),
        "application_deadline": _clean_str(grant.applicationDeadline),
        "deadline_epoch": _to_epoch(grant.applicationDeadline),
        "funding_amount_min": grant.fundingAmountMin,
        "funding_amount_max": grant.fundingAmountMax,
        "funding_currency": _clean_str(grant.fundingCurrency),
        "eligible_countries": _clean_list(grant.eligibleCountries),
        "eligible_applicants": _clean_list(grant.eligibleApplicants),
        "institution_type": _clean_list(grant.institutionType),
        "field": _clean_list(grant.field),
        "tags": _clean_list(grant.tags),
        "checksum": _clean_str(grant.checksum),
        "last_scraped_at": _clean_str(grant.lastScrapedAt),
        "updated_at": _clean_str(grant.updatedAt),
    }

    # Pinecone metadata should be flat and should not contain null values.
    cleaned = {}
    for key, value in record.items():
        if value is None:
            continue
        if value == "":
            continue
        if value == []:
            continue
        cleaned[key] = value

    return cleaned