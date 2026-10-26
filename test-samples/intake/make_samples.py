"""Builds the test calls for "Add a grant" (2nd.md, Part B): made-up funding calls.

Run from the repo root:  ai-service\\.venv\\Scripts\\python.exe test-samples\\intake\\make_samples.py

The agencies, schemes, numbers and links (*.example.org) are invented and
every page is stamped as a test sample, so each call has a known answer key
(the S1-S5 dicts below, also in README.md). Each call tests something:
  01  a normal call: fixed deadline, opening date, amount in lakh, PhD required
  02  open all year, amounts in rupees (Indian grouping), no deadline
  03  amount in crore, and a results date that must not be taken as the deadline
  04  opens through calls announced from time to time; a PhD is not required
  05  pasted text (no PDF): a dotted date and a euro amount that must not be read as rupees
The PDF writer and banner come from ../objective4/make_samples.py.
"""
from __future__ import annotations

import datetime as dt
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("objective4_samples", os.path.join(HERE, "..", "objective4", "make_samples.py"))
_obj4 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_obj4)
LAKH = 100_000

# Answer keys. Amounts in whole rupees; None means the call doesn't state it.
S1 = {
    "file": "01-seed-grant-fixed-deadline.pdf",
    "title": "Seed Grant for Young Faculty 2026-27",
    "agency": "Karnataka Science Vision Board (sample)",
    "deadline": dt.date(2026, 11, 30),
    "opening_date": dt.date(2026, 10, 1),
    "deadline_type": "FIXED",
    "amount_min": None,
    "amount_max": 20 * LAKH,
    "duration": "2 years",
    "application_link": "https://ksvb-grants.example.org/apply",
    "requires_phd": "YES",
    "citizenship": "Indian",
}
S2 = {
    "file": "02-travel-support-open-all-year.pdf",
    "title": "International Travel Support for Researchers",
    "agency": "National Science Council (sample)",
    "deadline": None,
    "opening_date": None,
    "deadline_type": "ROLLING",
    "amount_min": 50_000,
    "amount_max": 2_50_000,
    "duration": None,
    "application_link": "https://nsc-travel.example.org/portal",
    "requires_phd": None,
    "citizenship": "Indian",
}
S3 = {
    "file": "03-centre-of-excellence-crore.pdf",
    "title": "Centres of Excellence in Translational Health Research",
    "agency": "Health Research Council (sample)",
    "deadline": dt.date(2027, 1, 15),
    "opening_date": None,
    "deadline_type": "FIXED",
    "amount_min": None,
    "amount_max": 150 * LAKH,
    "duration": "5 years",
    "application_link": "https://hrc-portal.example.org/coe",
    "requires_phd": "YES",
    "citizenship": None,
}
S4 = {
    "file": "04-innovation-scheme-periodic-calls.pdf",
    "title": "Rural Technology Innovation Scheme",
    "agency": "Anusandhan Research Board (sample)",
    "deadline": None,
    "opening_date": None,
    "deadline_type": "CALL_BASED",
    "amount_min": None,
    "amount_max": 30 * LAKH,
    "duration": "3 years",
    "application_link": None,
    "requires_phd": "NO",
    "citizenship": "Indian",
}
S5 = {
    "file": "05-joint-call-pasted-text.txt",
    "title": "Indo-European Joint Call on Clean Water Technologies",
    "agency": "Department of Science Programmes (sample)",
    "deadline": dt.date(2026, 12, 31),
    "opening_date": None,
    "deadline_type": "FIXED",
    "amount_min": None,
    "amount_max": 25 * LAKH,
    "duration": "3 years",
    "application_link": "https://dsp-joint.example.org/submit",
    "requires_phd": "YES",
    "citizenship": None,
}
SAMPLES = [S1, S2, S3, S4, S5]

