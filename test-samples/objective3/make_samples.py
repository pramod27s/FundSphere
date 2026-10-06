"""Builds the Objective 3 test PDFs in this folder.

Run from the repo root:  ai-service\\.venv\\Scripts\\python.exe test-samples\\objective3\\make_samples.py

The calls below are made up (realistic, but not real calls), so each one
has a known answer key in README.md. No libraries needed beyond Python.
"""
from __future__ import annotations

import os
import textwrap

HERE = os.path.dirname(os.path.abspath(__file__))
LINES_PER_PAGE = 50
WRAP = 100


def write_pdf(path: str, pages: list[list[str]] | None = None, scanned_pages: int = 0,
              font: str = "Helvetica", size: int = 10, leading: int = 14,
              page_size: tuple[int, int] = (612, 792)) -> None:
    """Text PDF (one string per line, in a standard PDF font) or, with
    scanned_pages, pages of grey bars and no text at all, like a scan."""
    page_streams: list[bytes] = []
    if pages:
        for lines in pages:
            parts = [f"BT /F1 {size} Tf {leading} TL 50 {page_size[1] - 32} Td"]
            for line in lines:
                safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
                parts.append(f"({safe}) Tj T*")
            parts.append("ET")
            page_streams.append(" ".join(parts).encode("latin-1"))
    for p in range(scanned_pages):
        bars = ["0.55 g"]
        y = 740
        for row in range(40):
            width = 300 + (row * 37 + p * 53) % 210
            bars.append(f"50 {y} {width} 7 re f")
            y -= 17
        page_streams.append(" ".join(bars).encode("latin-1"))

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


def paginate(paragraphs: list[str], wrap: int = WRAP, lines_per_page: int = LINES_PER_PAGE) -> list[list[str]]:
    """Wrap paragraphs into lines; "\\f" starts a new page."""
    pages, current = [], []
    for para in paragraphs:
        if para == "\f":
            pages.append(current)
            current = []
            continue
        lines = textwrap.wrap(para, wrap) if para else [""]
        if len(current) + len(lines) > lines_per_page:
            pages.append(current)
            current = []
        current.extend(lines)
    if current:
        pages.append(current)
    return pages


# ---------------------------------------------------------------------------
# 01: national agency core grant (3 pages, deadline stated)
# ---------------------------------------------------------------------------
SAMPLE_01 = [
    "Anusandhan Research Board (sample) - Core Research Grant (CRG)",
    "Call for Proposals 2026-27: Guidelines for Applicants",
    "",
    "1. Eligibility",
    "The Principal Investigator must hold a regular academic or research position in a recognised institution in India and must have at least five years of service remaining.",
    "The PI should possess a Ph.D. degree in Science, Engineering or Medicine.",
    "A PI may submit only one proposal under this call.",
    "",
    "2. Important dates",
    "The last date for online submission of proposals is 15 December 2026.",
    "Hard copies are not required unless specifically requested by the Board.",
    "\f",
    "3. Documents to be uploaded",
    "The proposal must be forwarded through the Head of the Institution with an endorsement certificate in the prescribed format given in Annexure-II.",
    "Biodata of the PI and Co-PI, not exceeding two pages each, should be uploaded.",
    "An undertaking regarding plagiarism, signed by the PI, is mandatory (Annexure-III).",
    "List of publications of the last five years is to be attached.",
    "Utilization Certificates of all previous grants from the Board, if any, must be uploaded.",
    "",
    "4. Format of the proposal",
    "The technical proposal should not exceed 15 pages, in Times New Roman 12 point font.",
    "The complete proposal must be uploaded as a single PDF file of size less than 5 MB.",
    "\f",
    "5. Budget",
    "The total budget shall not exceed Rs. 60 lakh for a period of three years.",
    "Overhead charges shall be 10% of the total project cost, subject to a maximum of Rs. 5 lakh.",
    "Purchase of vehicles and furniture is not permitted under the grant.",
    "",
    "6. Submission",
    "Proposals must be submitted online through the Board's portal only.",
    "Incomplete proposals will be rejected without review.",
]

# ---------------------------------------------------------------------------
# 02: state council seed grant with a hard copy that has its own date
# ---------------------------------------------------------------------------
SAMPLE_02 = [
    "State Science Council (sample), Government of Karnataka",
    "Research Grant for Scientists/Faculty (RGS/F) 2026-27: Call for Proposals",
    "",
    "1. About the scheme",
    "The scheme gives a one-time seed grant to help young faculty members start research in their own institutions.",
    "",
    "2. Eligibility",
    "The applicant must be a full-time regular faculty member in a Science, Engineering or Medical institution located in Karnataka.",
    "Visiting faculty, guest faculty and research scholars are not eligible to apply.",
    "The applicant should not be more than 45 years of age as on 1 November 2026.",
    "A Ph.D. degree is not mandatory.",
    "",
    "3. Grant",
    "The grant is up to Rs. 20 lakh for a period of two years.",
    "Not more than 60% of the grant can be spent on equipment.",
    "Salaries of permanent staff and foreign travel cannot be charged to the grant.",
    "\f",
    "4. How to apply",
    "The proposal must be submitted online on the Council portal on or before 20 November 2026.",
    "One hard copy of the online proposal, signed by the applicant and forwarded by the Principal or Head of the Institution, must reach the Council office in Bengaluru by 27 November 2026.",
    "The forwarding letter must be on the institution's letterhead in the format at Annexure-A.",
    "A certificate from the Registrar confirming that the applicant is a regular employee must be enclosed (Annexure-B).",
    "The proposal must be prepared in English in the format given in Annexure-C and must not exceed 10 pages.",
    "Enclose a copy of the applicant's date of birth proof (SSLC marks card or passport).",
    "Applicants may also enclose copies of their publications from the last two years.",
    "",
    "5. Selection",
    "Shortlisted applicants will present their proposals before the expert committee in January 2027.",
]

