"""Builds the sample PDFs in this folder: one call's guidelines and three
versions of one proposal (weak, better, strong), for trying the Checklist
and Proposal tabs and watching the score go up.

Run from the repo root:  ai-service\\.venv\\Scripts\\python.exe samples\\make_samples.py

The call, the council and the proposal are made up.
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "test-samples", "objective3"))
import make_samples as pdf_tools  # noqa: E402  (shared tiny PDF writer)

pdf_tools.HERE = HERE  # write into this folder

TITLE = "Smartphone-Based Early Detection of Coffee Leaf Rust Using Deep Learning for Smallholder Growers in Kodagu"

# ---------------------------------------------------------------------------
# Guidelines
# ---------------------------------------------------------------------------
GUIDELINES = [
    "Karnataka Science Council (sample) - Young Scientist Research Grant 2026-27",
    "Call for Proposals and Guidelines",
    "",
    "1. About the scheme",
    "The Young Scientist Research Grant supports early-career faculty in Science and Engineering to carry out an independent research project for up to two years. Social science and humanities projects are not supported under this scheme.",
    "",
    "2. Eligibility",
    "The applicant must be a regular faculty member in a recognised college or university in Karnataka.",
    "The applicant must be below 40 years of age on 1 December 2026. Proof of age (SSLC marks card or passport) must be attached.",
    "The scheme supports a single Principal Investigator. A senior mentor from the same institution may be named.",
    "",
    "3. Format of the proposal",
    "The technical proposal must not exceed 10 pages on A4 paper, in Times New Roman 12 point font with single line spacing.",
    "The summary must not exceed 200 words.",
    "",
    "4. Required sections (in this order)",
    "1. Title of the project.",
    "2. Summary of not more than 200 words.",
    "3. Background and rationale, including the present status of research in India and abroad.",
    "4. Objectives. Objectives must be specific and measurable.",
    "5. Methodology describing how each objective will be achieved.",
    "6. Work plan with a quarter-wise timeline and milestones.",
    "7. Expected outcomes, linked to the objectives.",
    "8. Budget with a year-wise break-up and a justification for each budget head.",
    "9. Details of the Principal Investigator and mentor, including the date of birth of the Principal Investigator.",
    "10. References.",
    "\f",
    "5. Budget rules",
    "The total budget shall not exceed Rs. 20 lakh for two years.",
    "Allowed heads are Equipment, Manpower, Consumables, Travel, Contingency and Overhead.",
    "Equipment shall not exceed 50% of the total budget.",
    "Manpower (JRF or Project Assistant) must follow the current DST fellowship norms.",
    "Overhead charges shall be 5% of the total project cost, subject to a maximum of Rs. 1 lakh.",
    "Purchase of laptops and furniture is not permitted.",
    "",
    "6. Documents to attach",
    "a) Endorsement letter from the Head of the Institution in the format given in Annexure I.",
    "b) Proof of age (SSLC marks card or passport).",
    "c) Two-page CV of the Principal Investigator.",
    "d) Undertaking that the same proposal has not been submitted to any other funding agency, in the format given in Annexure II.",
    "",
    "7. How to submit",
    "Proposals must be submitted online on the Council's portal.",
    "The last date for online submission is 15 December 2026.",
    "A signed hard copy, forwarded by the Head of the Institution, must reach the Council office in Bengaluru within 7 days of online submission.",
    "Incomplete proposals, or proposals received after the last date, will not be considered.",
    "",
    "8. Evaluation criteria",
    "Proposals will be evaluated by an expert committee on: novelty and scientific merit (20 marks), methodology and feasibility (30 marks), relevance to Karnataka (20 marks), competence of the Principal Investigator (15 marks), and justification of the budget (15 marks).",
]

# ---------------------------------------------------------------------------
# Version 3: strong and complete (written first; versions 1 and 2 are
# earlier, weaker drafts of it)
# ---------------------------------------------------------------------------
SUMMARY = (
    "Coffee leaf rust, caused by the fungus Hemileia vastatrix, cuts arabica yields in Kodagu and Chikkamagaluru by 20 to 40% "
    "in bad years, and smallholders usually notice it only when spraying is too late. Expert diagnosis needs a visit from a "
    "Coffee Board extension officer, who serves more than 2,000 growers. We will build a free Android app that detects rust "
    "from a leaf photo, works offline and gives advice in Kannada. We will (1) build a labelled dataset of 12,000 leaf images "
    "from 30 estates across two monsoon seasons, (2) train a compact deep learning model that runs on low-cost phones with at "
    "least 90% accuracy, and (3) field-test the app with 200 growers and measure how many days earlier rust is detected "
    "compared with current practice. The dataset and model will be released openly, and the app will be handed over to the "
    "Coffee Board's extension wing."
)

BACKGROUND = [
    "Background and Rationale",
    "Karnataka produces about 70% of India's coffee, and most of it comes from about 2.4 lakh smallholdings of under 4 hectares. Coffee leaf rust is the most damaging disease of arabica coffee. The Central Coffee Research Institute (CCRI) recommends spraying at the first sign of infection, but growers often miss the early symptoms, which appear as small pale-yellow spots on the underside of leaves.",
    "Status of research abroad: deep learning models have identified coffee leaf diseases from images in Brazil and Ethiopia with over 90% accuracy, but they were trained on laboratory photos and need an internet connection. Status in India: existing plant disease apps do not cover coffee, and no tool works offline or in Kannada. The PI's pilot in 2025 collected 1,800 images from four estates and reached 84% accuracy with a small model, which shows the approach is feasible.",
]

OBJECTIVES = [
    "Objectives",
    "1. Build an expert-labelled dataset of at least 12,000 coffee leaf images (healthy, early rust, advanced rust, and two look-alike conditions) from 30 estates in Kodagu and Chikkamagaluru.",
    "2. Train a deep learning model smaller than 10 MB that runs offline on Android phones costing under Rs. 10,000 and detects early rust with at least 90% accuracy.",
    "3. Field-test the app with 200 smallholder growers over one monsoon season and show that rust is detected at least 10 days earlier than with current practice.",
]

METHOD_1 = "Objective 1: Images will be collected every two weeks during the 2027 and 2028 monsoon seasons using six Android phones of different makes, in natural light. Each image will be labelled by two plant pathologists from CCRI, and a third will resolve disagreements. Look-alike conditions (nutrient deficiency and sun scorch) are included so that the model does not confuse them with rust."
METHOD_2 = "Objective 2: We will fine-tune MobileNetV3 and EfficientNet-Lite models, using 70% of the images for training, 15% for validation and 15% for testing, with each estate kept in only one split. The best model will be converted to TensorFlow Lite with 8-bit quantisation and tested for speed and accuracy on three low-cost phones."
METHOD_3 = "Objective 3: 200 growers in 20 villages, selected with the Coffee Board extension office, will use the app every week during the 2028 monsoon (months 16 to 21). A control group of 100 growers will follow current practice. We will record the date on which rust is first detected in each plot and compare the two groups."

WORK_PLAN_QUARTERS = [
    "Work Plan and Timeline",
    "Quarter 1 (months 1-3): recruitment of the JRF, purchase of equipment and selection of estates.",
    "Quarters 2-3 (months 4-9): first monsoon season of image collection and labelling. Milestone: 7,000 labelled images.",
    "Quarter 4 (months 10-12): model training and first version of the app. Milestone: model with at least 85% accuracy.",
    "Quarters 5-7 (months 13-21): second monsoon season of image collection, model retraining, Kannada advice content and the field trial with 200 growers. Milestone: 12,000 images, model at 90% accuracy and trial data.",
    "Quarter 8 (months 22-24): analysis, open release of the dataset and model, and hand-over to the Coffee Board. Milestone: trial report and app on the Play Store.",
]

OUTCOMES = [
    "Expected Outcomes",
    "1. An open dataset of 12,000 expert-labelled coffee leaf images (Objective 1).",
    "2. An offline Android app with a model under 10 MB, at least 90% accuracy and advice in Kannada (Objective 2).",
    "3. A field trial report showing how much earlier rust is detected, and two journal papers (Objective 3).",
    "4. Training for 200 growers and 10 Coffee Board extension staff in using the app.",
]

BUDGET_GOOD = [
    "Budget (Rs. lakh)",
    "Equipment: GPU workstation for model training (4.5), 6 Android phones of different makes for image collection (1.2), handheld microclimate logger set (1.8). Total 7.5, which is 39% of the total budget.",
    "Manpower: one JRF for 2 years as per DST norms (8.9).",
    "Consumables: sample bags, labels and phone accessories (0.6). Travel: field visits to 30 estates and 20 villages (0.9). Contingency (0.4).",
    "Overhead: 5% of the total project cost (0.96).",
    "Year-wise break-up: Year 1 - 13.55, Year 2 - 5.71. Total: Rs. 19.26 lakh.",
    "Justification: the equipment is bought in Year 1 so that image collection can start in the first monsoon. The GPU workstation is needed to train the models; the six phones of different makes make sure the model works on the cameras growers actually own; the logger records humidity and leaf wetness, which affect rust. The JRF collects and manages the images and runs the field trial. Travel covers fortnightly estate visits during both monsoons.",
]

PI_GOOD = [
    "Principal Investigator and Mentor",
    "Principal Investigator: Dr. N. Kariappa, Assistant Professor, Department of Computer Science and Engineering. Date of birth: 14 March 1991 (35 years on 1 December 2026). Six years of research in computer vision for agriculture, 9 journal papers, and a pilot study on coffee leaf images in 2025. Leads all three objectives.",
    "Mentor: Dr. P. Shetty, Professor, Department of Biotechnology, same institution. Advises on disease labelling and the design of the field trial.",
]

REFERENCES = [
    "References",
    "1. Talhinhas, P. et al. (2017). The coffee leaf rust pathogen Hemileia vastatrix: one and a half centuries around the tropics. Molecular Plant Pathology, 18, 1039-1051.",
    "2. Esgario, J.G.M. et al. (2020). Deep learning for classification and severity estimation of coffee leaf biotic stress. Computers and Electronics in Agriculture, 169, 105162.",
    "3. Howard, A. et al. (2019). Searching for MobileNetV3. Proceedings of the IEEE International Conference on Computer Vision, 1314-1324.",
    "4. Coffee Board of India (2024). Database on Coffee. Bengaluru.",
    "5. Kariappa, N. and Shetty, P. (2025). Early detection of coffee leaf rust with compact neural networks: a pilot study in Kodagu. Indian Journal of Agricultural Sciences, 95, 412-418.",
]

VERSION_3 = (
    [f"Title: {TITLE}", "", "Summary", SUMMARY, ""]
    + BACKGROUND + [""]
    + OBJECTIVES + ["\f", "Methodology", METHOD_1, METHOD_2, METHOD_3, ""]
    + WORK_PLAN_QUARTERS + [""]
    + OUTCOMES + ["\f"]
    + BUDGET_GOOD + [""]
    + PI_GOOD + [""]
    + REFERENCES
)

# ---------------------------------------------------------------------------
# Version 2: much better, but still has problems (none of them breaks a
# critical rule, which would cap the score at 49)
#   - background has no status of research in India and abroad
#   - objectives 2 and 3 can't be measured
#   - thin methodology, and none at all for Objective 3 (field trial)
#   - work plan is year-wise, not quarter-wise
#   - no year-wise budget break-up, and a one-line justification
#   - no date of birth for the PI (age limit)
# ---------------------------------------------------------------------------
VERSION_2 = (
    [f"Title: {TITLE}", "", "Summary", SUMMARY, ""]
    + [
        "Background and Rationale",
        "Karnataka produces most of India's coffee, and coffee leaf rust is the most damaging disease of arabica coffee. Growers often miss the early symptoms, and by the time they spray, the damage is done. A phone app that spots rust early would help them.",
        "",
        "Objectives",
        "1. Build an expert-labelled dataset of at least 12,000 coffee leaf images from estates in Kodagu and Chikkamagaluru.",
        "2. Train a deep learning model that detects coffee leaf rust accurately on mobile phones.",
        "3. Test the app with coffee growers and see whether it helps them.",
        "\f",
        "Methodology",
        "Objective 1: We will visit coffee estates during the monsoon and photograph healthy and infected leaves with Android phones. Experts will label the images.",
        "Objective 2: We will train standard deep learning models on the images and choose the most accurate one for the app.",
        "",
    ]
    + [
        "Work Plan and Timeline",
        "Year 1: recruitment, purchase of equipment, first season of image collection and labelling, first model and app.",
        "Year 2: second season of image collection, model improvement, field trial, papers and open release.",
        "",
    ]
    + OUTCOMES + ["\f"]
    + [
        "Budget (Rs. lakh)",
        "Equipment: GPU workstation for model training (4.5), 6 Android phones for image collection (1.2), handheld microclimate logger set (1.8). Total 7.5.",
        "Manpower: one JRF for 2 years as per DST norms (8.9).",
        "Consumables (0.6). Travel (0.9). Contingency (0.4).",
        "Overhead: 5% of the total project cost (0.96).",
        "Total: Rs. 19.26 lakh.",
        "Justification: the equipment and staff are needed to collect the images, train the model and build the app.",
        "",
        "Principal Investigator and Mentor",
        "Principal Investigator: Dr. N. Kariappa, Assistant Professor, Department of Computer Science and Engineering. Six years of research in computer vision for agriculture and 9 journal papers.",
        "Mentor: Dr. P. Shetty, Professor, Department of Biotechnology, same institution.",
        "",
    ]
    + REFERENCES
)

# ---------------------------------------------------------------------------
# Version 1: weak first draft
#   - no work plan, no budget, no references
#   - summary of about 290 words (limit 200)
#   - vague objectives that can't be measured
#   - Helvetica 10 pt on US Letter paper (rule: Times New Roman 12 pt, A4)
#   - no date of birth for the PI
# ---------------------------------------------------------------------------
VERSION_1 = [
    "Title: Detection of Plant Diseases Using Artificial Intelligence",
    "",
    "Summary",
    "Agriculture is the backbone of India and most of the people in India depend on agriculture for their livelihood. Plant diseases are a big problem for farmers because they reduce the yield and quality of crops and cause heavy losses. Coffee is an important crop in Karnataka, especially in Kodagu, Chikkamagaluru and Hassan districts, and coffee plants are affected by many diseases such as leaf rust, black rot and berry borer. Farmers often do not know about these diseases in time and they depend on experts who are not always available. Nowadays artificial intelligence and deep learning are being used in many fields such as healthcare, finance and transportation, and they can also be used in agriculture. Many researchers in the world have used deep learning to detect plant diseases from images of leaves and they have got good results. In this project we want to use artificial intelligence to detect diseases in coffee plants. We will collect images of coffee leaves and train a deep learning model. We will also develop a mobile app so that farmers can take a photo of a leaf and know the disease. The app will be easy to use and it will also give suggestions to the farmers. This will help farmers to save their crops and increase their income. The project will also help students to learn about artificial intelligence and agriculture. We will publish papers in reputed journals and conferences. We believe that this project is very useful for society and we request the Council to kindly support this project. We are confident that we will complete the project successfully within the time.",
    "",
    "Background",
    "Plant diseases cause losses of crores of rupees every year. Deep learning has been used for detecting diseases in tomato, potato and rice. Coffee is also an important crop and there is a need to use new technology for coffee farmers.",
    "",
    "Objectives",
    "1. To study the diseases of coffee plants.",
    "2. To develop an AI based mobile app.",
    "3. To help coffee farmers.",
    "",
    "Methodology",
    "We will visit coffee estates and take photos of leaves. Then we will use deep learning models like CNN to train on the photos. After that we will make an Android app and give it to farmers.",
    "",
    "Expected Outcomes",
    "A mobile app for coffee farmers and research papers.",
    "",
    "Investigator",
    "Dr. N. Kariappa, Assistant Professor, Department of Computer Science and Engineering.",
]


if __name__ == "__main__":
    # Versions 2 and 3 follow the format rules (A4, Times New Roman 12 pt).
    # Version 1 uses the writer's default (US Letter, Helvetica 10 pt), so the
    # format checks have something to catch.
    times = dict(font="Times-Roman", size=12, leading=15, page_size=(595, 842))

    def times_pages(paragraphs):
        return pdf_tools.paginate(paragraphs, wrap=88, lines_per_page=44)

    pdf_tools.write_pdf("1-guidelines.pdf", pdf_tools.paginate(GUIDELINES))
    pdf_tools.write_pdf("2-proposal-version-1.pdf", pdf_tools.paginate(VERSION_1))
    pdf_tools.write_pdf("3-proposal-version-2.pdf", times_pages(VERSION_2), **times)
    pdf_tools.write_pdf("4-proposal-version-3.pdf", times_pages(VERSION_3), **times)
