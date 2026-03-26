from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class GrantData(BaseModel):
    id: Optional[int] = None
    grantTitle: Optional[str] = None
    fundingAgency: Optional[str] = None
    programName: Optional[str] = None
    description: Optional[str] = None
    grantUrl: Optional[str] = None
    applicationDeadline: Optional[str] = None
    fundingAmountMin: Optional[float] = None
    fundingAmountMax: Optional[float] = None
    fundingCurrency: Optional[str] = None
    eligibleCountries: List[str] = Field(default_factory=list)
    eligibleApplicants: List[str] = Field(default_factory=list)
    institutionType: List[str] = Field(default_factory=list)
    field: List[str] = Field(default_factory=list)
    application_link: Optional[str] = None
    checksum: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    lastScrapedAt: Optional[str] = None


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