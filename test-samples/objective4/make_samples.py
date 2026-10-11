"""Builds the Objective 4 test PDFs in this folder: made-up sanction orders.

Run from the repo root:  ai-service\\.venv\\Scripts\\python.exe test-samples\\objective4\\make_samples.py

The agencies, people, institutes and numbers are invented, and every page
is stamped as a test sample, so each order has a known answer key (see
README.md). Running the script also prints that key: the values to type
into "Add my grant" and what the grant page should then show.
No libraries needed beyond Python.
"""
from __future__ import annotations

import datetime as dt
import math
import os
import sys
import textwrap

HERE = os.path.dirname(os.path.abspath(__file__))
LINES_PER_PAGE = 56
WRAP = 84  # Courier 10 pt fits 84 characters between the margins
BANNER = "*** FICTIONAL TEST SAMPLE FOR FUNDSPHERE - NOT AN OFFICIAL DOCUMENT ***"
LAKH = 100_000
HEAD_ORDER = ["Equipment", "Manpower", "Consumables", "Travel", "Contingency", "Overhead", "Others"]


def write_pdf(path: str, pages: list[list[str]], font: str = "Courier", size: int = 10, leading: int = 13,
              page_size: tuple[int, int] = (612, 792)) -> None:
    """Text PDF, one string per line, in a standard PDF font."""
    page_streams: list[bytes] = []
    for lines in pages:
        parts = [f"BT /F1 {size} Tf {leading} TL 50 {page_size[1] - 40} Td"]
        for line in lines:
            safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            parts.append(f"({safe}) Tj T*")
        parts.append("ET")
        page_streams.append(" ".join(parts).encode("latin-1"))

    objs, kids = [], []
    font_id = 3 + 2 * len(page_streams)
    for i, stream in enumerate(page_streams):
        pid, cid = 3 + 2 * i, 4 + 2 * i
        kids.append(f"{pid} 0 R")
        objs.append(f"{pid} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_size[0]} {page_size[1]}] /Contents {cid} 0 R "
                    f"/Resources << /Font << /F1 {font_id} 0 R >> >> >> endobj\n".encode())
        objs.append(f"{cid} 0 obj << /Length {len(stream)} >> stream\n".encode() + stream + b"\nendstream endobj\n")
    head = [b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
            f"2 0 obj << /Type /Pages /Kids [{' '.join(kids)}] /Count {len(page_streams)} >> endobj\n".encode()]
    tail = [f"{font_id} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /{font} >> endobj\n".encode()]
    body, offsets = b"%PDF-1.4\n", []
    for obj in head + objs + tail:
        offsets.append(len(body))
        body += obj
    xref = f"xref\n0 {len(offsets) + 1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offsets)
    trailer = f"trailer << /Size {len(offsets) + 1} /Root 1 0 R >>\nstartxref\n{len(body)}\n%%EOF\n"
    with open(os.path.join(HERE, path), "wb") as f:
        f.write(body + xref.encode() + trailer.encode())
    print("wrote", path)


def paginate(paragraphs: list[str]) -> list[list[str]]:
    """Wrap paragraphs into lines ("\\f" starts a new page; lines starting
    with "|" are table rows and are kept as they are). Every page opens and
    closes with the test-sample banner."""
    usable = LINES_PER_PAGE - 4
    pages, current = [], []
    for para in paragraphs:
        if para == "\f":
            pages.append(current)
            current = []
            continue
        if para.startswith("|"):
            lines = [para[1:]]
        else:
            # No breaks at hyphens, so links like https://hrc-portal.example.org stay on one line to copy.
            lines = textwrap.wrap(para, WRAP, break_on_hyphens=False, break_long_words=False) if para else [""]
        if len(current) + len(lines) > usable:
            pages.append(current)
            current = []
        current.extend(lines)
    if current:
        pages.append(current)
    total = len(pages)
    return [[BANNER, ""] + page + ["", f"{BANNER}  (page {n} of {total})"] for n, page in enumerate(pages, 1)]


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def indian(n: int) -> str:
    """12,50,000 style grouping."""
    s = str(n)
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return ",".join(groups + [tail])


