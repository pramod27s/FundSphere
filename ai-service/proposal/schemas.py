from pydantic import BaseModel, Field
from typing import List, Literal


class Citation(BaseModel):
    """A rubric requirement, the proposal excerpt addressing it, and a verdict.

    This IS the compliance checklist: each citation reads as one row of
    "requirement → evidence → pass/partial/fail". Severity is copied from
    the rubric so the frontend can sort fail+critical to the top.
    """
    requirement: str
    proposal_excerpt: str = ""
    verdict: Literal["pass", "partial", "fail"] = "partial"
    severity: Literal["critical", "important", "minor"] = "important"


class SectionFeedback(BaseModel):
    section_name: str
    status: Literal["strong", "weak", "missing"]
    score: int = Field(ge=0, le=100)
    feedback: str
    suggestions: List[str] = Field(default_factory=list)
    citations: List[Citation] = Field(default_factory=list)


class ConsistencyIssue(BaseModel):
    """A contradiction or misalignment that spans MULTIPLE sections.

    The kind of thing one-shot quick-mode review tends to miss — e.g. budget
    totals that don't match the methodology's resource needs, timelines that
    don't fit the work plan, outcomes that don't follow from the objectives.
    """
    issue: str
    sections_involved: List[str] = Field(default_factory=list)
    severity: Literal["critical", "important", "minor"] = "important"
    suggestion: str = ""


class ProposalAnalysisResponse(BaseModel):
    overall_score: int = Field(ge=0, le=100)
    summary: str
    section_feedback: List[SectionFeedback] = Field(default_factory=list)
    missing_sections: List[str] = Field(default_factory=list)
    key_suggestions: List[str] = Field(default_factory=list)
    consistency_issues: List[ConsistencyIssue] = Field(default_factory=list)
    mode: str = "simple"
    grant_title: str = ""
