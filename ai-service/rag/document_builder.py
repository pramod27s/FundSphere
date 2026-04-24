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
    """
    Builds a rich semantic text representation of a grant for vector embeddings.
    This function feeds directly into Pinecone upsert, ensuring the RAG model
    can semantically match user queries against detailed, labeled fields.
    """
    parts = []

    if getattr(grant, "grantTitle", None):
        parts.append(f"Title: {_clean_str(grant.grantTitle)}")
    if getattr(grant, "fundingAgency", None):
        parts.append(f"Agency: {_clean_str(grant.fundingAgency)}")
    if getattr(grant, "programName", None):
        parts.append(f"Program: {_clean_str(grant.programName)}")
    if getattr(grant, "objectives", None):
        parts.append(f"Objectives: {_clean_str(grant.objectives)}")
    if getattr(grant, "description", None):
        parts.append(f"Description: {_clean_str(grant.description)}")
    if getattr(grant, "fundingScope", None):
        parts.append(f"Funding Scope: {_clean_str(grant.fundingScope)}")
    if getattr(grant, "eligibilityCriteria", None):
        parts.append(f"Eligibility: {_clean_str(grant.eligibilityCriteria)}")
    if getattr(grant, "selectionCriteria", None):
        parts.append(f"Selection Criteria: {_clean_str(grant.selectionCriteria)}")

    themes = _clean_list(getattr(grant, "researchThemes", []))
    if themes:
        parts.append(f"Themes: {', '.join(themes)}")

    fields = _clean_list(getattr(grant, "field", []))
    if fields:
        parts.append(f"Field: {', '.join(fields)}")

    applicants = _clean_list(getattr(grant, "eligibleApplicants", []))
    if applicants:
        parts.append(f"Applicants: {', '.join(applicants)}")

    countries = _clean_list(getattr(grant, "eligibleCountries", []))
    if countries:
        parts.append(f"Countries: {', '.join(countries)}")

    tags = _clean_list(getattr(grant, "tags", []))
    if tags:
        parts.append(f"Tags: {', '.join(tags)}")


    return "\n".join(parts)


def build_pinecone_record(grant: GrantData) -> dict:
    record = {
        "id": f"grant#{grant.id}",
        "chunk_text": build_grant_document(grant),
        "grant_id": grant.id,
        "grant_title": _clean_str(grant.grantTitle),
        "funding_agency": _clean_str(grant.fundingAgency),
        "program_name": _clean_str(grant.programName),
        "grant_url": _clean_str(grant.grantUrl),
        "application_link": _clean_str(grant.applicationLink),
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