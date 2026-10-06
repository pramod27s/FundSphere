"""Data passed between the review stages (see docs/proposal-assistant-design.md)."""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

# "manual": can't be judged from a PDF (e.g. margins); shown as "check yourself", not scored.
Verdict = Literal["pass", "partial", "fail", "manual", "not_evaluated"]
Severity = Literal["critical", "important", "minor"]


# --- Stage B: the proposal document ------------------------------------------

class Section(BaseModel):
    key: str                    # unique within the document, e.g. "budget" or "budget-2"
    canonical: Optional[str]    # canonical section (proposal/sections.py) or None for other headings
    title: str                  # the heading as written
    page_start: int
    page_end: int
    words: int
    text: str
    hash: str


class FontInfo(BaseModel):
    family: Optional[str] = None   # dominant body font, e.g. "Times-Roman"
    size: Optional[float] = None   # dominant body font size in points
    share: float = 0.0             # share of characters in that font


class ProposalDocument(BaseModel):
    page_count: int
    words: int
    font: FontInfo = Field(default_factory=FontInfo)
    paper: Optional[str] = None                 # "A4", "Letter", "Legal" or "<w>x<h> pt"
    line_spacing: Optional[float] = None        # 1, 1.5 or 2, measured from the gaps between lines
    line_spacing_ratio: Optional[float] = None  # median line gap / font size
    sections: List[Section] = Field(default_factory=list)
    headings_found_by: Literal["rules", "ai", "none"] = "rules"

    def canonical_sections(self) -> List[str]:
        return sorted({s.canonical for s in self.sections if s.canonical})

    def sections_for(self, canonical: str) -> List[Section]:
        return [s for s in self.sections if s.canonical == canonical]

    def full_text(self) -> str:
        return "\n\n".join(s.text for s in self.sections)


# --- Stage B2: facts read from the budget, work plan and team --------------------

class BudgetHead(BaseModel):
    name: str
    amount_lakh: Optional[float] = None


class BudgetItem(BaseModel):
    name: str
    cost_lakh: Optional[float] = None
    head: Optional[str] = None


class Budget(BaseModel):
    total_lakh: Optional[float] = None
    heads: List[BudgetHead] = Field(default_factory=list)
    overhead_percent: Optional[float] = None
    overhead_lakh: Optional[float] = None
    items: List[BudgetItem] = Field(default_factory=list)
    has_year_wise_breakup: Optional[bool] = None


class TeamMember(BaseModel):
    name: str
    role: Optional[str] = None


class Facts(BaseModel):
    budget: Optional[Budget] = None
    duration_months: Optional[float] = None
    team: List[TeamMember] = Field(default_factory=list)
    objectives: List[str] = Field(default_factory=list)


# --- Stages C and D: results -------------------------------------------------------

class RuleResult(BaseModel):
    id: str
    text: str
    severity: Severity
    kind: str                                   # section_required | limit | forbidden_item | needs_evidence | judgement | scope
    checked_by: Literal["code", "ai"]
    verdict: Verdict
    evidence: str = ""
    section: Optional[str] = None
    source_quote: str = ""
    source_page: Optional[int] = None


class CriterionResult(BaseModel):
    id: str
    name: str
    marks: Optional[float] = None
    is_default: bool = False                    # the guidelines gave no criteria, so defaults were used
    score: Optional[int] = None                 # 1..5, None when not evaluated
    reason: str = ""
    fix: str = ""


class ConsistencyIssue(BaseModel):
    issue: str
    sections_involved: List[str] = Field(default_factory=list)
    severity: Severity = "important"
    suggestion: str = ""
    found_by: Literal["code", "ai"] = "ai"


class SectionNote(BaseModel):
    key: str
    summary: str = ""
    strength: str = ""
    improvement: str = ""


class Scores(BaseModel):
    overall: Optional[int] = None               # quality, capped at 49 while a critical rule fails
    quality: Optional[int] = None               # criteria weighted by their marks
    rules_met: int = 0
    rules_partial: int = 0
    rules_total: int = 0                        # rules actually evaluated
    critical_failed: int = 0
    capped: bool = False


class ReviewResult(BaseModel):
    level: Literal["instant", "full"]
    status: Literal["complete", "partial"]
    extraction_hash: str = ""
    document: ProposalDocument
    facts: Optional[Facts] = None
    rules: List[RuleResult] = Field(default_factory=list)
    criteria: List[CriterionResult] = Field(default_factory=list)
    consistency_issues: List[ConsistencyIssue] = Field(default_factory=list)
    section_notes: List[SectionNote] = Field(default_factory=list)
    summary: str = ""
    top_fixes: List[str] = Field(default_factory=list)
    scores: Scores = Field(default_factory=Scores)
    not_evaluated: List[str] = Field(default_factory=list)
    reused: Dict[str, bool] = Field(default_factory=dict)
    usage: Dict[str, Any] = Field(default_factory=dict)
