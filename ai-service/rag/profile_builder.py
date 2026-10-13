from .config import settings
from .schemas import UserProfile


def _humanize(value: str) -> str:
    """Convert UPPER_SNAKE_CASE enum names to readable 'Title Case' strings."""
    return value.replace("_", " ").strip().title()


def topic_lines(profile: UserProfile) -> list[str]:
    """What the researcher works on: the part of the profile the search embeds."""
    lines: list[str] = []
    if profile.researchBio:
        lines.append(f"Research bio: {profile.researchBio.strip().rstrip('.')}.")
    if profile.researchInterests:
        lines.append(f"Research interests: {', '.join(_humanize(i) for i in profile.researchInterests)}.")
    if profile.keywords:
        lines.append(f"Keywords: {', '.join(profile.keywords)}.")
    if profile.department:
        lines.append(f"Department: {profile.department}.")
    return lines


def eligibility_lines(profile: UserProfile) -> list[str]:
    """Who the researcher is, as far as eligibility goes. The filters and scores
    use these fields exactly, so they stay out of the search text: embedded,
    they pull the search toward every grant open to the same country or
    applicant type, whatever its topic. SEARCH_WITH_ELIGIBILITY_TEXT puts them
    back, for comparing on the eval."""
    if not settings.search_with_eligibility_text:
        return []
    lines: list[str] = []
    if profile.country:
        lines.append(f"Researcher country: {profile.country}.")
    if profile.institutionType:
        lines.append(f"Institution type: {profile.institutionType}.")
    if profile.applicantType:
        lines.append(f"Applicant type: {_humanize(profile.applicantType)}.")
    if profile.careerStage:
        lines.append(f"Career stage: {_humanize(profile.careerStage)}.")
    if profile.preferredMinAmount is not None or profile.preferredMaxAmount is not None:
        lines.append(
            f"Preferred funding amount: {profile.preferredMinAmount or 0} to {profile.preferredMaxAmount or 'any'} {profile.preferredCurrency or ''}."
        )
    if getattr(profile, "preferredGrantType", None):
        lines.append(f"Preferred grant type: {_humanize(profile.preferredGrantType)}.")
    return lines


def build_user_query_text(profile: UserProfile, user_query: str | None = None) -> str:
    """Build a single retrieval query string from the profile's topic and optional user intent."""
    parts = topic_lines(profile) + eligibility_lines(profile)
    if user_query:
        parts.append(f"Current user need: {user_query}")
    return " ".join(parts).strip()


def build_profile_only_text(profile: UserProfile) -> str:
    """Profile-only retrieval string. Captures *who the user is* and what they
    chronically work on — used as the 'fit' channel in the profile/query split."""
    return build_user_query_text(profile, user_query=None)


def build_query_only_text(profile: UserProfile, user_query: str | None) -> str:
    """Query-focused retrieval string. Captures *what the user wants right now*.
    A small slice of the profile is appended as light grounding (interests +
    keywords only), so the query embedding still benefits from domain context
    without being drowned out by a long bio."""
    user_query = (user_query or "").strip()
    if not user_query:
        # Fall back to profile-only when there is no live intent to focus on.
        return build_profile_only_text(profile)

    grounding: list[str] = []
    if profile.researchInterests:
        cleaned = [_humanize(i) for i in profile.researchInterests]
        grounding.append(f"Researcher interests: {', '.join(cleaned)}.")
    if profile.keywords:
        grounding.append(f"Keywords: {', '.join(profile.keywords)}.")

    parts = [f"Researcher is looking for: {user_query}."]
    parts.extend(grounding)
    return " ".join(parts).strip()