def rs(n: int) -> str:
    return f"Rs. {indian(n)}"


def lakh_text(n: int) -> str:
    """Rupees as the order prints them in lakh: 1200000 -> "12.00"."""
    return f"{n / LAKH:.2f}"


def lakh_input(n: int) -> str:
    """What to type in a FundSphere "lakh" box: 1200000 -> "12", 357000 -> "3.57"."""
    return f"{n / LAKH:.5f}".rstrip("0").rstrip(".")


def format_inr(n: int) -> str:
    """Same output as formatInr() in frontend/src/utils/formatFunding.ts."""
    def trim(x: float) -> str:
        r = math.floor(x * 10 + 0.5) / 10
        return str(int(r)) if r == int(r) else f"{r:.1f}"
    if n < LAKH:
        return f"₹{indian(n)}"
    if n < 100 * LAKH:
        return f"₹{trim(n / LAKH)} Lakh"
    return f"₹{trim(n / (100 * LAKH))} Cr"


def project_length(start: dt.date, end: dt.date) -> str:
    """Same output as projectLength() in frontend/src/components/awards/awardMeta.ts."""
    days = (end - start).days + 1
    months = max(1, math.floor(days / 30.44 + 0.5))
    years, rest = divmod(months, 12)
    year_text = "1 year" if years == 1 else f"{years} years"
    month_text = "1 month" if rest == 1 else f"{rest} months"
    if years == 0:
        return month_text
    return year_text if rest == 0 else f"{year_text} {month_text}"


def day(d: dt.date) -> str:
    return f"{d.day} {d.strftime('%B %Y')}"


# ---------------------------------------------------------------------------
# The five orders. Amounts are whole rupees.
# ---------------------------------------------------------------------------

S1 = dict(
    file="01-core-grant-3-years.pdf",
    tests="A normal 3-year grant: every standard head, amounts in lakh, and a total that matches the heads.",
    agency="Anusandhan Research Board (sample)",
    scheme="Core Research Grant",
    sanction_no="ARB/CRG/2026/000457",
    sanction_date=dt.date(2026, 7, 30),
    start=dt.date(2026, 8, 15),
    end=dt.date(2029, 8, 14),
    title="Low-cost paper sensors for arsenic in groundwater",
    pi="Dr. Kavya Rao, Department of Chemistry, Sample Institute of Technology, Bengaluru",
    heads={"Equipment": 1_200_000, "Manpower": 1_440_000, "Consumables": 600_000, "Travel": 150_000,
           "Contingency": 180_000, "Overhead": 357_000},
    total=3_927_000,
    portal="Another portal: https://portal.example.org/arb",
    unspent="Carried forward to the next year",
)

S2 = dict(
    file="02-year-wise-budget-in-rupees.pdf",
    tests="A year-wise budget table in rupees: add up each head across the years and type it in lakh. "
          "The project starts mid-year, and the order doesn't say what happens to unspent money.",
    agency="National Science Council (sample)",
    scheme="Early Career Research Grant",
    sanction_no="NSC/ECRG/2026-27/1182",
    sanction_date=dt.date(2026, 9, 18),
    start=dt.date(2026, 10, 1),
    end=dt.date(2029, 9, 30),
    title="Machine-learning models for early detection of crop stress from drone images",
    pi="Dr. Arjun Hegde, Department of Computer Science, Sample University, Mysuru",
    years={"Equipment": (850_000, 0, 0), "Manpower": (432_000, 432_000, 432_000),
           "Consumables": (150_000, 150_000, 100_000), "Travel": (50_000, 50_000, 50_000),
           "Contingency": (40_000, 40_000, 40_000), "Overhead": (150_000, 50_000, 50_000)},
    portal="Another portal: https://nsc-projects.example.org",
    unspent="Not sure yet (the order doesn't say)",
)
S2["heads"] = {head: sum(v) for head, v in S2["years"].items()}
S2["total"] = sum(S2["heads"].values())

