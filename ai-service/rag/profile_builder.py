from .schemas import UserProfile


def _humanize(value: str) -> str:
    """Convert UPPER_SNAKE_CASE enum names to readable 'Title Case' strings."""
    return value.replace("_", " ").strip().title()


def build_user_query_text(profile: UserProfile, user_query: str | None = None) -> str:
    """Build a single retrieval query string from profile attributes and optional user intent."""
    parts: list[str] = []

    if profile.researchBio:
        parts.append(f"Research bio: {profile.researchBio}.")
    if profile.researchInterests:
        cleaned = [_humanize(i) for i in profile.researchInterests]
        parts.append(f"Research interests: {', '.join(cleaned)}.")
    if profile.keywords:
        parts.append(f"Keywords: {', '.join(profile.keywords)}.")
    if profile.department:
        parts.append(f"Department: {profile.department}.")
    if profile.country:
        parts.append(f"Researcher country: {profile.country}.")
    if profile.institutionType:
        parts.append(f"Institution type: {profile.institutionType}.")
    if profile.applicantType:
        parts.append(f"Applicant type: {_humanize(profile.applicantType)}.")
    if profile.careerStage:
        parts.append(f"Career stage: {_humanize(profile.careerStage)}.")
    if profile.preferredMinAmount is not None or profile.preferredMaxAmount is not None:
        parts.append(
            f"Preferred funding amount: {profile.preferredMinAmount or 0} to {profile.preferredMaxAmount or 'any'} {profile.preferredCurrency or ''}."
        )
    if user_query:
        parts.append(f"Current user need: {user_query}")

    # Join all profile signals into one prompt-like retrieval query.
    return " ".join(parts).strip()