TEXT = {
    S1["file"]: [
        "KARNATAKA SCIENCE VISION BOARD (SAMPLE)",
        "Call for Proposals: Seed Grant for Young Faculty 2026-27",
        "The Seed Grant for Young Faculty supports early-career teachers to start an independent research "
        "programme in science, engineering and medicine at institutions in Karnataka.",
        "",
        "1. Eligibility",
        "Regular faculty members below 40 years of age who hold a Ph.D. degree and work in a recognised "
        "institution in Karnataka may apply. Applicants must be Indian citizens.",
        "",
        "2. Financial support",
        "Each selected project receives up to Rs. 20 lakh for a period of 2 years, including equipment, "
        "consumables and a project assistant.",
        "\f",
        "3. Important dates",
        "Portal opens for applications: 1 October 2026.",
        "Last date for submission of proposals: 30 November 2026.",
        "Results will be announced in February 2027.",
        "",
        "4. How to apply",
        "Applications must be submitted online at https://ksvb-grants.example.org/apply along with the "
        "endorsement of the Head of the Institution.",
    ],
    S2["file"]: [
        "NATIONAL SCIENCE COUNCIL (SAMPLE)",
        "International Travel Support for Researchers",
        "The scheme helps researchers present their work at international conferences held outside India.",
        "",
        "Who can apply: faculty members and research scholars working in Indian universities and research "
        "institutions. Applicants must be Indian citizens.",
        "",
        "Support: the Council reimburses economy airfare and registration fee, between Rs. 50,000 and "
        "Rs. 2,50,000 per visit depending on the destination.",
        "",
        "Applications are accepted throughout the year, at least eight weeks before the conference begins.",
        "",
        "Apply through the travel portal: https://nsc-travel.example.org/portal",
    ],
    S3["file"]: [
        "HEALTH RESEARCH COUNCIL (SAMPLE)",
        "Call for Proposals: Centres of Excellence in Translational Health Research",
        "The Council invites proposals to set up multidisciplinary centres that take laboratory findings to "
        "clinical use in priority areas of public health.",
        "",
        "Funding: up to Rs. 1.5 crore per centre for 5 years.",
        "",
        "Eligibility: the Principal Investigator must hold a Ph.D. or MD and have at least ten years of "
        "research experience after the doctorate.",
        "\f",
        "Timeline",
        "Last date for receipt of full proposals: 15 January 2027.",
        "Shortlisted applicants present to the expert committee in March 2027.",
        "Final results will be declared by 31 March 2027.",
        "",
        "Proposals are submitted on the Council's portal: https://hrc-portal.example.org/coe",
    ],
    S4["file"]: [
        "ANUSANDHAN RESEARCH BOARD (SAMPLE)",
        "Rural Technology Innovation Scheme",
        "The scheme funds technologies that solve problems faced by rural communities, such as water, "
        "energy, farm tools and livelihoods.",
        "",
        "Support of up to Rs. 30 lakh per project is provided for a maximum period of 3 years.",
        "",
        "Eligibility: scientists, engineers and innovators in Indian academic institutions, R&D laboratories "
        "and registered NGOs. A Ph.D. is not required to apply. The applicant must be an Indian citizen.",
        "",
        "The scheme is open through calls announced from time to time on the Board's website. No call is "
        "open at present.",
    ],
    S5["file"]: [
        "DEPARTMENT OF SCIENCE PROGRAMMES (SAMPLE) - JOINT CALL",
        "Indo-European Joint Call on Clean Water Technologies",
        "Proposals are invited for joint research projects between Indian and European teams on low-cost "
        "water purification and reuse.",
        "Funding: the Indian team receives up to Rs. 25 lakh; the European partner is funded separately by "
        "its own agency, up to EUR 50,000. Projects run for 3 years.",
        "Who can apply: the Indian Principal Investigator must hold a Ph.D. and a regular position in an "
        "Indian institution.",
        "Last date for submission: 31.12.2026",
        "Submit the joint proposal at https://dsp-joint.example.org/submit",
    ],
}


def main() -> None:
    for sample in SAMPLES:
        paragraphs = TEXT[sample["file"]]
        path = os.path.join(HERE, sample["file"])
        if sample["file"].endswith(".txt"):
            with open(path, "w", encoding="utf-8") as f:
                f.write("FICTIONAL TEST SAMPLE FOR FUNDSPHERE - NOT AN OFFICIAL DOCUMENT\n\n" + "\n".join(paragraphs) + "\n")
            print("wrote", sample["file"])
        else:
            _obj4.write_pdf(path, _obj4.paginate(paragraphs))


if __name__ == "__main__":
    main()
