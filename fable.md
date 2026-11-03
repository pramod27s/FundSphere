# FundSphere — Next Phase Plan (Objectives 3 & 4), v3

**Prepared:** 5 October 2026 (replaces v1 of 3 October). **v3, 11 October 2026:** Objective 4 revised after checking current agency rules and existing tools; the changes are listed at the top of §6.
**Audience:** FundSphere team and project guide
**Based on:** v1 of this plan, `claudesuggestions.md`, and the codebase at commit `3c9c7cc`

> **Decision:** Build two small, high-value objectives, with **8 Must-have features in total**.
>
> - **Objective 3 — Application Readiness Workspace:** *"Don't get rejected for a missing annexure."*
> - **Objective 4 — Grant Compliance Desk:** *"Never miss a UC or report deadline, never write a progress report from scratch."*
>
> Each objective has one AI centrepiece, uses tools researchers already have (WhatsApp, Google Calendar, ORCID), and avoids the infrastructure that made v1 heavy: no file storage, no email server and no permission system in the Must-haves.

---

## 1. What changed from v1

| | v1 | v2 |
|---|---|---|
| Must-have features | 11 | **8** (4 per objective) |
| New infrastructure | Notification service, email, file storage (MinIO), role system, invite emails | **None needed for the Musts.** Reminders go through Google Calendar and coordination goes through WhatsApp. |
| Team collaboration | Accounts, 4 roles, email invites, permission tests | Each item gets an owner's name (no account needed), and the pending list is shared to WhatsApp. Invites by link are a Should-have. |
| Getting post-award data in | AI sanction-order parser (Must) | A 3-minute form with the standard heads pre-filled. The parser that fills the same form is a Should-have. |
| Logging outputs for reports | PI types everything | **Papers are imported from ORCID.** The PI types only students, equipment and milestones. |
| UC/SE drafts | Should | Could, until interviews confirm that PFMS doesn't already produce them |
| Foundation sprint | 16 items | **6 items** |

**Why:** a researcher tries a new tool once. If the first use needs an account for every student, an email invite or uploading every document, they go back to WhatsApp and Excel. v2 makes the first use take minutes and pay off immediately.

---

## 2. Design rules (why Indian researchers will like it)

1. **Prevent the two failures that cost the most:** a proposal rejected for a technicality, and a delayed instalment or lapsed funds after the award.
2. **No new habits.** Reminders land in **Google Calendar** on the phone, tasks go to the lab **WhatsApp** group, and papers come from **ORCID**.
3. **Under 3 minutes of typing** to set up an application or a grant.
4. **AI drafts, the PI decides.** Every AI-extracted line shows its source sentence, and every report draft is marked "Draft".
5. **Indian by default:** April–March financial year, standard budget heads (Equipment, Manpower, Consumables, Travel, Contingency, Overhead, Others), lakh/crore amounts (`formatFunding.ts`), and Indian agency names.

---

## 3. Pain points targeted

| # | Pain point | Solved by |
|---|---|---|
| P1 | Calls are scattered across ANRF, DST, DBT, ICMR, CSIR, UGC, AICTE, ICSSR, BIRAC and state councils | Foundation F3–F4 (data pipeline) |
| P2 | Proposals rejected for mechanical reasons: missing annexure, wrong format, budget over cap, no endorsement letter | **3.2, 3.3** |
| P3 | A missed UC or SE delays the next instalment | **4.2** |
| P4 | Progress reports are tedious and repetitive | **4.4** |
| P5 | Money left unspent near 31 March lapses or is deducted from the next release, depending on the grant | **4.3** |
| P6 | Budget heads and caps are confusing | 3.2 (caps from guidelines), **4.3** |
| P7 | Preparation is coordinated over WhatsApp with no clarity on who does what | **3.3, 3.4** |
| P8 | Missing a yearly cycle means waiting 12 months | 3.8 (Should) |
| P9 | Tier-2/3 colleges have no research office | **3.2** (the checklist acts as the research office) |
| P10 *new* | Head of Institution forwarding and sign-offs eat the last week before the deadline | **3.3** (sign-off items get earlier due dates) |
| P11 *new* | Equipment purchases above ₹2 lakh still need quotations, a purchase committee or a tender, so the Equipment head is often spent late (GeM has not been mandatory for research equipment since June 2025) | **4.3** (early Equipment warning) |
| P12 *new* | Re-appropriation between heads and project extensions need formal request letters | 4.6 (Should) |
| P13 *v3* | Each agency has its own portal (ANRF, eProMIS, ePMS, plus PFMS for the UC), and nothing shows what's due across all of a PI's grants | **4.2** |
| P14 *v3* | A pending UC or final report can block new proposals (ICMR asks applicants to certify that none is pending) | **4.2**, §7 |

---

## 4. Foundation sprint (weeks 1–2, whole team)

Only what the two objectives actually depend on.