S3 = dict(
    file="03-state-seed-grant-small-amounts.pdf",
    tests="A small 2-year state grant: amounts under Rs. 1 lakh, no Manpower or Overhead, an \"Others\" head, "
          "reports sent by post (no portal link), and unspent money that lapses on 31 March.",
    agency="State Council for Science and Technology (sample)",
    scheme="Seed Research Grant",
    sanction_no="SCST/SRG/2026/045",
    sanction_date=dt.date(2026, 9, 10),
    start=dt.date(2026, 10, 1),
    end=dt.date(2028, 9, 30),
    title="Survey of native pollinators in the coffee estates of Kodagu",
    pi="Dr. Meera Nanjappa, Department of Zoology, Sample First Grade College, Madikeri",
    heads={"Equipment": 150_000, "Consumables": 200_000, "Travel": 40_000, "Contingency": 25_000, "Others": 65_000},
    total=480_000,
    portal="Another portal, with the link left empty",
    unspent="Lapses on 31 March",
)

S4 = dict(
    file="04-recurring-non-recurring-heads.pdf",
    tests="Heads grouped as Non-recurring and Recurring: enter each item under its own standard head. "
          "Unspent money is deducted from the next release.",
    agency="Biotechnology Research Council (sample)",
    scheme="Extramural Research Project",
    sanction_no="BRC/EMR/2026/BT-0391",
    sanction_date=dt.date(2026, 12, 3),
    start=dt.date(2027, 1, 1),
    end=dt.date(2029, 12, 31),
    title="Drought-tolerance genes in finger millet landraces of Karnataka",
    pi="Dr. Sanjay Kulkarni, Department of Biotechnology, Sample Institute of Science, Dharwad",
    heads={"Equipment": 1_850_000, "Manpower": 2_160_000, "Consumables": 900_000, "Travel": 200_000,
           "Contingency": 240_000, "Overhead": 535_000},
    portal="Another portal: https://projects.example.org/brc",
    unspent="Deducted from the next release",
)
S4["total"] = sum(S4["heads"].values())

S5 = dict(
    file="05-already-running-grant.pdf",
    tests="A grant the PI already holds (started in 2025, ends on 29 February 2028, a leap day). Heads named "
          "differently from the standard ones, and an overhead given outside the \"total cost\", so the grand "
          "total is the one to enter.",
    agency="Health Research Council (sample)",
    scheme="Ad-hoc Research Project",
    sanction_no="HRC/ADHOC/2024/IRIS-77812",
    sanction_date=dt.date(2025, 2, 14),
    start=dt.date(2025, 3, 1),
    end=dt.date(2028, 2, 29),
    title="Community screening for anaemia in adolescent girls using a smartphone colour test",
    pi="Dr. Farah Siddiqui, Department of Community Medicine, Sample Medical College, Hubballi",
    heads={"Manpower": 1_332_000, "Consumables": 800_000, "Travel": 100_000, "Contingency": 158_000,
           "Others": 450_000, "Overhead": 284_000},
    cost_excluding_overhead=2_840_000,
    portal="Another portal: https://hrc-portal.example.org",
    unspent="Carried forward to the next year",
)
S5["total"] = sum(S5["heads"].values())

for sample in (S1, S3):
    assert sum(sample["heads"].values()) == sample["total"], sample["file"]
assert S5["cost_excluding_overhead"] + S5["heads"]["Overhead"] == S5["total"]


def header(s: dict, office: str) -> list[str]:
    return [
        s["agency"],
        office,
        "",
        f"|No. {s['sanction_no']}          Dated: {day(s['sanction_date'])}",
        "",
        "SANCTION ORDER",
        "",
    ]


