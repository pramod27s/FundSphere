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