| # | Item | Action |
|---|---|---|
| F1 | **Security quick fixes** (half a day) | *Done in `3c9c7cc`:* the scraper endpoints on `GrantController` now check the internal token through `InternalAuthVerifier`, and editing or deleting grants needs the ADMIN role. *Still to do:* remove `allowedOrigins("*")` from `CorsConfig.java` (`SecurityConfig` already reads `app.frontend.origin`), raise the access token from 90 s to 15 min (`security.jwt.access-token-expiration-ms`), turn on `show-sql` and `format_sql` only in a dev profile, and delete the committed debug scripts (`test_ai_fetch.py`, `test_upsert.py`, `rename_index.py`). |
| F2 | **Saved-grant status cleanup** | `saved_grants` becomes a plain bookmark. Applying, Submitted and Rejected rows migrate into applications (3.1). |
| F3 | **Scraper that actually runs** | Every run since 29 May has aborted because CoreBackend wasn't up. The new GitHub Actions workflow (`.github/workflows/scraper-cron.yml`) runs daily but only works if GitHub can reach the backend at a public `BACKEND_URL`. **Choose one:** deploy the backend publicly and keep the workflow, or run the scraper next to the backend (a Docker Compose service or a Spring `@Scheduled` trigger) and delete the workflow. Either way, show an alert when a run aborts. |
| F4 | **Indian agency coverage** | *Done in `3c9c7cc`:* `deadlineType` (FIXED / ROLLING / CALL_BASED / UNKNOWN), with rolling schemes shown as "Open all year", and seed URLs for ANRF, BIRAC and ICSSR. *Still to do:* find crawlable call pages for DST, DBT, ICMR and CSIR (their main sites failed a static crawl, as noted in `smart_scheduler.py`), and add UGC, AICTE and the Karnataka bodies your faculty use (VGST, KSCST). |
| F5 | **Browse shows only usable grants** | Hide closed grants by default (with a "Show closed" toggle), and move filters to the server so they work across all pages. |
| F6 | **Faculty interviews** | Interview 5–6 faculty who hold grants (questions in §11). Download **15 public guideline PDFs** for the Obj 3 evaluation. Ask for redacted progress reports and sanction orders. |

**Data target for week 4 (agree with the guide):** at least 100 open or rolling Indian calls, and fewer than 25% of grants with an unknown deadline. Today only 6 of 297 grants (2%) have an upcoming deadline.

**Moved out of the foundation:** email sending, file storage, CI and the docs update. None of the Must-haves needs them. Add CI if time allows.

---

## 5. Objective 3 — Application Readiness Workspace

**Formal statement:**
> To develop an application readiness workspace in which a large language model extracts a source-cited requirements checklist from a funding agency's guidelines, and which helps Indian research teams track every requirement through to a complete, compliant submission.

**Solves:** P2, P7, P9, P10

**User story:** *As an assistant professor applying to ANRF for the first time, I upload the call guidelines and in a minute I see every document, limit and sign-off the agency wants, who in my lab is doing each one, and how ready we are.*

### Must-have

| # | Feature | What it does | Done when |
|---|---|---|---|
| 3.1 | **Start an application** | A **Start application** button on any saved grant or grant details page. **Add a call not in FundSphere** covers outside calls (title, agency, deadline, link). Status: Preparing → Submitted → Awarded / Not funded, with the date of each change. | Both paths create an application, and the status history is kept. |
| 3.2 | **AI requirements checklist** ★ | Upload the guidelines PDF or paste the call's link. The AI extracts and groups: **documents and annexures** (CV, endorsement, undertakings), **format limits** (pages, font, word counts), **eligibility proofs**, **budget rules** (cap, disallowed items, overhead %), **submission details** (portal, online or hard copy) and **key dates**. **Every item shows the sentence and page it came from.** The PI can edit items, add their own and mark items not applicable. | Every item's source quote is checked against the PDF text (unmatched ones are tagged "Unverified source"), a 30-page PDF finishes in under 60 seconds, scanned PDFs get a clear message, and items can be edited. |
| 3.3 | **Readiness tracker** | Each item gets an **owner** (any name, such as "Ravi (JRF)", with no account needed), a **due date** counted back from the call deadline (sign-off items such as HoI endorsement default to 7 days before, everything else to 3 days before, both editable) and a status: To do / Done / Not applicable. A **readiness %** (mandatory items done ÷ mandatory items) and a deadline countdown sit at the top. | Readiness updates immediately, and due dates move when the deadline changes. |
| 3.4 | **Share and remind** | **Send pending list to WhatsApp:** pending items grouped by owner with due dates, reusing the `wa.me` pattern in `shareGrant.ts`. **Add to Google Calendar:** an `.ics` file with the call deadline and every item due date. | The WhatsApp message opens pre-filled on phone and desktop, and the `.ics` file imports into Google Calendar. |

### Should-have (only after all Musts pass)

| # | Feature | What it does |
|---|---|---|
| 3.5 | Proposal reviews inside the application | Run the existing Proposal Assistant with this call's guidelines already attached. Save every review and show the score trend (v1: 68, v3: 84). This also fixes reviews being lost on refresh. **Built (6 Oct 2026)** as the Proposal tab of each application; see `docs/proposal-assistant-design.md`. |
| 3.6 | Fill annexure formats | The AI fills the guidelines' own formats (HoI endorsement, undertaking, certificates) with the PI's profile and institution details and exports them to DOCX, ready to print on letterhead. |
| 3.7 | Invite the team by link | Two roles, Owner and Member. The invite link is shared on WhatsApp, so no email is needed. Members tick off their own items. |
| 3.8 | Not-funded notes and next-cycle reminder | Record reviewer comments. When the scheme reopens, the reminder includes those notes (P8). |