# ---------------------------------------------------------------------------
# 03: rolling fellowship with no closing date
# ---------------------------------------------------------------------------
SAMPLE_03 = [
    "Bharat Young Scientist Foundation (sample) - Early Career Fellowship",
    "Applications are accepted throughout the year and are reviewed every quarter.",
    "",
    "Eligibility",
    "Applicants must be Indian citizens below 35 years of age on the date of application. The upper age limit is relaxed by 5 years for SC, ST and OBC candidates, women and persons with disabilities.",
    "The Ph.D. degree must have been awarded within the last five years.",
    "Applicants must have a confirmed host institution in India before applying.",
    "",
    "Fellowship",
    "The fellowship is Rs. 70,000 per month plus a contingency grant of Rs. 2 lakh per year, for three years.",
    "",
    "Documents required",
    "Curriculum vitae of not more than three pages.",
    "Research proposal of not more than five pages in Arial 11 point font.",
    "A letter of support from the Head of the host institution.",
    "Two reference letters, to be sent directly by the referees to the Foundation.",
    "A copy of the Ph.D. degree certificate or provisional certificate.",
    "Candidates claiming age relaxation must upload a caste or disability certificate, if applicable.",
    "",
    "How to apply",
    "Apply through the online form on the Foundation website. Upload all documents as a single PDF file not larger than 10 MB.",
]

# ---------------------------------------------------------------------------
# 04: 30-page document, requirements buried among background text
# ---------------------------------------------------------------------------
FILLER = [
    "The programme aims to strengthen the national innovation ecosystem by supporting the development of indigenous technologies from the laboratory to the market. Over the last decade the Department has supported more than four hundred projects across engineering, health, agriculture and energy, many of which have resulted in products now used by industry and government agencies.",
    "Technology readiness is assessed on a nine-level scale. Projects supported under the programme are typically expected to move a technology from level three, where the concept has been proven in the laboratory, to level six or seven, where a prototype has been demonstrated in a relevant environment. The expert committee considers both the technical merit and the potential for adoption.",
    "Collaboration between academia and industry is at the heart of the programme. Experience shows that projects in which the industry partner is involved from the design stage are far more likely to be commercialised. The Department therefore encourages joint planning meetings, shared milestones and regular reviews involving both partners.",
    "The programme also recognises the importance of intellectual property. Institutions are encouraged to establish technology transfer offices and to train faculty in patenting and licensing. The Department has published a separate handbook on intellectual property management which may be consulted for further information.",
    "Monitoring of sanctioned projects is carried out through annual reviews by the expert committee. The committee may recommend mid-course corrections, additional support or, in rare cases, early closure of a project that is not making satisfactory progress. Site visits may be organised where necessary.",
    "Several success stories from earlier rounds of the programme are described in the annual report of the Department. These include low-cost diagnostic devices, water purification systems for rural areas, sensors for structural health monitoring and agricultural machinery adapted for small farms.",
]
REQUIREMENTS_04 = {
    4: "Eligibility: the Principal Investigator must be a regular employee of a recognised academic or research institution in India.",
    9: "An endorsement from the Head of the Institution in the format at Annexure-I is mandatory for every proposal.",
    12: "The industry partner must provide a letter of commitment on its letterhead, signed by an authorised signatory, stating its financial and in-kind contribution.",
    15: "The project proposal shall not exceed 25 pages and must use a font size of 11 points.",
    19: "Any single item of equipment costing above Rs. 20 lakh must be justified with three quotations. Overhead charges are limited to 8% of the total project cost.",
    23: "Proposals must be submitted on the e-PMS portal of the Department by 31 January 2027.",
    27: "Shortlisted proposals will be presented to the expert committee on 15 March 2027.",
    29: "A self-attested copy of the PI's Ph.D. certificate must be uploaded with the proposal.",
}


def sample_04() -> list[list[str]]:
    pages = []
    for page_no in range(1, 31):
        lines = [f"Technology Development Programme (sample) 2026: Guidelines - page {page_no}", ""]
        body_paras = []
        for k in range(5):
            body_paras.append(FILLER[(page_no + k) % len(FILLER)])
        if page_no in REQUIREMENTS_04:
            body_paras.insert(2, REQUIREMENTS_04[page_no])
        for para in body_paras:
            lines.extend(textwrap.wrap(para, WRAP))
            lines.append("")
        pages.append(lines[:LINES_PER_PAGE])
    return pages


if __name__ == "__main__":
    write_pdf("01-national-core-grant.pdf", paginate(SAMPLE_01))
    write_pdf("02-state-council-hard-copy.pdf", paginate(SAMPLE_02))
    write_pdf("03-rolling-fellowship-no-deadline.pdf", paginate(SAMPLE_03))
    write_pdf("04-long-30-pages.pdf", sample_04())
    write_pdf("05-scanned-no-text.pdf", scanned_pages=3)
    with open(os.path.join(HERE, "06-not-really-a-pdf.pdf"), "w", encoding="utf-8") as f:
        f.write("This is a plain text file with a .pdf name, to test bad uploads.\n")
    print("wrote 06-not-really-a-pdf.pdf")
