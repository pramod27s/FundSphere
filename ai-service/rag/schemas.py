from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class GrantData(BaseModel):
    id: str | None = None
    grantTitle: str | None = None
    fundingAgency: str | None = None
    programName: str | None = None
    description: str | None = None
    applicationDeadline: str | None = None
    fundingAmountMin: float | None = None
    fundingAmountMax: float | None = None
    fundingCurrency: str | None = None
    eligibleCountries: list[str] | None = None
    eligibleApplicants: list[str] | None = None
    institutionType: list[str] | None = None
    field: list[str] | None = None
    applicationLink: str | None = None
    grantUrl: str | None = None
    checksum: str | None = None
    tags: list[str] | None = None
    createdAt: str | None = None
    updatedAt: str | None = None
    lastScrapedAt: str | None = None
    objectives: str | None = None
    fundingScope: str | None = None
    eligibilityCriteria: str | None = None
    selectionCriteria: str | None = None
    grantDuration: str | None = None
    researchThemes: list[str] | None = None


class UserProfile(BaseModel):
    userId: Optional[int] = None
    country: Optional[str] = None
    institutionType: Optional[str] = None
    applicantType: Optional[str] = None
    careerStage: Optional[str] = None
    department: Optional[str] = None
    researchBio: Optional[str] = None
    researchInterests: List[str] = Field(default_factory=list)
    keywords: List[str] = Field(default_factory=list)
    preferredMinAmount: Optional[float] = None
    preferredMaxAmount: Optional[float] = None
    preferredCurrency: Optional[str] = None


class KeywordCandidate(BaseModel):
    grantId: int
    keywordScore: float


class IndexGrantRequest(BaseModel):
    grantId: int


class IndexBatchRequest(BaseModel):
    grantIds: List[int]


class SemanticHit(BaseModel):
    grantId: int
    semanticScore: float
    fields: Dict[str, Any] = Field(default_factory=dict)


class RecommendationRequest(BaseModel):
    userId: Optional[int] = None
    userProfile: Optional[UserProfile] = None
    userQuery: Optional[str] = None
    keywordCandidates: List[KeywordCandidate] = Field(default_factory=list)
    topK: int = 10
    useRerank: Optional[bool] = None


class RecommendationItem(BaseModel):
    grantId: int
    finalScore: float
    semanticScore: float = 0.0
    keywordScore: float = 0.0
    eligibilityScore: float = 0.0
    freshnessScore: float = 0.0
    title: Optional[str] = None
    fundingAgency: Optional[str] = None
    reason: str = ""
    fields: Dict[str, Any] = Field(default_factory=dict)


class RecommendationResponse(BaseModel):
    queryText: str
    results: List[RecommendationItem]