def budget_rows_lakh(heads: dict[str, int], names: dict[str, str] | None = None) -> list[str]:
    names = names or {}
    rows = ["|  Budget head                              Amount (Rs. in lakh)",
            "|  ---------------------------------------  --------------------"]
    for head in HEAD_ORDER:
        if head in heads:
            rows.append(f"|  {names.get(head, head):<41}{lakh_text(heads[head]):>20}")
    return rows


def sample_01() -> list[str]:
    s = S1
    return header(s, "Division of Physical and Chemical Sciences") + [
        "Subject: Sanction of research grant under the Core Research Grant scheme.",
        "",
        f"1. The Board is pleased to sanction the research project entitled \"{s['title']}\" to "
        f"{s['pi']}, as Principal Investigator (PI).",
        "",
        f"2. Duration: three years from the date of start. The date of start of the project is "
        f"{day(s['start'])}, and the project shall end on {day(s['end'])}.",
        "",
        "3. The total cost of the project is Rs. "
        f"{lakh_text(s['total'])} lakh, as given below:",
        "",
        *budget_rows_lakh(s["heads"], {"Manpower": "Manpower (one Junior Research Fellow)",
                                       "Overhead": "Overhead (10% of the above)"}),
        "|  ---------------------------------------  --------------------",
        f"|  {'Total':<41}{lakh_text(s['total']):>20}",
        "",
        "4. The grant will be released in instalments. The second and later instalments will be released "
        "on receipt of the Utilisation Certificate (UC), the Statement of Expenditure (SE) and the annual "
        "progress report for the previous year.",
        "",
        "5. Any balance left unspent at the end of a financial year shall be carried forward to the next "
        "financial year during the tenure of the project.",
        "\f",
        "6. The UC and SE for each financial year shall be submitted soon after 31 March. The annual progress "
        "report shall be submitted at the end of each project year, counted from the date of start.",
        "",
        "7. All reports, UCs and SEs shall be uploaded on the Board's project portal at "
        "https://portal.example.org/arb.",
        "",
        "8. A request for a no-cost extension, if needed, must be made on the portal at least three months "
        "before the end date of the project.",
        "",
        "9. Equipment shall be purchased following the General Financial Rules and the procedures of the "
        "institution.",
        "",
        "",
        "(Programme Officer, sample)",
        "Anusandhan Research Board (sample)",
        "",
        "Copy to: The Registrar, Sample Institute of Technology, Bengaluru",
    ]


def sample_02() -> list[str]:
    s = S2
    rows = ["|  Head                   Year 1        Year 2        Year 3         Total (Rs.)",
            "|  --------------------   -----------   -----------   -----------   -------------"]
    labels = {"Manpower": "Manpower (1 PA)", "Overhead": "Overhead"}
    for head in HEAD_ORDER:
        if head in s["years"]:
            y1, y2, y3 = s["years"][head]
            rows.append(f"|  {labels.get(head, head):<20}{indian(y1):>14}{indian(y2):>14}{indian(y3):>14}"
                        f"{indian(sum((y1, y2, y3))):>16}")
    yt = [sum(v[i] for v in s["years"].values()) for i in range(3)]
    rows += ["|  --------------------   -----------   -----------   -----------   -------------",
             f"|  {'Total':<20}{indian(yt[0]):>14}{indian(yt[1]):>14}{indian(yt[2]):>14}{indian(s['total']):>16}"]
    return header(s, "Early Career Research Cell") + [
        f"Sub: Early Career Research Grant - sanction of the project \"{s['title']}\".",
        "",
        f"Sanction of the Council is hereby conveyed for the above project, to be carried out by {s['pi']}.",
        "",
        f"Period: 36 months, with effect from {day(s['start'])} (date of start) to {day(s['end'])}.",
        "",
        f"Total amount sanctioned: {rs(s['total'])} (Rupees {words(s['total'])} only). The year-wise budget "
        "is as follows (amounts in rupees):",
        "",
        *rows,
        "",
        "PA: Project Associate.",
        "",
        "The first instalment of Rs. " + indian(yt[0]) + " is released with this order. Further instalments "
        "will be released after the Council receives the Utilisation Certificate and the progress report.",
        "",
        "The grant is subject to the terms and conditions of the scheme. Reports are to be submitted on "
        "https://nsc-projects.example.org.",
        "",
        "",
        "(Scientist-in-charge, sample)",
        "National Science Council (sample)",
    ]


