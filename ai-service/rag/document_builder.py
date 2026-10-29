import math
import re
from .schemas import GrantData
from .config import settings
from .countries import country_keys
from .filters import deadline_moment


def _clean_str(value: str | None) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split())


def _clean_text(value: str | None) -> str:
    """Long free text with its line breaks kept (repeated spaces and blank
    lines dropped), so the chunker can split a bulleted description at its
    lines instead of facing one unsplittable run."""
    if value is None:
        return ""
    lines = (" ".join(line.split()) for line in str(value).splitlines())
    return "\n".join(line for line in lines if line)


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
    """The deadline's epoch seconds for Pinecone's filter, read like deadline_is_open."""
    dt = deadline_moment(date_value)
    return int(dt.timestamp()) if dt else None


def build_grant_header(grant: GrantData) -> str:
    """Title, agency and program. Starts every chunk, so a chunk from deep in
    the text is still embedded as part of its grant."""
    parts = []
    for label, value in (("Title", grant.grantTitle), ("Agency", grant.fundingAgency), ("Program", grant.programName)):
        if value:
            parts.append(f"{label}: {_clean_str(value)}")
    return "\n".join(parts)


def build_grant_body(grant: GrantData) -> str:
    """The rest of the grant as labelled lines; long fields keep their own
    line breaks."""
    parts = []
    for label, value in (
        ("Objectives", grant.objectives),
        ("Description", grant.description),
        ("Funding Scope", grant.fundingScope),
        ("Eligibility", grant.eligibilityCriteria),
        ("Selection Criteria", grant.selectionCriteria),
    ):
        text = _clean_text(value)
        if text:
            parts.append(f"{label}: {text}")

    if grant.grantType:
        parts.append(f"Grant Type: {_clean_str(grant.grantType)}")

    for label, values in (
        ("Target Career Stages", grant.targetCareerStages),
        ("Themes", grant.researchThemes),
        ("Field", grant.field),
        ("Applicants", grant.eligibleApplicants),
        ("Countries", grant.eligibleCountries),
        ("Tags", grant.tags),
    ):
        cleaned = _clean_list(values)
        if cleaned:
            parts.append(f"{label}: {', '.join(cleaned)}")

    return "\n".join(parts)


def estimate_tokens(text: str) -> int:
    """A token count that errs high, without the models' tokenizers: the larger
    of 4/3 tokens per word and one token per 4 characters. The chunk limit
    exists to stay inside model input caps (pinecone-sparse-english-v0 reads
    512 tokens), so overestimating is the safe side."""
    if not text:
        return 0
    return max(math.ceil(len(text.split()) * 4 / 3), math.ceil(len(text) / 4))


_SENTENCE_END = re.compile(r"(?<=[.!?;])\s+")


def _word_windows(text: str, max_tokens: int) -> list[str]:
    """A sentence too long to be one unit, cut into runs of words that fit."""
    windows, current = [], []
    for word in text.split():
        if current and estimate_tokens(" ".join([*current, word])) > max_tokens:
            windows.append(" ".join(current))
            current = []
        current.append(word)
    if current:
        windows.append(" ".join(current))
    return windows


def _units(text: str, max_tokens: int) -> list[tuple[str, bool]]:
    """(text, starts_a_line) units no longer than max_tokens: the text's
    lines, split into sentences, any oversized sentence cut into word runs."""
    units = []
    for line in text.splitlines():
        first = True
        for sentence in _SENTENCE_END.split(line.strip()):
            if not sentence:
                continue
            pieces = [sentence] if estimate_tokens(sentence) <= max_tokens else _word_windows(sentence, max_tokens)
            for piece in pieces:
                units.append((piece, first))
                first = False
    return units


def _join(units: list[tuple[str, bool]]) -> str:
    return "".join(
        (("\n" if starts_line else " ") + text) if i else text
        for i, (text, starts_line) in enumerate(units)
    )


def chunk_text(text: str, max_tokens: int = 400, overlap_tokens: int = 80) -> list[str]:
    """Pieces of at most max_tokens (estimated), split at line and sentence
    ends. Each piece starts with up to overlap_tokens of the previous piece's
    last sentences, so a passage cut at a boundary is whole in one of them."""
    if not text.strip():
        return []
    if estimate_tokens(text) <= max_tokens:
        return [text]

    chunks: list[str] = []
    current: list[tuple[str, bool]] = []
    size = 0
    for unit in _units(text, max_tokens):
        unit_size = estimate_tokens(unit[0])
        if current and size + unit_size > max_tokens:
            chunks.append(_join(current))
            overlap: list[tuple[str, bool]] = []
            overlap_size = 0
            for prev in reversed(current):
                prev_size = estimate_tokens(prev[0])
                if overlap_size + prev_size > overlap_tokens:
                    break
                overlap.insert(0, prev)
                overlap_size += prev_size
            # The overlap gives way when it and the next unit don't both fit.
            while overlap and overlap_size + unit_size > max_tokens:
                overlap_size -= estimate_tokens(overlap.pop(0)[0])
            current, size = overlap, overlap_size
        current.append(unit)
        size += unit_size
    if current:
        chunks.append(_join(current))
    return chunks