### Could-have

Email digest, uploading documents into the application, a pre-award budget builder.

### Evaluation

| What | Method | Target |
|---|---|---|
| Checklist extraction | 15 public guideline PDFs from at least 6 agencies. Two team members label each one independently, faculty resolve disagreements, and agreement is reported. | F1 ≥ 0.80; correct source quote for ≥ 95% of items |
| Speed | Time a 30-page PDF from upload to checklist | < 60 seconds |
| Usefulness | 3–4 faculty prepare a mock application with and without FundSphere | Fewer missed requirements |

The guideline PDFs are public, so this evaluation doesn't depend on anyone sharing private documents.

### Implementation notes

- **Route:** `POST /workspace/extract-checklist` in the AI service. It extends the `proposal/rubric.py` schema and caches results by content hash in the same way. It reuses `pdf_extractor.py`, `gemini_client.generate_json` (with Groq fallback) and, for links, the Firecrawl fetch from the scraper.
- **Page numbers:** `extract_text_from_pdf` joins every page into one string and skips empty pages, so it can't say where a sentence came from. Add `extract_pages(file_bytes) -> list[str]` that keeps one entry per page (empty pages included, so page numbers stay correct), and send the text to the LLM with a `[Page N]` marker before each page.
- **Checking source quotes:** the LLM returns `source_quote` and `source_page` for each item. Code then searches for the quote in that page's text, ignoring case and whitespace, and allows small differences (word-level fuzzy match with Python's built-in `difflib`: at least 90% of the quote's words, in order, near each other; no new dependency). If the quote is found on another page, the page is corrected. If it isn't found anywhere, the item is shown with an "Unverified source" tag for the PI to check. This automates the "correct source quote" target in the evaluation.
- **Scanned PDFs:** if a PDF returns almost no text (for example, under 200 characters for the whole file), don't call the LLM. Tell the user it looks like a scanned PDF and ask them to paste the call's link or the guideline text instead. OCR is out of scope this phase.
- **Frontend:** add **Applications** to the nav rail. An application page has three tabs: Checklist, Readiness and Proposal (Should).

---

## 6. Objective 4 — Grant Compliance Desk

