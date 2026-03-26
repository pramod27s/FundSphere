from pydantic import BaseModel
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
    eligibleCountries: List[str] = []
    eligibleApplicants: List[str] = []
    institutionType: List[str] = []
    field: List[str] = []
    application_link: Optional[str] = None
    checksum: Optional[str] = None
    tags: List[str] = []
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    lastScrapedAt: Optional[str] = None


class ScrapeResponse(BaseModel):
    sourceUrl: str
    grants: List[GrantData]