"""Stage B2: read structured facts from the budget, work plan, team and objectives.

One small AI call over those sections only (not the whole proposal). It
returns numbers, never verdicts: code compares them with the call's rules,
so "Rs. 82 lakh against a Rs. 60 lakh cap" is decided by arithmetic, not by
the model's reading.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Optional

from llm.gateway import generate_json

from .models import Budget, BudgetHead, BudgetItem, Facts, ProposalDocument, TeamMember

logger = logging.getLogger("proposal.facts")

FACT_SECTIONS = ["objectives", "work_plan", "budget", "team"]
MAX_SECTION_CHARS = 12_000

_PROMPT = """Read these sections of a research proposal and extract facts as numbers. Do not judge anything.

{sections}

Return JSON exactly in this shape. Use null when the text doesn't say. Convert all money to Indian lakh (1 lakh = Rs. 1,00,000; 1 crore = 100 lakh).
{{
  "budget": {{
    "total_lakh": 48.6,
    "heads": [{{"name": "Equipment", "amount_lakh": 12.6}}],
    "overhead_percent": 10,
    "overhead_lakh": 4.4,
    "items": [{{"name": "every purchase listed (equipment, vehicles, furniture, etc.)", "cost_lakh": 7.2, "head": "Equipment"}}],
    "has_year_wise_breakup": true
  }},
  "duration_months": 36,
  "team": [{{"name": "Dr. A. Rao", "role": "PI"}}],
  "objectives": ["each objective, shortened to at most 15 words"]
}}

Rules:
- "total_lakh" is the total the proposal states; if it states none, add up the heads.
- "items": list every individual thing to be bought, including anything under travel or contingency.
- "duration_months": the project duration stated in the work plan or timeline.
- "team": everyone named as PI, Co-PI or Co-Investigator, plus project staff positions.
"""


def fact_sections_text(doc: ProposalDocument) -> str:
    parts = []
    for canonical in FACT_SECTIONS:
        for section in doc.sections_for(canonical):
            parts.append(f"### {section.title}\n{section.text[:MAX_SECTION_CHARS]}")
    return "\n\n".join(parts)


def fact_sections_hash(doc: ProposalDocument) -> str:
    """Changes only when one of the sections facts are read from changes."""
    return "|".join(f"{s.key}:{s.hash}" for s in doc.sections if s.canonical in FACT_SECTIONS)


async def extract_facts(doc: ProposalDocument) -> Facts:
    """Raises if the AI call fails; the caller reports budget rules as not evaluated."""
    sections = fact_sections_text(doc)
    if not sections:
        return Facts()
    raw = await generate_json(
        _PROMPT.format(sections=sections),
        task="facts", temperature=0.0, max_output_tokens=2048, retries=1, thinking_budget=0,
    )
    return clean_facts(raw)


def clean_facts(raw: Any) -> Facts:
    if not isinstance(raw, dict):
        raise ValueError("Facts response was not an object")
    budget_raw = raw.get("budget") if isinstance(raw.get("budget"), dict) else None
    budget = None
    if budget_raw:
        heads = [
            BudgetHead(name=str(h.get("name")).strip(), amount_lakh=_num(h.get("amount_lakh")))
            for h in budget_raw.get("heads") or [] if isinstance(h, dict) and str(h.get("name") or "").strip()
        ]
        items = [
            BudgetItem(name=str(i.get("name")).strip(), cost_lakh=_num(i.get("cost_lakh")),
                       head=(str(i.get("head")).strip() or None) if i.get("head") else None)
            for i in budget_raw.get("items") or [] if isinstance(i, dict) and str(i.get("name") or "").strip()
        ]
        year_wise = budget_raw.get("has_year_wise_breakup")
        budget = Budget(
            total_lakh=_num(budget_raw.get("total_lakh")),
            heads=heads,
            overhead_percent=_num(budget_raw.get("overhead_percent")),
            overhead_lakh=_num(budget_raw.get("overhead_lakh")),
            items=items,
            has_year_wise_breakup=year_wise if isinstance(year_wise, bool) else None,
        )
    team = [
        TeamMember(name=str(m.get("name")).strip(), role=(str(m.get("role")).strip() or None) if m.get("role") else None)
        for m in raw.get("team") or [] if isinstance(m, dict) and str(m.get("name") or "").strip()
    ]
    objectives = [str(o).strip() for o in raw.get("objectives") or [] if str(o).strip()]
    return Facts(budget=budget, duration_months=_num(raw.get("duration_months")), team=team, objectives=objectives)


def _num(value: Any) -> Optional[float]:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = re.search(r"-?\d+(?:\.\d+)?", str(value).replace(",", ""))
    return float(match.group()) if match else None