> **Revised in v3 (11 October 2026)** after checking current agency rules, portal manuals and existing tools (sources at the end of this section):
>
> 1. **Positioning.** Agency portals (ANRF, DBT eProMIS, ICMR ePMS, PFMS) are where documents are submitted, and institute systems (Samarth eGov, IIT Delhi's IRIS) already keep project accounts and prepare UCs. Obj 4 is the PI's own assistant that sits beside them. It doesn't do accounting, produce official UCs or submit anything.
> 2. **Priority.** The progress-report draft (4.4) and the calendar (4.2) are what no existing tool covers, so they come first. The spend tracker (4.3) becomes a light balance check and is built last.
> 3. **Two facts corrected.** Since a Finance Ministry memo of 5 June 2025, research and academic institutions can buy scientific equipment outside GeM, so GeM is no longer the reason for the early Equipment warning. And what happens to money unspent on 31 March differs by grant (it may lapse, be deducted from the next release, or carry forward), so it's now a setting on each grant.
> 4. **Two new deadlines.** The no-cost extension request (ANRF asks for it 3 months before the end date), and a check for pending UCs before a new application (ICMR asks applicants to certify that no UC or final report is pending).

**Formal statement:**
> To design a researcher-facing post-award assistant that turns an Indian research grant's sanction details into a financial-year-aware compliance calendar across funding agencies, uses a large language model to draft progress reports grounded only in the project's recorded outputs, and warns the PI early about slow budget utilization.

**Solves:** P3, P4, P5, P6, P11, P13, P14

**User story:** *As an assistant professor at a state university with a DST grant and no research office, I enter my grant once in 3 minutes. FundSphere puts every UC, report and extension deadline on my phone with a link to the right portal, drafts my annual progress report from my ORCID papers, and warns me in January about heads I'm spending too slowly.*

### Where it fits next to existing tools

| Job | What researchers use today | What Obj 4 does |
|---|---|---|
| Submit UCs, SEs and reports | One portal per agency: ANRF online, DBT eProMIS, ICMR ePMS. The UC itself (form GFR-19) is entered in PFMS. | Doesn't replace them. Every event links to the grant's portal. |
| Keep project accounts and prepare the UC | The institute's accounts or research office: Samarth eGov's research-project module in many universities, IRIS at IIT Delhi, balance sheets shared by IIT Hyderabad's office | Doesn't replace them. In 4.3 the PI copies head totals from the institute's statement. |
| Know what's due across all grants | No dedicated tool found: memory, Excel and phone reminders (to confirm in the interviews) | **4.2 Compliance calendar** |
| Write the annual progress report | Word, from scratch every year | **4.4 AI progress report draft** |

**Who gains most:** PIs at state universities and private or autonomous colleges with no research office, and PIs with grants from more than one agency. PIs at IITs and IISc, whose offices already handle accounts and UCs, gain mainly from 4.4.

### Must-have

Build in this order: **4.1 → 4.2 → 4.4 → 4.3.** If time runs short, cut from 4.3 (charts first), never from 4.2 or 4.4.

| # | Feature | What it does | Done when |
|---|---|---|---|
| 4.1 | **Add my grant** | Opens from an application marked Awarded (details carry over) or from **Add a grant I already hold**. One short form: agency, scheme, sanction number and date, start and end dates, total amount, and the allocation per head (the standard heads are pre-filled; year-wise split optional). Two more fields come from the sanction order: **where to submit** (pre-filled from the agency: ANRF portal, DBT eProMIS, ICMR ePMS, or any link) and **unspent money at year end**: Carried forward / Lapses / Deducted from next release / Not sure (default: Not sure). | A faculty member can add a real grant in under 3 minutes. |
| 4.2 | **Compliance calendar** | Plain, tested Java rules generate the events from the project dates and the April–March financial year: **UC and SE for each financial year**, an **annual progress report for each project year**, a **no-cost extension request window** (default: 3 months before the end date, as ANRF requires), and at closure the **final technical report, final UC/SE, equipment list and refund of the unspent balance**. Default offsets are editable and confirmed with the interviewed faculty. Green: more than 30 days away. Amber: 30 days or less. Red: 7 days or less, or overdue. A **"Due this month"** card goes on the dashboard, with **Subscribe in Google Calendar** and **Mark submitted** (with a date). Every event links to the grant's portal, and each UC event notes that the next instalment usually waits on it. **Agencies differ, so each grant has a reporting profile** (see the implementation notes). **Built (11 Oct 2026).** Part 1: profiles, the deadlines on each grant page, Mark submitted, moving dates, Not applicable, the PI's own deadlines, and the next deadline on each card. Part 2: a "Due in the next 30 days" card on My grants (the app has no dashboard), a red nav badge for deadlines overdue or due within 7 days, and one calendar (download, or a subscription link). **Still open:** subscribing in Google Calendar needs the backend at a public address (F3); downloading works now. | JUnit tests pass for financial-year boundaries, leap years, the extension window and overdue changes, and the calendar feed subscribes in Google Calendar. |
| 4.3 | **Spend check with year-end warning** | A light check, not accounting. When they want, the PI copies the amount spent per head from the institute's statement (Samarth, an institute portal or the accounts office's sheet), as totals only, and FundSphere shows the date of the last update. Each head shows **% used vs % of the financial year gone**. **From January to March** it warns about slow heads, worded from the grant's year-end setting. Lapses: *"Consumables: 42% used, 2 months left in FY 2026-27. Unspent money lapses on 31 March."* Deducted from next release: *"... may be deducted from your next release."* Not sure: *"... check your sanction order for what happens to unspent money."* Carried forward: no year-end warning. **The Equipment warning starts early** (default: under 25% used by October, editable), because most research equipment costs more than ₹2 lakh, the limit for buying without quotations, so it still goes through quotations, a purchase committee or a tender. It also flags overspent heads. All amounts use lakh/crore. **Built (12 Oct 2026)** as the **Budget and spending** card on each grant page, with an "Update spending" form and a warning chip on My grants. See the implementation notes for what the plan left open. | The warnings fire correctly in tests across the financial-year boundary, for each year-end setting. |
| 4.4 | **AI progress report draft** ★ | **Papers are imported from ORCID**: publications dated within the project period are listed, and the PI ticks the ones from this grant. Students trained, equipment bought, patents and milestones go in through a quick-add form. The AI writes a draft under the agency's usual headings (objectives, work done, deviations, outputs, utilization summary). **Every factual line links to a recorded entry.** An automatic check flags anything unsupported. The draft exports to DOCX, marked "Draft". **Built (12 Oct 2026)** in three parts. (1) Project objectives and outputs on each grant page: ORCID import, plus a quick-add form. (2) Drafts from a report deadline or a chosen period. Code writes the project details, objectives, output lists and budget; the AI writes the summary, the work done against each objective, and deviations (from the PI's note only). The PI can edit or delete any sentence, or keep a flagged one. (3) Word export and the evaluation. See the implementation notes. | The check finds zero unsupported statements on the test set, and the DOCX export works. |

### Should-have (only after all Musts pass)

| # | Feature | What it does |
|---|---|---|
| 4.5 | AI sanction-order parser | Reads the sanction order PDF and **fills in the 4.1 form**. The PI checks each value against its source sentence before saving. Should-have because its evaluation needs real sanction orders from faculty. **Built (11 Oct 2026), ahead of 4.2, at the team's request** as "Fill from PDF" in the Add my grant form; typing by hand stays. A value is filled only when code finds it in the PDF (see the implementation notes). Scanned orders are sent back to the manual form. |
| 4.6 | Re-appropriation and extension letters | Drafts a request to move money between heads or to extend the project, from the PI's reason and the current spend figures (P12). The extension letter is offered when the 4.2 extension window opens. |
| 4.7 | Email reminders | 30, 7 and 1 day before each compliance event, for PIs who prefer email to the calendar. |
| 4.8 | Instalment tracker | Expected vs received instalments, flagging when the next one is waiting on a UC, and recording how long each release took after the documents were submitted (useful when following up with the agency). |

### Could-have

