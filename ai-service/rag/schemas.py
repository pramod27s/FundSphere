from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict


class GrantData(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: Optional[int] = None
    grantTitle: Optional[str] = Field(default=None, max_length=500)
    fundingAgency: Optional[str] = Field(default=None, max_length=500)
    programName: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = Field(default=None, max_length=2000)
    grantUrl: Optional[str] = Field(default=None, max_length=500)
    applicationDeadline: Optional[str] = Field(default=None, max_length=100)
    fundingAmountMin: Optional[float] = Field(default=None, ge=0)
    fundingAmountMax: Optional[float] = Field(default=None, ge=0)
    fundingCurrency: Optional[str] = Field(default=None, max_length=50)
    eligibleCountries: List[str] = Field(default_factory=list)
    eligibleApplicants: List[str] = Field(default_factory=list)
    institutionType: List[str] = Field(default_factory=list)
    field: List[str] = Field(default_factory=list)
    applicationLink: Optional[str] = Field(default=None, max_length=500)
    checksum: Optional[str] = Field(default=None, max_length=200)
    tags: List[str] = Field(default_factory=list)
    createdAt: Optional[str] = Field(default=None, max_length=100)
    updatedAt: Optional[str] = Field(default=None, max_length=100)
    lastScrapedAt: Optional[str] = Field(default=None, max_length=100)
    objectives: Optional[str] = Field(default=None, max_length=3000)
    fundingScope: Optional[str] = Field(default=None, max_length=1000)
    eligibilityCriteria: Optional[str] = Field(default=None, max_length=3000)
    selectionCriteria: Optional[str] = Field(default=None, max_length=3000)
    grantDuration: Optional[str] = Field(default=None, max_length=500)
    researchThemes: List[str] = Field(default_factory=list)


class UserProfile(BaseModel):
    model_config = ConfigDict(extra='forbid')
    userId: Optional[int] = None
    country: Optional[str] = Field(default=None, max_length=100)
    institutionType: Optional[str] = Field(default=None, max_length=100)
    applicantType: Optional[str] = Field(default=None, max_length=100)
    careerStage: Optional[str] = Field(default=None, max_length=100)
    department: Optional[str] = Field(default=None, max_length=200)
    researchBio: Optional[str] = Field(default=None, max_length=3000)
    researchInterests: List[str] = Field(default_factory=list)
    keywords: List[str] = Field(default_factory=list)
    preferredMinAmount: Optional[float] = Field(default=None, ge=0)
    preferredMaxAmount: Optional[float] = Field(default=None, ge=0)
    preferredCurrency: Optional[str] = Field(default=None, max_length=50)


class KeywordCandidate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    grantId: int
    keywordScore: float


class IndexGrantRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    grantId: int


class IndexBatchRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    grantIds: List[int]


class SemanticHit(BaseModel):
    model_config = ConfigDict(extra='forbid')
    grantId: int
    semanticScore: float
    fields: Dict[str, Any] = Field(default_factory=dict)


class RecommendationRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    userId: Optional[int] = None
    userProfile: Optional[UserProfile] = None
    userQuery: Optional[str] = Field(default=None, max_length=1000)
    keywordCandidates: List[KeywordCandidate] = Field(default_factory=list)
    topK: int = Field(default=10, ge=1, le=100)
    useRerank: Optional[bool] = None
    alpha: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class RecommendationItem(BaseModel):
    model_config = ConfigDict(extra='forbid')
    grantId: int
    finalScore: float
    semanticScore: float = 0.0
    keywordScore: float = 0.0
    eligibilityScore: float = 0.0
    freshnessScore: float = 0.0
    title: Optional[str] = Field(default=None, max_length=500)
    fundingAgency: Optional[str] = Field(default=None, max_length=500)
    reason: str = Field(default="", max_length=1000)
    fields: Dict[str, Any] = Field(default_factory=dict)


class RecommendationResponse(BaseModel):
    model_config = ConfigDict(extra='forbid')
    queryText: str = Field(..., max_length=2000)
    results: List[RecommendationItem]
