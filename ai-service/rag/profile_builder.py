from .schemas import UserProfile


def build_user_query_text(profile: UserProfile, user_query: str | None = None) -> str:
    parts: list[str] = []

    if profile.country:
        parts.append(f"Researcher country: {profile.country}.")
    if profile.institutionType:
        parts.append(f"Institution type: {profile.institutionType}.")
    if profile.applicantType:
        parts.append(f"Applicant type: {profile.applicantType}.")
    if profile.careerStage:
        parts.append(f"Career stage: {profile.careerStage}.")
    if profile.department:
        parts.append(f"Department: {profile.department}.")
    if profile.researchBio:
        parts.append(f"Research bio: {profile.researchBio}.")
    if profile.researchInterests:
        parts.append(f"Research interests: {', '.join(profile.researchInterests)}.")
    if profile.keywords:
        parts.append(f"Keywords: {', '.join(profile.keywords)}.")
    if profile.preferredMinAmount is not None or profile.preferredMaxAmount is not None:
        parts.append(
            f"Preferred funding amount: {profile.preferredMinAmount or 0} to {profile.preferredMaxAmount or 'any'} {profile.preferredCurrency or ''}."
        )
    if user_query:
        parts.append(f"Current user need: {user_query}")

    return " ".join(parts).strip()