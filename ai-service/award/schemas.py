from typing import List, Literal, Optional, Union

from pydantic import BaseModel, Field

BudgetHead = Literal["EQUIPMENT", "MANPOWER", "CONSUMABLES", "TRAVEL", "CONTINGENCY", "OVERHEAD", "OTHERS"]


class SourcedField(BaseModel):
    """One "Add my grant" form value read from a sanction order.

    `value` is set only when code confirmed it: the quote was found in the
    PDF text and the value (number, date or text) appears in that quote.
    Otherwise `value` is None and `note` says why, so the form leaves the
    field for the PI to type instead of filling it with a guess.
    Dates are ISO (YYYY-MM-DD) and amounts whole rupees, both worked out by
    code from `as_written`, never by the LLM.
    """
    value: Optional[Union[str, int]] = None
    as_written: str = ""
    source_quote: str = ""
    source_page: Optional[int] = None
    verified: bool = False
    note: Optional[str] = None


class BudgetItem(BaseModel):
    """One confirmed budget item as the order prints it, e.g. "Fellowship (1 JRF for 36 months)"."""
    label: str
    amount: int
    source_quote: str = ""
    source_page: Optional[int] = None


class BudgetLineReading(BaseModel):
    """A standard head with its confirmed items; `amount` is their sum, added up by code."""
    head: BudgetHead
    amount: int
    items: List[BudgetItem] = Field(default_factory=list)


class SanctionOrderReading(BaseModel):
    project_title: SourcedField = Field(default_factory=SourcedField)
    agency: SourcedField = Field(default_factory=SourcedField)
    scheme: SourcedField = Field(default_factory=SourcedField)
    sanction_no: SourcedField = Field(default_factory=SourcedField)
    sanction_date: SourcedField = Field(default_factory=SourcedField)
    start_date: SourcedField = Field(default_factory=SourcedField)
    end_date: SourcedField = Field(default_factory=SourcedField)
    total_sanctioned: SourcedField = Field(default_factory=SourcedField)
    # CARRY_FORWARD | LAPSES | DEDUCTED_NEXT_RELEASE, or None when the order doesn't say.
    unspent_policy: SourcedField = Field(default_factory=SourcedField)
    portal_url: SourcedField = Field(default_factory=SourcedField)
    budget_lines: List[BudgetLineReading] = Field(default_factory=list)
    # Things the PI should check: values left empty, totals that don't add up.
    warnings: List[str] = Field(default_factory=list)
    page_count: int = 0
    source_name: str = ""


# ---------------------------------------------------------------------------
# Progress-report drafts (4.4)
# ---------------------------------------------------------------------------

OutputType = Literal["PAPER", "STUDENT", "EQUIPMENT", "PATENT", "MILESTONE", "OTHER"]


class ReportGrant(BaseModel):
    project_title: str
    agency: Optional[str] = None
    scheme: Optional[str] = None
    sanction_no: Optional[str] = None
    sanction_date: Optional[str] = None  # YYYY-MM-DD
    start_date: str
    end_date: str
    total_sanctioned: Optional[int] = None  # whole rupees


class ReportOutput(BaseModel):
    """One recorded output; `date` is "2027", "2027-03" or "2027-03-14"."""
    id: int
    type: OutputType
    title: str
    details: Optional[str] = None
    date: Optional[str] = None
    amount: Optional[int] = None
    reference: Optional[str] = None


class ReportBudgetLine(BaseModel):
    head: BudgetHead
    allocated: int


class ReportInput(BaseModel):
    """Everything a draft may say, sent by Spring Boot, which owns the data.

    The service turns it into numbered entries ("grant", "period", "obj_1",
    "out_12", "budget_EQUIPMENT", "note"); every factual sentence of the
    draft must cite the entries it relies on.
    """
    kind: Literal["PROGRESS_REPORT", "FINAL_REPORT"] = "PROGRESS_REPORT"
    # e.g. "Annual progress report, year 1"; also names the period ("year 1") for the draft.
    title: str
    period_start: str
    period_end: str
    grant: ReportGrant
    objectives: List[str] = Field(default_factory=list)
    outputs: List[ReportOutput] = Field(default_factory=list)
    budget: List[ReportBudgetLine] = Field(default_factory=list)
    notes: Optional[str] = None


class DraftSentence(BaseModel):
    id: str = ""
    text: str
    sources: List[str] = Field(default_factory=list)
    # Who wrote it: CODE for the details, objectives, outputs and budget lists; AI for the narrative.
    origin: Literal["AI", "CODE"] = "AI"
    # The PI changed the text.
    edited: bool = False
    # Text in [square brackets] is an instruction for the PI to replace, never a fact.
    placeholder: bool = False
    # Set by the check: False when a fact in it isn't in the entries it cites.
    supported: bool = True
    problems: List[str] = Field(default_factory=list)
    # The PI checked an unsupported sentence and kept it.
    confirmed: bool = False


class DraftBlock(BaseModel):
    heading: Optional[str] = None
    style: Literal["paragraph", "list"] = "paragraph"
    sentences: List[DraftSentence] = Field(default_factory=list)


class DraftSection(BaseModel):
    key: str
    heading: str
    blocks: List[DraftBlock] = Field(default_factory=list)


class DraftEntry(BaseModel):
    """What an entry id stands for, so the editor can show a sentence's sources."""
    id: str
    label: str


class ReportDraft(BaseModel):
    title: str
    sections: List[DraftSection]
    entries: List[DraftEntry] = Field(default_factory=list)
    unsupported_count: int = 0
    placeholder_count: int = 0
    confirmed_count: int = 0
    model: str = ""
    warnings: List[str] = Field(default_factory=list)


class CheckDraftRequest(BaseModel):
    """Re-check a draft after the PI edited it, against the current records."""
    report: ReportInput
    title: str = ""
    sections: List[DraftSection]
