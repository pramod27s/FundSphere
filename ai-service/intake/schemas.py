"""Response of POST /intake/read-call: each grant detail with the sentence it came from."""
from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field

from award.schemas import SourcedField

DEADLINE_TYPES = ("FIXED", "ROLLING", "CALL_BASED", "UNKNOWN")
GRANT_TYPES = ("Research Grant", "Fellowship", "Seed Grant", "Award", "Travel Grant", "Conference Grant",
               "Scholarship", "Other")


class CallReading(BaseModel):
    """A field's value is filled only when its quote was found in the call and contains the value.

    Dates are YYYY-MM-DD, amounts whole rupees; requires_phd and open_all_year are "YES" or "NO".
    """
    title: SourcedField = Field(default_factory=SourcedField)
    agency: SourcedField = Field(default_factory=SourcedField)
    programme: SourcedField = Field(default_factory=SourcedField)
    purpose: SourcedField = Field(default_factory=SourcedField)
    deadline: SourcedField = Field(default_factory=SourcedField)
    opening_date: SourcedField = Field(default_factory=SourcedField)
    open_all_year: SourcedField = Field(default_factory=SourcedField)
    amount_min: SourcedField = Field(default_factory=SourcedField)
    amount_max: SourcedField = Field(default_factory=SourcedField)
    duration: SourcedField = Field(default_factory=SourcedField)
    eligibility: SourcedField = Field(default_factory=SourcedField)
    themes: SourcedField = Field(default_factory=SourcedField)
    application_link: SourcedField = Field(default_factory=SourcedField)
    requires_phd: SourcedField = Field(default_factory=SourcedField)
    citizenship: SourcedField = Field(default_factory=SourcedField)
    grant_type: SourcedField = Field(default_factory=SourcedField)
    # FIXED when a deadline was read, ROLLING when the call says it's open all year,
    # CALL_BASED when it opens through periodic calls, otherwise UNKNOWN.
    deadline_type: str = "UNKNOWN"
    warnings: List[str] = Field(default_factory=list)
    source_kind: str = ""   # "pdf", "web" or "text"
    source_name: str = ""   # file name, or the address the text came from
    source_url: str = ""    # the link the admin pasted, to fill the grant's link
    page_count: int = 0