- UC and SE drafts in GFR format. Build these only if interviews show that PIs, not the accounts office, prepare them. PFMS doesn't fill in the UC (the GFR-19 is entered by hand), but research offices and Samarth's module already prepare UCs in many institutions.
- A manpower tracker: JRF tenure end and JRF → SRF upgradation reminders, with stipend values in a central config.
- An equipment register.

### Evaluation

| What | Method | Target |
|---|---|---|
| Calendar and warnings | JUnit | 100% pass, including financial-year boundaries, leap years, the extension window and each year-end setting. Spend check: `SpendCheckTest` (21 tests) and `SpendServiceTest` (9) pass, 12 Oct 2026 |
| Report drafts | Faculty rubric (completeness, accuracy, format) plus an LLM judge, and the automatic unsupported-claim check. `python -m award.evaluate_reports --judge` on 8 test cases in `test-samples/objective4/reports/`, which also plants invented facts to test the check | Mean ≥ 7/10; zero invented outputs. Test cases, final run on 12 Oct 2026: 0 unsupported sentences, 147/147 planted facts caught, LLM judge 9.7. Faculty rubric, the human read and real records still to do |
| Time saved | Write a progress report manually vs with FundSphere | At least 50% faster |
| Setup effort | Time faculty adding a real grant | Under 3 minutes |
| Sanction-order reader (4.5) | `python -m award.evaluate` on the 5 sample orders in `test-samples/objective4/`, then on redacted real orders from the interviews. Every form field is scored as correct, missed (left empty), wrong but flagged, or wrong and silent | **Zero wrong-and-silent values**; report field accuracy. Sample orders: 85/85 in two runs on 11 Oct 2026; real orders still to test |
| Who it helps | Run the user study with faculty from an institute with a research office and from a college without one | Results reported separately for each group |

### Implementation notes

- **Dates are computed by code, never by the LLM.** The LLM only writes report text (and, in 4.5, extracts values for the PI to confirm).
- **Reporting profiles (4.2, as built).** Agencies don't share one set of rules, so each grant follows a profile, pre-selected from the agency name (`ComplianceRules.java`):

  | Profile | Progress reports | UC and SE | Closing documents | Source |
  |---|---|---|---|---|
  | ANRF | each project year, +1 month | each financial year, by 30 April | +3 months (**default**: no ANRF rule found) | ANRF FAQ; extension request 3 months before the end |
  | DST | **every six months**, the first period ending on the last day of the sixth month | each financial year, by 30 April | **within 1 year** | DST "Conditions attached to the Grant" |
  | ICMR | each project year, +1 month | each financial year, by 30 April | **within 1 month** | ICMR ad-hoc project form; Emeritus Scientist guidance |
  | OTHER | each project year, +1 month | each financial year, by 30 April | +3 months | FundSphere defaults |

  Each deadline shows its basis ("Why this date?"). The PI can move any date, mark it not applicable, or add their own, such as a mid-term review or a BIRAC milestone report. When the grant's dates or profile change, deadlines are worked out again, but submitted ones and dates the PI moved are kept (`ComplianceSchedule.java`). DBT and BIRAC profiles wait until the interviews show faculty hold those grants.
- **ORCID:** `OrcidEnrichmentService` already reads public records from `pub.orcid.org`, but it returns only a name, a summary and keywords (paper titles are merged into one sentence). Add a method that returns each work's title, publication year, DOI and ORCID put-code (stored as `external_id`, so a second import doesn't add duplicates). Some faculty keep their publications in IRINS or Vidwan rather than ORCID (interview question 11), so the manual quick-add stays as the fallback.
- **Route:** `POST /award/generate-draft` in the AI service, which stays stateless. Spring Boot owns all grant data.
- **Sanction-order reader (4.5), as built:** `POST /award/read-sanction-order` in the AI service (`ai-service/award/sanction_reader.py`), reached through `POST /api/awards/read-sanction-order`. Nothing is stored. The LLM only **copies** values as printed, such as "12.00" in a "Rs. in lakh" table or "15 August 2026". **Code** then does the rest:
  - converts lakh and crore to rupees, reads the dates, and adds up year-wise tables;
  - fills a value only when its quote is found in the PDF text and the value appears in that quote; otherwise it leaves the field empty with a note;
  - skips sub-totals, merges items into the standard heads, and warns when the heads don't add up to the total.

  In the form, every filled field shows the sentence it came from, and each budget head names the items as printed, so the PI can check which head each one belongs to.
