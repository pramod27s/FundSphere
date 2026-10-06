from typing import List, Literal, Optional, Union

from pydantic import BaseModel, Field

ChecklistCategory = Literal[
    "documents",
    "format",
    "eligibility",
    "budget",
    "submission",
    "key_dates",
]


class ChecklistItem(BaseModel):
    """One requirement from a call's guidelines, with the sentence it came from.

    `source_verified` is set by code, not by the LLM: it is true only when
    `source_quote` was found in the extracted text. `source_page` is the page
    the quote was actually found on (corrected if the LLM cited the wrong
    page), or None for web pages, which have no page numbers.
    """
    category: ChecklistCategory
    text: str
    mandatory: bool = True
    # Needs a signature or endorsement from someone outside the team
    # (Head of Institution, Registrar, Finance Officer). These get an
    # earlier default due date because sign-offs take time.
    needs_signoff: bool = False
    # ISO date (YYYY-MM-DD) when the guidelines give this item its own date.
    date: Optional[str] = None
    source_quote: str = ""
    source_page: Optional[int] = None
    source_verified: bool = False


RuleKind = Literal["limit", "forbidden_item", "needs_evidence", "judgement"]
RuleMetric = Literal[
    "pages", "words", "font_size", "font_family", "paper_size", "line_spacing", "budget_total",
    "overhead_percent", "overhead_amount", "duration_months", "item_cost",
]


class ProposalRule(BaseModel):
    """A rule the proposal document itself must follow.

    `kind` decides who checks it: "limit", "forbidden_item" and
    "needs_evidence" are checked by code against the proposal's measured
    facts; "judgement" rules go to the AI review. Budget amounts are stored
    in lakh whatever unit the guidelines used.
    """
    id: str
    text: str
    severity: Literal["critical", "important", "minor"] = "important"
    kind: RuleKind = "judgement"
    metric: Optional[RuleMetric] = None
    operator: Optional[Literal["max", "min", "equals"]] = None
    value: Optional[Union[float, str]] = None
    unit: Optional[str] = None
    # Canonical section the rule applies to (see proposal/sections.py), or None for the whole proposal.
    section: Optional[str] = None
    keywords: List[str] = Field(default_factory=list)
    source_quote: str = ""
    source_page: Optional[int] = None
    source_verified: bool = False


class ProposalCriterion(BaseModel):
    """How the committee marks proposals, e.g. "Novelty and scientific merit", 25 marks."""
    name: str
    marks: Optional[float] = None
    source_quote: str = ""
    source_page: Optional[int] = None
    source_verified: bool = False


class ProposalGuidance(BaseModel):
    """The part of the guidelines that says how the proposal document is judged."""
    scope: Optional[str] = None
    required_sections: List[str] = Field(default_factory=list)
    criteria: List[ProposalCriterion] = Field(default_factory=list)
    rules: List[ProposalRule] = Field(default_factory=list)


class ChecklistExtractionResponse(BaseModel):
    items: List[ChecklistItem] = Field(default_factory=list)
    proposal: ProposalGuidance = Field(default_factory=ProposalGuidance)
    # Hash of the extracted text: the same guidelines always get the same hash,
    # whether they were uploaded or fetched from a link.
    content_hash: str = ""
    # The call's submission deadline, if the guidelines state one (YYYY-MM-DD).
    call_deadline: Optional[str] = None
    source_kind: Literal["pdf", "web"] = "pdf"
    # Where the text came from: the uploaded file name, the pasted URL, or a
    # guidelines PDF linked from that URL.
    source_name: str = ""
    page_count: int = 0
    warnings: List[str] = Field(default_factory=list)
