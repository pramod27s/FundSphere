from pydantic import BaseModel, Field
from typing import List, Optional


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
    applicationLink: Optional[str] = None
    checksum: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    lastScrapedAt: Optional[str] = None


class ScrapeResponse(BaseModel):
    sourceUrl: str
    grants: List[GrantData]