- **Unsupported-claim check (how 4.4 is verified):**
  1. Spring Boot sends the AI service the recorded entries for the period (`award_outputs`, budget figures and the award's details), each with an ID.
  2. The LLM returns the draft as a list of sentences under each heading, and each sentence lists the IDs it relies on (`{"text": ..., "sources": ["out_12", "budget_fy26"]}`). Linking sentences such as headings and transitions may have no sources if they state no facts.
  3. Code then checks every sentence:
     - every cited ID exists in the input;
     - every number, date, amount and quoted title in the sentence appears in at least one cited entry (after normalising lakh/crore and date formats);
     - a sentence with no sources contains no numbers, dates, names or titles.
  4. Any sentence that fails is highlighted as **Unsupported** in the editor, and the DOCX export lists the count at the top. The PI fixes or deletes it before export.
  5. For the evaluation, a human also reads each test draft. The "zero invented outputs" target counts invented facts that the check missed as well as ones it caught.

  **As built (12 Oct 2026):** `POST /award/generate-draft` and `POST /award/check-draft` in `ai-service/award/` (`report_entries.py`, `claim_check.py`, `report_writer.py`), and `ProgressReportService` with `/api/awards/{id}/reports` in Spring Boot. Changes from the steps above:
  - **Code writes the parts that only restate records:** project details, objectives, the output lists and budget allocations. The LLM writes only the summary, the work done against each objective, and deviations. Deviations come only from a note the PI writes when starting the draft, so the LLM has nothing to invent them from. Where nothing recorded can fill a part, the draft holds an instruction in [brackets] for the PI. The spending figures are always one of these until 4.3 exists.
  - **The check also covers names** (capitalised words that must appear in a cited entry, apart from generic report words such as JRF or Principal Investigator). A count such as "2 papers" may equal the number of cited entries, or of cited entries of one kind. A date can't be more precise than its entry.
  - **Edits are checked again** against the grant's current records, so deleting an output turns the sentences citing it red. The PI can also keep a flagged sentence as written; those are counted separately.
  - **The DOCX** is written with the JDK alone (`DocxReportWriter`). It has "DRAFT" in every page header and the counts at the top; unsupported sentences are red with a wavy underline, and places to fill in are highlighted yellow.
  - **Known blind spots:** claims with no number, date, name or title ("the sensor worked well"), and a one-word name opening a sentence. The human read covers these.
- **Spend check (4.3), as built:** `SpendCheck` (plain rules, like `ComplianceRules`), `SpendService`, and `GET/PUT /api/awards/{id}/spending[/{fy}]`. What the plan left open:
  - **Per year, not per grant.** "% used vs % of the financial year gone" needs each head's budget *for the year*, but grants store whole-project allocations. So the PI's figures go in a new `spend_records` table (grant, financial year, head, budget, spent, statement date), not in `spent` and `spent_as_of` columns on `budget_lines` as §8 planned. When no budget for the year is entered, it's estimated: Equipment, whatever of its allocation is still unspent; every other head, its share of the allocation by the project's days in that year, rounded to ₹1,000. The card and form say which figures are estimates.
  - **Slow** means a head's % used trails the % of the year gone (on the statement date) by 15 points or more. The plan's example (42% used with 2 months left) is 41 points behind.
  - **The year-end window** is the year's last 3 months: January to March for a full year. In a project that ends before 31 March, it's the 3 months before the end date, and the warning says unspent money is refunded at the end, whatever the year-end setting.
  - **The Equipment warning** (default: under 25% used by October; both editable per grant) waits until 3 months after the start in a year the project joins midway. Otherwise a project starting in August would get its first warning only in year 2.
  - **Notices** ask for data rather than warn about money: nothing recorded yet, figures older than 60 days, budgets that are estimates. They stay off the My grants card.
  - **Next:** the progress report's "Utilization of funds" can use these figures instead of a placeholder.
- **Calendar feed:** one `.ics` feed per user covering both application due dates (3.4) and compliance events (4.2). Today's `GET /api/applications/{id}/calendar.ics` is a one-off download behind login. Google Calendar's "subscribe by URL" can't send a login token and needs a public HTTPS address, so the feed lives at a secret link (for example `/api/calendar/feed/{token}.ics`, with the token stored hashed on the user and regenerable) and needs the backend deployed publicly, which is the same decision as F3. Generalise `IcsCalendarWriter` to take a list of events instead of one application and its checklist. Subscribed calendars can take hours to refresh, so the dashboard card is the up-to-date view.

  **As built (11 Oct 2026):** `CalendarService` and `CalendarController`.
  - `GET /api/calendar/download` (login) returns the file.
  - `POST /api/calendar/subscription` makes a link from a 256-bit random token; only its SHA-256 is stored, in `app_users.calendar_token_hash`.
  - `GET /api/calendar/feed/{token}.ics` is the only public route.
  - A new link replaces the old one, and the PI can turn it off.
  - The calendar holds pending grant deadlines (reminder 7 days before) plus Preparing applications' deadlines and open checklist items (reminder 1 day before).
  - Set `app.public-base-url` once deployed, so links carry the public address.
  - The file was checked with the `icalendar` parser.

**Sources checked (11 October 2026):**
- [ANRF FAQ](https://anrf.gov.in/page/english/faq): financial documents due right after each financial year, progress reports counted from the project start date, no-cost extension requested 3 months before the end
- [ANRF PM Early Career Research Grant](https://anrfonline.in/ANRF/ecrg_anrf?HomePage=New): next instalment only after the year-wise UC, SE and annual progress report
- [DST UC manual for agencies (PFMS)](http://dst.gov.in/sites/default/files/UC%20Manual%20for%20Agencies%20-%20Utilisation%20Certificate%20Module.pdf): the GFR-19 UC is entered and uploaded by hand
- [ICMR ePMS UC and report upload guide](https://epms.icmr.org.in/extramuralstaticweb/pdf/Adhoc/UC%20and%20Reports_Publication_Patents_upload_ePMS.pdf) and [ICMR ad-hoc project requirements](https://ggu.ac.in/Admin/Files/DepartmentDocument/03202023084113_ICMR%20Ad%20hoc%20Project%20RSP.pdf): certificate that no UC or final report is pending
- [DBT eProMIS](https://services.india.gov.in/service/detail/epromis-department-of-bio-technology)
- [CGA TSA manual](https://cga.nic.in/writereaddata/file/TSABookletOM244Dt17062020.pdf) (unused balances lapse on 31 March), [DBT JRF guidelines](https://www.biotech.co.in/uploads/DBTJRFGENERALGUIDELINES.pdf) (unspent amounts adjusted from the next release) and an [IRG UC format](https://iipe.ac.in/user_assets/frontend/assets/images/IRG/Form%20IRG-08%20-%20FORMAT%20FOR%20UTILIZATION%20CERTIFICATE.pdf) (amount carried forward): why year-end handling is a per-grant setting
- [Business Standard on the 5 June 2025 procurement relaxation](https://www.business-standard.com/industry/news/govt-raises-financial-limits-to-ease-procurement-for-scientific-research-125060700289_1.html)
- [Samarth Research Project & Grant Management](https://docs.samarth.ac.in/docs/accounts-and-finance/research-project-management-system/), [IIT Delhi IRD manual](https://beb.iitd.ac.in/New-Faculty-IRD-Manual.pdf) and [IIT Hyderabad SRC FAQs](https://www.iith.ac.in/assets/files/pdf/rti/FAQs-on-SRC-Office-Operations.pdf): institute systems that already keep project accounts and prepare UCs

---

## 7. How the two objectives connect

```
Saved grant ──▶ Application (Obj 3) ──── Awarded ────▶ My grant (Obj 4)
                checklist · readiness ·              calendar · progress report draft ·
                WhatsApp · calendar                  spend check
                     └──── one Google Calendar feed, one dashboard "Due this month" card ────┘
```

- Marking an application **Awarded** opens the 4.1 form with the agency, scheme and amount already filled in.
- A single calendar feed and the dashboard card cover both pre-award and post-award deadlines.
- **Pending-UC check:** starting a new application checks the PI's active grants. If a UC, SE or final report is overdue, it warns before they apply, because some agencies (ICMR, for example) ask applicants to certify that nothing is pending. **Built (26 Oct 2026):** a warning in "Add a call not in FundSphere" and at the top of every application still in preparation, listing each overdue UC/SE, final UC/SE or final report with a link to its grant (`useOverdueReports.ts`, `OverdueReportsWarning.tsx`).

---

## 8. Data model (new tables)

```
-- Objective 3
applications        id, owner_id, grant_id NULL, title, agency, call_url, deadline,
                    status (PREPARING|SUBMITTED|AWARDED|NOT_FUNDED),
                    status_changed_at, notes, guidelines_source, checklist_warnings,
                    checklist_generated_at, created_at, updated_at
checklist_items     id, application_id, category, text, mandatory, sign_off, source_quote,
                    source_page, source_verified, owner_name, due_date, due_offset_days NULL,
                    status (TODO|DONE|NA), origin (AI|MANUAL), position
application_status_changes  id, application_id, from_status NULL, to_status, changed_at

-- Objective 4
awards              id, owner_id, application_id NULL, project_title, agency, scheme, sanction_no,
                    sanction_date, start_date, end_date, total_sanctioned,
                    submission_portal, portal_url NULL,
                    unspent_policy (CARRY_FORWARD|LAPSES|DEDUCTED_NEXT_RELEASE|UNKNOWN),
                    reporting_profile (ANRF|DST|ICMR|OTHER), status (ACTIVE|CLOSED)
budget_lines        id, award_id, fy NULL, head, allocated, spent, spent_as_of, updated_at
compliance_events   id, award_id, type (UC_SE|PROGRESS_REPORT|EXTENSION_REQUEST|FINAL_REPORT|
                    FINAL_UC_SE|EQUIPMENT_LIST|REFUND_UNSPENT|CUSTOM), rule_key NULL, title,
                    period_start NULL, period_end NULL, due_date, due_date_edited,
                    status (PENDING|SUBMITTED|NOT_APPLICABLE), submitted_on NULL,
                    origin (RULE|MANUAL), basis
award_outputs       id, award_id, type (PAPER|STUDENT|EQUIPMENT|PATENT|MILESTONE|OTHER),
                    title, details, date, source (ORCID|MANUAL), external_id NULL
generated_drafts    id, award_id, kind, period, content, model, created_at

-- Only if the Should-haves are built
proposal_reviews    id, application_id NULL, user_id, version_no, overall_score, analysis_json, created_at
application_members id, application_id, user_id, role (OWNER|MEMBER), invite_token_hash, joined_at
```

That's 8 tables for the Musts, compared with 15 in v1. (`application_status_changes` keeps the status history that 3.1's "Done when" asks for.) `grant_id` and `application_id` can be empty, so outside calls and grants a PI already holds both work. v3 adds no tables: three columns on `awards`, `spent_as_of` on `budget_lines`, and a `calendar_token_hash` on the existing `users` table for the calendar feed.

---

## 9. Timeline (12 weeks) and work split

| Weeks | Objective 3 (M1, M2) | Objective 4 (M3, M4) | Everyone |
|---|---|---|---|
| 1–2 | Foundation (§4) | Foundation (§4) | Faculty interviews; label the guideline PDFs |
| 3–6 | 3.1 → 3.2 → 3.3 → 3.4 | 4.1 → 4.2 → 4.4 → 4.3 | Weekly demo to the guide |
| 7–8 | Should-haves | Should-haves | Connect the two: Awarded → My grant; single calendar feed |
| 9–10 | Evaluation | Evaluation | User study with 3–4 faculty |
| 11–12 | Polish | Polish | Docker Compose deployment, docs, paper, final demo |

**Gate:** an objective's Should-haves start only when all four of its Musts pass their "Done when" checks. Weeks 11–12 are buffer if anything slips.

| Member | Objective work | Foundation work |
|---|---|---|
| M1 | Obj 3 backend: applications, checklist items, readiness, calendar feed | F1 security fixes, F2 status migration |
| M2 | Obj 3 AI and frontend: checklist extractor and its evaluation, application pages, WhatsApp share | F5 browse fixes |
| M3 | Obj 4 backend: awards, compliance rules engine with JUnit, spend check and warnings | F3 scraper pipeline |
| M4 | Obj 4 AI and frontend: dashboard card, calendar view, spend charts, ORCID import, report drafts and their evaluation | F4 agency seeds |

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Grant data stays thin | Fix the pipeline in week 1. Applications also accept outside calls, and Obj 4 works for grants a PI already holds, whatever the state of discovery data. |
| Compliance rules differ by agency | Rules use editable defaults, and each event can be edited. Start with the 2–3 agencies the interviewed faculty hold grants from. |
| Overlap with institute systems (Samarth, IRIS) and agency portals | Stay PI-facing: no accounting, no official UCs and no submission. 4.3 asks only for head totals copied from the institute's statement, and every event links to the agency's own portal. |
| The LLM invents facts in a report | Draft only from recorded entries, run the unsupported-claim check, mark every draft "Draft", and let the PI edit before export. |
| Few faculty with active grants for the user study | Recruit during the week-1 interviews. Obj 3's evaluation uses public PDFs, so it isn't affected. |
| Sensitive data (finances, unpublished work) | No documents are stored in the Musts. Don't log guideline or report text, use LLM API terms that exclude training on inputs, and publish a privacy note. |
| Scope creep | Four Musts per objective, the gate in §9, and a weekly demo. |

---

## 11. Faculty interview questions (weeks 1–2)

1. Which agencies have you applied to in the last 3 years, and which grants do you hold now?
2. Has a proposal ever been returned or rejected for a missing document, format or budget issue? What was missing?
3. Who collects the endorsement letters, CVs and undertakings before submission, and how long does the Head of Institution's sign-off take?
4. How do you coordinate with Co-PIs and students during preparation?
5. How do you keep track of UC, SE and progress-report deadlines today? Have you ever been late?
6. **Who prepares the UC and SE: you or the accounts office? Where do you see your project balance today (Samarth, an institute portal, a sheet from accounts)?**
7. **What happens to money unspent on 31 March on your grant: carried forward, lapses, or deducted from the next release?**
8. **How long does buying equipment take, from quotation to delivery?**
9. **Have you ever needed re-appropriation between heads or a project extension? How did you write the request?**
10. Which part of the progress report takes you the longest, and how many hours does the whole report take?
11. Do you keep your publications updated on ORCID, or in IRINS or Vidwan?
12. Could you share a redacted sanction order and your last progress report? (This is evaluation data.)

Answers to 6–9 decide the 4.3 design and the Should- and Could-haves for Obj 4. If most faculty say the accounts office handles UCs and they never miss deadlines, the calendar matters less and 4.4 carries the objective.

---

## 12. Not building this phase

- Document storage, real-time co-editing, or a generic task or project-management tool
- Per-bill expense entry (head totals only)
- Project accounting, official UCs or submission to agency portals (institute systems such as Samarth, and the portals themselves, already do these)
- Anything that presents an AI-generated UC or report as final or official
- More than 2–3 agency templates up front
- Co-PI matching, a Hindi interface, institution dashboards, or more user types (startups, NGOs)

---

## 13. Demo story for the next review

1. A PI saves an ANRF call in Discovery and clicks **Start application**.
2. They upload the guidelines. In under a minute, the checklist appears, and each item links to its line in the PDF.
3. They assign items to "Dr. Meena (Co-PI)" and "Ravi (JRF)" and tap **Send to WhatsApp**. The lab group gets a neat list with due dates.
4. **Add to Google Calendar** puts the deadline and HoI sign-off date on their phone.
5. Readiness reaches 100%. The application is marked Submitted, and later **Awarded**.
6. **My grant** opens with the details already filled in. The PI enters the head allocations in 2 minutes, and the UC, SE, report and extension dates appear on their phone calendar, each with a link to the ANRF portal.
7. It's January. The dashboard warns: *"Consumables: 42% used, 2 months left in FY 2026-27. Check your sanction order for what happens to unspent money."*
8. The PI ticks 3 ORCID papers and adds 2 trained students, and gets an annual progress report draft in which every line traces back to an entry.

**One-line pitch:**
> FundSphere helps Indian researchers submit complete applications and keep their grants on track: an AI checklist that catches every annexure before you submit, and a compliance desk that puts every UC, report and extension deadline on your phone and drafts the annual progress report from your real outputs.
