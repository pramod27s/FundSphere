from pydantic import BaseModel, Field
from typing import List, Literal


class SectionFeedback(BaseModel):
    section_name: str
    status: Literal["strong", "weak", "missing"]
    score: int = Field(ge=0, le=100)
    feedback: str
    suggestions: List[str] = Field(default_factory=list)


class ProposalAnalysisResponse(BaseModel):
    overall_score: int = Field(ge=0, le=100)
    summary: str
    section_feedback: List[SectionFeedback] = Field(default_factory=list)
    missing_sections: List[str] = Field(default_factory=list)
    key_suggestions: List[str] = Field(default_factory=list)
    mode: str = "simple"
    grant_title: str = ""