def sample_03() -> list[str]:
    s = S3
    rows = ["|  Item                                    Amount (Rs.)",
            "|  --------------------------------------  ------------"]
    labels = {"Equipment": "Equipment (field microscope, GPS unit)", "Others": "Field work and local transport"}
    for head in HEAD_ORDER:
        if head in s["heads"]:
            rows.append(f"|  {labels.get(head, head):<40}{indian(s['heads'][head]):>12}")
    rows += ["|  --------------------------------------  ------------",
             f"|  {'Total':<40}{indian(s['total']):>12}"]
    return header(s, "Seed Grant Programme") + [
        f"Sub: Seed Research Grant 2026-27 - \"{s['title']}\".",
        "",
        f"The Council is pleased to sanction {rs(s['total'])} to {s['pi']} for the above project for a "
        "period of two years.",
        "",
        f"The project shall commence on {day(s['start'])} and shall be completed by {day(s['end'])}.",
        "",
        "Break-up of the grant:",
        "",
        *rows,
        "",
        "Conditions:",
        "a) The unspent balance as on 31 March of each year shall lapse and shall not be carried forward.",
        "b) The Utilisation Certificate and the progress report shall be sent in hard copy, through the "
        "Principal, to the Member Secretary of the Council by post.",
        "c) No salary or honorarium shall be paid from this grant.",
        "",
        "",
        "(Member Secretary, sample)",
        "State Council for Science and Technology (sample)",
    ]


def sample_04() -> list[str]:
    s = S4
    h = s["heads"]
    non_recurring = h["Equipment"]
    recurring = h["Manpower"] + h["Consumables"] + h["Travel"] + h["Contingency"]
    rows = [
        "|                                                Rs. in lakh",
        "|  A. Non-recurring",
        f"|     Equipment (real-time PCR machine)        {lakh_text(h['Equipment']):>12}",
        f"|     Sub-total (A)                            {lakh_text(non_recurring):>12}",
        "|  B. Recurring",
        f"|     Manpower (1 SRF + 1 Lab Assistant)       {lakh_text(h['Manpower']):>12}",
        f"|     Consumables                              {lakh_text(h['Consumables']):>12}",
        f"|     Travel                                   {lakh_text(h['Travel']):>12}",
        f"|     Contingency                              {lakh_text(h['Contingency']):>12}",
        f"|     Sub-total (B)                            {lakh_text(recurring):>12}",
        f"|  C. Overhead (10% of A + B)                  {lakh_text(h['Overhead']):>12}",
        "|  -------------------------------------------------------",
        f"|  Grand total (A + B + C)                     {lakh_text(s['total']):>12}",
    ]
    return header(s, "Extramural Research Division") + [
        f"Subject: Sanction of the project \"{s['title']}\" under the {s['scheme']} scheme.",
        "",
        f"1. Sanction of the Council is accorded to the above project under {s['pi']} as PI, for three "
        f"years from {day(s['start'])} to {day(s['end'])}.",
        "",
        f"2. The budget sanctioned is Rs. {lakh_text(s['total'])} lakh:",
        "",
        *rows,
        "",
        "3. The unspent balance, if any, at the end of each financial year will be adjusted against the next "
        "release of the grant.",
        "",
        "4. Progress reports and the UC/SE (separately for recurring and non-recurring items) shall be "
        "uploaded on the Council's project portal, https://projects.example.org/brc.",
        "",
        "",
        "(Head, Extramural Research Division, sample)",
        "Biotechnology Research Council (sample)",
    ]


