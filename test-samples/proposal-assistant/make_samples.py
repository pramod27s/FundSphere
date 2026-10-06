"""Builds the Proposal Assistant test PDFs in this folder.

Run from the repo root:  ai-service\\.venv\\Scripts\\python.exe test-samples\\proposal-assistant\\make_samples.py

One guidelines document (G1) and five proposals, each written with known
strengths or flaws so the expected result is clear (see README.md). The
calls and proposals are made up.
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "objective3"))
import make_samples as pdf_tools  # noqa: E402  (shared tiny PDF writer)

pdf_tools.HERE = HERE  # write into this folder

TITLE = "IoT-Based Early Warning System for Rainfall-Induced Landslides in the Western Ghats of Karnataka"

# ---------------------------------------------------------------------------
# G1: guidelines with required sections, format, budget rules, criteria
# ---------------------------------------------------------------------------
G1 = [
    "Anusandhan Research Board (sample) - Core Research Grant 2026-27",
    "Guidelines for Preparing the Technical Proposal",
    "",
    "1. Scope",
    "The scheme supports research projects in Science, Engineering and Medicine for a maximum duration of three years. Social science projects are not supported under this scheme.",
    "",
    "2. Format",
    "The technical proposal must not exceed 15 pages on A4 paper, in Times New Roman 12 point font with single line spacing.",
    "",
    "3. Required sections (in this order)",
    "1. Title of the project.",
    "2. Abstract of not more than 250 words.",
    "3. Introduction and origin of the proposal, including the national and international status of research on the topic.",
    "4. Objectives. Objectives must be specific and measurable.",
    "5. Methodology describing how each objective will be achieved.",
    "6. Work plan with a year-wise timeline and milestones (a Gantt chart is recommended).",
    "7. Expected outcomes and deliverables, linked to the objectives.",
    "8. Budget with a year-wise break-up and a justification for each budget head.",
    "9. Details of the Principal Investigator and Co-Investigators, with their roles in the project.",
    "10. References.",
    "\f",
    "4. Budget rules",
    "The total budget shall not exceed Rs. 60 lakh for three years.",
    "Allowed heads are Equipment, Manpower, Consumables, Travel, Contingency and Overhead.",
    "Manpower (JRF/SRF/Project Associate) must follow the current DST fellowship norms.",
    "Overhead charges shall be 10% of the total project cost, subject to a maximum of Rs. 5 lakh.",
    "Purchase of vehicles and furniture is not permitted.",
    "Any equipment costing more than Rs. 10 lakh must be supported by three quotations.",
    "",
    "5. Evaluation criteria",
    "Proposals will be evaluated by an expert committee on: novelty and scientific merit (25 marks), methodology and feasibility (30 marks), national relevance (15 marks), competence of the investigators (15 marks), and justification of the budget (15 marks).",
]

# ---------------------------------------------------------------------------
# P1: strong, complete, consistent
# ---------------------------------------------------------------------------
P1 = [
    f"Title: {TITLE}",
    "",
    "Abstract",
    "Rainfall-induced landslides in the Western Ghats of Karnataka killed more than 60 people and damaged over 2,000 houses between 2018 and 2024, mainly in Kodagu and Chikkamagaluru districts. Existing warnings are issued at district level from rainfall thresholds alone and cannot tell which slope is about to fail. We propose a low-cost network of soil-moisture, tilt and rain sensors on 12 high-risk slopes, connected by LoRaWAN to a cloud platform that combines live readings with a slope-stability model. The system will issue slope-level alerts by SMS to village officers. We will (1) develop a sensor node costing under Rs. 15,000, (2) calibrate site-specific warning thresholds using three monsoon seasons of field data, and (3) validate the alerts against recorded slope movements, targeting 85% detection with fewer than 10% false alarms. The project builds on the PI's earlier work on slope monitoring in Kodagu and will produce an open-source design that district disaster management authorities can adopt.",
    "",
    "Introduction and Origin of the Proposal",
    "Landslides are among the most frequent natural hazards in the Western Ghats. The Geological Survey of India has mapped over 1,200 landslide-prone locations in Karnataka. Internationally, sensor-based early warning has been demonstrated in Italy, Hong Kong and Taiwan, but these systems use equipment costing several lakh rupees per site. In India, Amrita University's system in Munnar showed that wireless sensors can predict slope failure hours in advance, but it relied on expensive imported sensors. National status: the National Landslide Risk Management Strategy (NDMA, 2019) calls for low-cost, community-level early warning, which does not exist yet for Karnataka. The proposal originates from the PI's 2021-2024 pilot at two slopes in Kodagu, which recorded tilt changes up to 18 hours before two small slope failures.",
    "",
    "Objectives",
    "1. Design and build a solar-powered sensor node (soil moisture at three depths, tilt, rainfall) costing under Rs. 15,000 per node.",
    "2. Deploy 48 nodes on 12 high-risk slopes and calibrate slope-specific warning thresholds from three monsoon seasons of data.",
    "3. Validate the alert system against recorded slope movements, achieving at least 85% detection with fewer than 10% false alarms.",
    "\f",
    "Methodology",
    "Objective 1: We will design the node around an ESP32 microcontroller with capacitive soil-moisture probes at 0.5 m, 1 m and 2 m, a MEMS tilt sensor and a tipping-bucket rain gauge. Prototypes will be tested in the laboratory flume for 3 months before field deployment.",
    "Objective 2: Twelve slopes will be selected with the Karnataka State Natural Disaster Monitoring Centre from the GSI inventory. Four nodes per slope will send data every 15 minutes over LoRaWAN gateways. Warning thresholds will be derived by combining measured pore-water pressure with an infinite-slope stability model, updated after each monsoon season.",
    "Objective 3: Slope movements will be recorded independently with survey markers and drone photogrammetry every month. Alerts will be compared with recorded movements to compute detection and false alarm rates in the third monsoon season.",
    "",
    "Work Plan and Timeline",
    "Year 1 (months 1-12): node design and flume testing (months 1-6); site selection and permissions (months 4-8); deployment on 12 slopes before the 2027 monsoon (months 9-12). Milestone: 48 nodes live.",
    "Year 2 (months 13-24): first and second monsoon data collection; threshold calibration; SMS alert module development. Milestone: calibrated thresholds for all slopes.",
    "Year 3 (months 25-36): third monsoon validation; hand-over training for district officers; open-source release. Milestone: validation report and design release.",
    "",
    "Expected Outcomes and Deliverables",
    "1. An open-source sensor node design costing under Rs. 15,000 (Objective 1).",
    "2. Calibrated warning thresholds for 12 slopes and a working SMS alert system (Objective 2).",
    "3. A validation report showing detection and false alarm rates, and two journal papers (Objective 3).",
    "4. Training of 30 district and village officers in using the system.",
    "\f",
    "Budget (Rs. lakh)",
    "Equipment: 48 sensor nodes (7.2), 4 LoRaWAN gateways (2.4), drone for photogrammetry (3.0). Total 12.6. Each item is below Rs. 10 lakh.",
    "Manpower: one JRF for 3 years as per DST norms (14.8), one Project Associate for 2 years (7.2). Total 22.0.",
    "Consumables: batteries, solar panels, cables, enclosures (4.5). Travel: field visits to 12 sites, 3 years (3.6). Contingency (1.5).",
    "Overhead: 10% of total (4.4).",
    "Year-wise: Year 1 - 24.1, Year 2 - 12.8, Year 3 - 11.7. Total: Rs. 48.6 lakh.",
    "Justification: equipment is front-loaded in Year 1 for deployment before the monsoon; the JRF runs field deployment and data analysis; the Project Associate builds the alert software in Years 2-3; travel covers monthly site visits during monsoons.",
    "",
    "Investigators",
    "PI: Dr. A. Rao, Associate Professor, Civil Engineering, 14 years' experience in geotechnical engineering, 22 journal papers; leads threshold modelling and validation.",
    "Co-PI: Dr. S. Hegde, Assistant Professor, Electronics and Communication, expert in IoT systems; leads node design and the alert platform.",
    "",
    "References",
    "1. NDMA (2019). National Landslide Risk Management Strategy.",
    "2. Ramesh, M.V. (2014). Design of a wireless sensor network for landslide detection. Journal of Network and Computer Applications, 38, 1-14.",
    "3. GSI (2020). National Landslide Susceptibility Mapping, Karnataka.",
    "4. Intrieri, E. et al. (2013). Design and implementation of a landslide early warning system. Engineering Geology, 147, 124-136.",
    "5. Rao, A. and Hegde, S. (2024). Field monitoring of slope tilt in Kodagu. Indian Geotechnical Journal, 54, 210-222.",
]

# ---------------------------------------------------------------------------
# P2: weak first draft (missing sections, vague, over-long abstract)
# ---------------------------------------------------------------------------
P2 = [
    "Title: A Study of Landslides in Karnataka Using Sensors",
    "",
    "Abstract",
    "Landslides are a major problem in India and in many other countries of the world. Every year many people lose their lives and property because of landslides, and the problem is getting worse because of climate change, deforestation and unplanned construction on hill slopes. Karnataka is also affected by landslides, especially during the monsoon season, and districts such as Kodagu, Chikkamagaluru, Hassan, Uttara Kannada and Dakshina Kannada have seen many landslides in recent years. There have been several studies on landslides in India, and some researchers have also tried to use sensors and other technologies to monitor landslides. However, more work is needed in this area. In this project we want to study landslides in Karnataka and also try to develop a system using sensors that can help in giving warnings to people. We will use different kinds of sensors and also use the internet to send the data. We will also use machine learning and artificial intelligence to analyse the data and predict landslides. This will be very useful for the government and also for the people living in the hilly areas. The project will also help students to learn about landslides and sensors. We will also publish papers in good journals and present our work in conferences. We will also try to make the system low cost so that it can be used in many places. We believe that this project will make a big contribution to society and to the field of landslide research in India and the world. The project is very important and timely, and we request the Board to support it. We are confident that we can complete the work successfully.",
    "",
    "Introduction",
    "Landslides happen when the soil on a slope becomes weak, usually because of heavy rain. Many landslides have happened in Karnataka. Sensors can be used to monitor slopes.",
    "",
    "Objectives",
    "1. To study landslides in Karnataka.",
    "2. To develop a sensor-based system.",
    "3. To use AI for prediction.",
    "\f",
    "Methodology",
    "We will buy sensors and install them on some slopes in the Western Ghats. The data will be sent to a server. We will apply machine learning to the data to predict landslides. We will test the system and improve it.",
    "",
    "Expected Outcomes",
    "A working landslide warning system and research papers.",
    "",
    "Investigators",
    "PI: Dr. A. Rao, Associate Professor, Civil Engineering.",
]

# ---------------------------------------------------------------------------
# P3: P2 revised (second version of the same draft)
# ---------------------------------------------------------------------------
P3 = [
    f"Title: {TITLE}",
    "",
    "Abstract",
    "Landslides in the Western Ghats of Karnataka killed more than 60 people between 2018 and 2024, mostly in Kodagu and Chikkamagaluru. Current warnings use district-level rainfall thresholds and cannot identify which slope is at risk. We will build a low-cost sensor node (soil moisture, tilt, rainfall), deploy it on 12 high-risk slopes, and calibrate slope-specific warning thresholds from three monsoon seasons. Alerts will be sent by SMS to village officers and validated against measured slope movements, targeting 85% detection with fewer than 10% false alarms. The open-source design will be offered to district disaster management authorities.",
    "",
    "Introduction and Origin of the Proposal",
    "The Geological Survey of India lists over 1,200 landslide-prone locations in Karnataka. Sensor-based warning systems in Italy and Hong Kong work well but are expensive; in India, a system in Munnar (Kerala) showed that wireless sensors can predict failures hours ahead. NDMA's 2019 strategy calls for low-cost community warning systems, which Karnataka does not yet have. This proposal grows out of the PI's two-slope pilot in Kodagu (2021-2024).",
    "",
    "Objectives",
    "1. Build a solar-powered sensor node costing under Rs. 15,000.",
    "2. Deploy 48 nodes on 12 slopes and calibrate slope-specific thresholds over three monsoons.",
    "3. Validate alerts against measured slope movements (at least 85% detection, under 10% false alarms).",
    "\f",
    "Methodology",
    "Objective 1: an ESP32-based node with soil-moisture probes at three depths, a tilt sensor and a rain gauge, tested in a laboratory flume for 3 months.",
    "Objective 2: slopes chosen with the Karnataka State Natural Disaster Monitoring Centre; readings every 15 minutes over LoRaWAN; thresholds from measured pore pressure and an infinite-slope stability model.",
    "Objective 3: monthly survey markers and drone photogrammetry measure actual movement; alerts are scored against these in the third monsoon.",
    "",
    "Work Plan and Timeline",
    "Year 1: node design and flume tests (months 1-6), site permissions (4-8), deployment (9-12). Year 2: two monsoons of data, threshold calibration, SMS module. Year 3: validation, training of officers, open-source release.",
    "",
    "Expected Outcomes and Deliverables",
    "Open-source node design (Objective 1); calibrated thresholds and SMS alerts for 12 slopes (Objective 2); validation report and two journal papers (Objective 3).",
    "",
    "Budget (Rs. lakh)",
    "Equipment 12.6 (48 nodes, 4 gateways, drone; each item under Rs. 10 lakh). Manpower 22.0 (JRF 3 years and Project Associate 2 years, DST norms). Consumables 4.5. Travel 3.6. Contingency 1.5. Overhead 10% (4.4). Total Rs. 48.6 lakh: Year 1 24.1, Year 2 12.8, Year 3 11.7.",
    "Justification: equipment is bought in Year 1 to deploy before the monsoon; the JRF handles fieldwork and analysis; the Project Associate builds the alert software.",
    "",
    "Investigators",
    "PI: Dr. A. Rao, Associate Professor, Civil Engineering (geotechnical modelling, validation). Co-PI: Dr. S. Hegde, Assistant Professor, Electronics (sensor node and alert platform).",
    "",
    "References",
    "1. NDMA (2019). National Landslide Risk Management Strategy.",
    "2. Ramesh, M.V. (2014). Wireless sensor network for landslide detection. J. Network and Computer Applications, 38, 1-14.",
    "3. Intrieri, E. et al. (2013). A landslide early warning system. Engineering Geology, 147, 124-136.",
]

# ---------------------------------------------------------------------------
# P4: complete but internally inconsistent and breaking budget rules
# ---------------------------------------------------------------------------
P4 = list(P1)
_replacements = {
    "3. Validate the alert system against recorded slope movements, achieving at least 85% detection with fewer than 10% false alarms.":
        "3. Validate the alert system against recorded slope movements, achieving at least 85% detection with fewer than 10% false alarms.\n4. Develop a Kannada mobile app that lets villagers report cracks and receive alerts.",
    "Year 1 (months 1-12): node design and flume testing (months 1-6); site selection and permissions (months 4-8); deployment on 12 slopes before the 2027 monsoon (months 9-12). Milestone: 48 nodes live.":
        "The project will be completed in 24 months. Months 1-8: node design, flume testing and deployment. Milestone: 48 nodes live.",
    "Year 2 (months 13-24): first and second monsoon data collection; threshold calibration; SMS alert module development. Milestone: calibrated thresholds for all slopes.":
        "Months 9-20: monsoon data collection, threshold calibration and SMS alert module. Milestone: calibrated thresholds.",
    "Year 3 (months 25-36): third monsoon validation; hand-over training for district officers; open-source release. Milestone: validation report and design release.":
        "Months 21-24: validation, training and open-source release.",
    "Equipment: 48 sensor nodes (7.2), 4 LoRaWAN gateways (2.4), drone for photogrammetry (3.0). Total 12.6. Each item is below Rs. 10 lakh.":
        "Equipment: 48 sensor nodes (7.2), 4 LoRaWAN gateways (2.4), terrestrial laser scanner (18.0), drone for photogrammetry (3.0). Total 30.6.",
    "Consumables: batteries, solar panels, cables, enclosures (4.5). Travel: field visits to 12 sites, 3 years (3.6). Contingency (1.5).":
        "Consumables: batteries, solar panels, cables, enclosures (4.5). Travel: field visits (3.6), plus one four-wheel-drive vehicle for site access (9.0). Contingency (1.5).",
    "Overhead: 10% of total (4.4).": "Overhead: 15% of total (10.8).",
    "Year-wise: Year 1 - 24.1, Year 2 - 12.8, Year 3 - 11.7. Total: Rs. 48.6 lakh.": "Total: Rs. 82.0 lakh.",
    "Co-PI: Dr. S. Hegde, Assistant Professor, Electronics and Communication, expert in IoT systems; leads node design and the alert platform.":
        "Project Associate: to be recruited.",
    "Objective 1: We will design the node around an ESP32 microcontroller with capacitive soil-moisture probes at 0.5 m, 1 m and 2 m, a MEMS tilt sensor and a tipping-bucket rain gauge. Prototypes will be tested in the laboratory flume for 3 months before field deployment.":
        "Objective 1: The Co-PI from Electronics will lead the design of the node around an ESP32 microcontroller with capacitive soil-moisture probes at 0.5 m, 1 m and 2 m, a MEMS tilt sensor and a tipping-bucket rain gauge. Prototypes will be tested in the laboratory flume for 3 months before field deployment.",
}
P4 = [_replacements.get(line, line) for line in P4]
P4 = [part for line in P4 for part in line.split("\n")]

# ---------------------------------------------------------------------------
# P5: social-science proposal sent to a science/engineering scheme
# ---------------------------------------------------------------------------
P5 = [
    "Title: Livelihoods and Social Security of Migrant Construction Workers in Bengaluru",
    "",
    "Abstract",
    "Bengaluru's construction sector employs an estimated 4 lakh migrant workers from North Karnataka, Odisha and Jharkhand. This study will survey 600 workers across 30 sites to understand wages, housing, access to welfare boards and the education of their children, and will recommend policy changes to the Karnataka Building and Other Construction Workers Welfare Board.",
    "",
    "Introduction",
    "Migrant construction workers are among the most vulnerable groups in urban India. Studies by sociologists and economists show low registration with welfare boards and poor access to schooling for children.",
    "",
    "Objectives",
    "1. Measure wages, working hours and housing conditions of 600 migrant workers.",
    "2. Estimate the share of workers registered with the welfare board and the benefits they receive.",
    "3. Recommend policy changes to improve social security coverage.",
    "",
    "Methodology",
    "A structured questionnaire survey of 600 workers using stratified random sampling, followed by 40 in-depth interviews and focus group discussions. Data will be analysed with descriptive statistics and logistic regression.",
    "",
    "Work Plan and Timeline",
    "Year 1: questionnaire design and pilot survey. Year 2: main survey and interviews. Year 3: analysis, report and policy workshop.",
    "",
    "Expected Outcomes",
    "A policy report for the welfare board and two papers in social science journals.",
    "",
    "Budget (Rs. lakh)",
    "Field investigators 9.0, travel 2.5, data entry 1.5, workshop 1.0, contingency 0.8, overhead 10% (1.5). Total Rs. 16.3 lakh.",
    "",
    "Investigators",
    "PI: Dr. K. Murthy, Associate Professor, Department of Sociology.",
    "",
    "References",
    "1. Breman, J. (1996). Footloose Labour. Cambridge University Press.",
]


if __name__ == "__main__":
    # Proposals follow G1's format rules (A4, Times New Roman 12 pt), except the
    # weak first draft P2 (US Letter, Helvetica 10 pt), so the format checks have
    # something to catch.
    times = dict(font="Times-Roman", size=12, leading=15, page_size=(595, 842))  # A4, as G1 requires

    def times_pages(paragraphs):
        return pdf_tools.paginate(paragraphs, wrap=88, lines_per_page=44)

    pdf_tools.write_pdf("G1-guidelines-core-grant.pdf", pdf_tools.paginate(G1))
    pdf_tools.write_pdf("P1-strong-complete.pdf", times_pages(P1), **times)
    pdf_tools.write_pdf("P2-weak-first-draft.pdf", pdf_tools.paginate(P2))
    pdf_tools.write_pdf("P3-revised-draft.pdf", times_pages(P3), **times)
    pdf_tools.write_pdf("P4-inconsistent-budget.pdf", times_pages(P4), **times)
    pdf_tools.write_pdf("P5-wrong-scheme-social-science.pdf", times_pages(P5), **times)