def build_chunks(grant: GrantData) -> list[str]:
    """The texts embedded for a grant: its header, then one piece of the body.
    The header's share comes out of the chunk budget, so header and piece
    together stay within CHUNK_MAX_TOKENS."""
    header = build_grant_header(grant)
    body = build_grant_body(grant)
    if settings.enable_chunking:
        budget = max(settings.chunk_max_tokens - estimate_tokens(header), settings.chunk_max_tokens // 2)
        pieces = chunk_text(body, budget, settings.chunk_overlap_tokens) or [""]
    else:
        pieces = [body]
    return ["\n".join(part for part in (header, piece) if part) for piece in pieces]


def build_pinecone_records(grant: GrantData) -> list[dict]:
    chunks = build_chunks(grant)

    base_record = {
        "grant_id": grant.id,
        "grant_title": _clean_str(grant.grantTitle),
        "funding_agency": _clean_str(grant.fundingAgency),
        "program_name": _clean_str(grant.programName),
        "grant_url": _clean_str(grant.grantUrl),
        "application_link": _clean_str(grant.applicationLink),
        "application_deadline": _clean_str(grant.applicationDeadline),
        "deadline_epoch": _to_epoch(grant.applicationDeadline),
        "deadline_type": _clean_str(getattr(grant, "deadlineType", None)),
        "funding_amount_min": grant.fundingAmountMin,
        "funding_amount_max": grant.fundingAmountMax,
        "funding_currency": _clean_str(grant.fundingCurrency),
        "eligible_countries": _clean_list(grant.eligibleCountries),
        # Canonical names ("USA" -> "united states", "All countries" -> "any"):
        # what the Pinecone country filter matches on.
        "country_keys": country_keys(grant.eligibleCountries),
        "eligible_applicants": _clean_list(grant.eligibleApplicants),
        "institution_type": _clean_list(grant.institutionType),
        "field": _clean_list(grant.field),
        "tags": _clean_list(grant.tags),
        "checksum": _clean_str(grant.checksum),
        "last_scraped_at": _clean_str(grant.lastScrapedAt),
        "created_at": _clean_str(grant.createdAt),
        "updated_at": _clean_str(grant.updatedAt),
        "requires_phd": getattr(grant, "requiresPhd", None),
        "min_experience_years": getattr(grant, "minExperienceYears", None),
        "citizenship_required": _clean_list(getattr(grant, "citizenshipRequired", [])),
        "max_funding_per_applicant": getattr(grant, "maxFundingPerApplicant", None),
        "grant_type": _clean_str(getattr(grant, "grantType", None)),
        "target_career_stages": _clean_list(getattr(grant, "targetCareerStages", [])),
        "opening_date": _clean_str(getattr(grant, "openingDate", None)),
        "loi_deadline": _clean_str(getattr(grant, "loiDeadline", None)),
        "decision_date": _clean_str(getattr(grant, "decisionDate", None)),
        "project_start_date": _clean_str(getattr(grant, "projectStartDate", None)),
        "objectives": _clean_str(getattr(grant, "objectives", None))[:500] if getattr(grant, "objectives", None) else None,
        "eligibility_criteria": _clean_str(getattr(grant, "eligibilityCriteria", None))[:500] if getattr(grant, "eligibilityCriteria", None) else None,
        "funding_scope": _clean_str(getattr(grant, "fundingScope", None))[:500] if getattr(grant, "fundingScope", None) else None,
    }

    # Pinecone metadata should be flat and should not contain null values.
    cleaned_metadata = {}
    for key, value in base_record.items():
        if value is None:
            continue
        if value == "":
            continue
        if value == []:
            continue
        cleaned_metadata[key] = value

    records = []
    for i, chunk in enumerate(chunks):
        record = cleaned_metadata.copy()
        record["id"] = f"grant#{grant.id}-chunk{i}"
        record["chunk_text"] = chunk
        records.append(record)

    return records