def sample_05() -> list[str]:
    s = S5
    h = s["heads"]
    rows = ["|  Budget item                                     Rs. in lakh",
            "|  ---------------------------------------------   -----------"]
    labels = [("Manpower", "Fellowship (1 JRF for 36 months)"), ("Consumables", "Consumables (test strips, reagents)"),
              ("Others", "Field work and sample collection"), ("Travel", "Travel"), ("Contingency", "Contingency")]
    for head, label in labels:
        rows.append(f"|  {label:<48}{lakh_text(h[head]):>11}")
    rows += ["|  ---------------------------------------------   -----------",
             f"|  {'Total cost of the project':<48}{lakh_text(s['cost_excluding_overhead']):>11}"]
    return header(s, "Division of Extramural Research") + [
        f"Subject: Ad-hoc research project \"{s['title']}\" - sanction.",
        "",
        f"1. The Council sanctions the above project to {s['pi']}.",
        "",
        f"2. Duration: three years, from {day(s['start'])} to {day(s['end'])}.",
        "",
        f"3. The total cost of the project is Rs. {lakh_text(s['cost_excluding_overhead'])} lakh "
        "(excluding institutional overhead), as follows:",
        "",
        *rows,
        "",
        f"4. In addition, institutional overhead of Rs. {lakh_text(h['Overhead'])} lakh (10% of the total cost) "
        f"is sanctioned, making the total commitment of the Council Rs. {lakh_text(s['total'])} lakh.",
        "",
        "5. Unspent balances may be carried forward to the next financial year with the approval of the "
        "Council.",
        "",
        "6. Annual progress reports and UCs are to be uploaded on https://hrc-portal.example.org. Before applying "
        "for a new project, the PI must certify that no UC or final report is pending.",
        "",
        "",
        "(Programme Officer, sample)",
        "Health Research Council (sample)",
    ]


def words(n: int) -> str:
    """Rupees in words, Indian style (lakh, thousand), for the amounts used here."""
    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
            "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def two(x: int) -> str:
        return ones[x] if x < 20 else (tens[x // 10] + (" " + ones[x % 10] if x % 10 else ""))

    def three(x: int) -> str:
        return (ones[x // 100] + " Hundred" + (" " + two(x % 100) if x % 100 else "")) if x >= 100 else two(x)

    parts = []
    for size, name in ((10_000_000, "Crore"), (LAKH, "Lakh"), (1000, "Thousand")):
        if n >= size:
            parts.append(f"{two(n // size)} {name}")
            n %= size
    if n:
        parts.append(three(n))
    return " ".join(parts)


def print_key(s: dict) -> None:
    print(f"\n{s['file']}")
    print(f"  title={s['title']} | start={s['start']} end={s['end']} | length={project_length(s['start'], s['end'])}")
    print(f"  total input={lakh_input(s['total'])} -> {format_inr(s['total'])}")
    allocated = sum(s["heads"].values())
    for head in HEAD_ORDER:
        if head in s["heads"]:
            v = s["heads"][head]
            print(f"  {head:<12} input={lakh_input(v):<8} -> {format_inr(v):<14} share={math.floor(v * 100 / s['total'] + 0.5)}%")
    print(f"  heads total {format_inr(allocated)} | portal: {s['portal']} | unspent: {s['unspent']}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # the key prints ₹, which a Windows console can't encode by default
    write_pdf(S1["file"], paginate(sample_01()))
    write_pdf(S2["file"], paginate(sample_02()))
    write_pdf(S3["file"], paginate(sample_03()))
    write_pdf(S4["file"], paginate(sample_04()))
    write_pdf(S5["file"], paginate(sample_05()))
    for sample in (S1, S2, S3, S4, S5):
        print_key(sample)
    wrong = S5["cost_excluding_overhead"]
    print(f"\n05 trap: total typed as {lakh_input(wrong)} -> heads are {format_inr(S5['total'] - wrong)} more than the total")
