/**
 * Frontend client for My grants (Objective 4, Grant Compliance Desk) on
 * Spring Boot: the grants a user holds, with their dates, portal and
 * budget heads, and what each project produced (4.4). Amounts are whole rupees.
 */
import { apiFetch } from './apiClient';

/**
 * Broadcast after any change to a grant or its deadlines, so independent
 * views (the nav rail's deadline badge) refresh without a shared store.
 */
export const GRANTS_CHANGED_EVENT = 'fundsphere:grants-changed';

function grantsChanged() {
  window.dispatchEvent(new Event(GRANTS_CHANGED_EVENT));
}

export type AwardStatus = 'ACTIVE' | 'CLOSED';
export type BudgetHead = 'EQUIPMENT' | 'MANPOWER' | 'CONSUMABLES' | 'TRAVEL' | 'CONTINGENCY' | 'OVERHEAD' | 'OTHERS';
export type SubmissionPortal = 'ANRF' | 'DBT_EPROMIS' | 'ICMR_EPMS' | 'OTHER';
export type UnspentPolicy = 'CARRY_FORWARD' | 'LAPSES' | 'DEDUCTED_NEXT_RELEASE' | 'UNKNOWN';
/** Whose reporting rules the deadlines follow (4.2). */
export type ReportingProfile = 'ANRF' | 'DST' | 'ICMR' | 'OTHER';
export type ComplianceEventType =
  | 'UC_SE' | 'PROGRESS_REPORT' | 'EXTENSION_REQUEST' | 'FINAL_REPORT' | 'FINAL_UC_SE' | 'EQUIPMENT_LIST'
  | 'REFUND_UNSPENT' | 'CUSTOM';
export type ComplianceEventStatus = 'PENDING' | 'SUBMITTED' | 'NOT_APPLICABLE';

/** One reporting deadline (4.2). RULE ones follow the grant's dates; MANUAL ones the PI added. */
export interface ComplianceEvent {
  id: number;
  type: ComplianceEventType;
  title: string;
  /** YYYY-MM-DD; the period the document covers, if any. */
  periodStart: string | null;
  periodEnd: string | null;
  /** YYYY-MM-DD */
  dueDate: string;
  /** True once the PI moved the date away from the rules' date. */
  dueDateEdited: boolean;
  status: ComplianceEventStatus;
  /** YYYY-MM-DD; null when not submitted, or submitted before the grant was added (date unknown). */
  submittedOn: string | null;
  origin: 'RULE' | 'MANUAL';
  /** Why this date: the agency rule, or that it's a FundSphere default. */
  basis: string | null;
}

/** null = unchanged. resetDueDate puts a moved date back on the rules' date. */
export interface ComplianceEventChanges {
  title?: string;
  dueDate?: string;
  resetDueDate?: boolean;
  status?: ComplianceEventStatus;
  submittedOn?: string;
}

export interface BudgetLine {
  id: number;
  head: BudgetHead;
  allocated: number;
}

export interface Award {
  id: number;
  applicationId: number | null;
  projectTitle: string;
  agency: string | null;
  scheme: string | null;
  sanctionNo: string | null;
  /** YYYY-MM-DD */
  sanctionDate: string | null;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  totalSanctioned: number | null;
  /** Sum of the budget heads; can differ from totalSanctioned. */
  allocatedTotal: number;
  submissionPortal: SubmissionPortal;
  /** The portal's own link, or the pasted one for OTHER. */
  portalUrl: string | null;
  unspentPolicy: UnspentPolicy;
  reportingProfile: ReportingProfile;
  status: AwardStatus;
  /** The project's objectives in order, for progress reports (4.4); empty until added. */
  objectives: string[];
  /** In the standard head order; heads with nothing allocated are left out. */
  budgetLines: BudgetLine[];
  /** Reporting deadlines in date order. */
  events: ComplianceEvent[];
  /** The earliest pending deadline, overdue ones included. */
  nextEvent: ComplianceEvent | null;
  overdueCount: number;
  /** The spend check's warnings for the year today falls in (4.3); empty when none. */
  spendWarnings: string[];
  createdAt: string;
  updatedAt: string;
}

/** The whole "Add my grant" form. On update every field is replaced; applicationId is only read on create. */
export interface AwardInput {
  applicationId?: number;
  projectTitle: string;
  agency: string | null;
  scheme: string | null;
  sanctionNo: string | null;
  sanctionDate: string | null;
  startDate: string;
  endDate: string;
  totalSanctioned: number | null;
  submissionPortal: SubmissionPortal;
  portalUrl: string | null;
  unspentPolicy: UnspentPolicy;
  reportingProfile: ReportingProfile;
  status?: AwardStatus;
  budgetLines: { head: BudgetHead; allocated: number }[];
}

/**
 * One value the AI read from a sanction order (4.5). `value` is set only when
 * code confirmed it in the PDF; otherwise `note` says why it was left empty.
 * Dates are YYYY-MM-DD and amounts whole rupees.
 */
export interface SourcedValue<T = string> {
  value: T | null;
  as_written: string;
  source_quote: string;
  source_page: number | null;
  verified: boolean;
  note: string | null;
}

export interface SanctionOrderReading {
  project_title: SourcedValue;
  agency: SourcedValue;
  scheme: SourcedValue;
  sanction_no: SourcedValue;
  sanction_date: SourcedValue;
  start_date: SourcedValue;
  end_date: SourcedValue;
  total_sanctioned: SourcedValue<number>;
  unspent_policy: SourcedValue<Exclude<UnspentPolicy, 'UNKNOWN'>>;
  portal_url: SourcedValue;
  /** Heads in the standard order; each amount is the sum of its items, added up by code. */
  budget_lines: {
    head: BudgetHead;
    amount: number;
    items: { label: string; amount: number; source_quote: string; source_page: number | null }[];
  }[];
  /** Values left empty, and totals that don't add up. */
  warnings: string[];
  page_count: number;
  source_name: string;
}

/** Reads a sanction order PDF so the form can be filled from it. Nothing is stored. */
export async function readSanctionOrder(file: File): Promise<SanctionOrderReading> {
  const form = new FormData();
  form.append('sanctionOrderPdf', file);
  const response = await apiFetch('/api/awards/read-sanction-order', { method: 'POST', body: form });
  await ensureOk(response, 'Could not read the sanction order');
  return (await response.json()) as SanctionOrderReading;
}

export async function fetchAwards(): Promise<Award[]> {
  const response = await apiFetch('/api/awards');
  await ensureOk(response, 'Could not load your grants');
  return (await response.json()) as Award[];
}

export async function fetchAward(id: number): Promise<Award> {
  const response = await apiFetch(`/api/awards/${id}`);
  await ensureOk(response, 'Could not load this grant');
  return (await response.json()) as Award;
}

/**
 * Adds a grant. From an application that already has one, the server
 * returns the existing grant and `created` is false.
 */
export async function createAward(input: AwardInput): Promise<{ award: Award; created: boolean }> {
  const response = await apiFetch('/api/awards', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  await ensureOk(response, 'Could not add the grant');
  grantsChanged();
  return { award: (await response.json()) as Award, created: response.status === 201 };
}

export async function updateAward(id: number, input: AwardInput): Promise<Award> {
  const response = await apiFetch(`/api/awards/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  await ensureOk(response, 'Could not save the grant');
  grantsChanged();
  return (await response.json()) as Award;
}

export async function deleteAward(id: number): Promise<void> {
  const response = await apiFetch(`/api/awards/${id}`, { method: 'DELETE' });
  await ensureOk(response, 'Could not delete the grant');
  grantsChanged();
}

/** Adds a deadline of the PI's own; returns the whole grant. */
export async function addAwardEvent(awardId: number, event: { title: string; dueDate: string }): Promise<Award> {
  const response = await apiFetch(`/api/awards/${awardId}/events`, { method: 'POST', body: JSON.stringify(event) });
  await ensureOk(response, 'Could not add the deadline');
  grantsChanged();
  return (await response.json()) as Award;
}

/** Marks a deadline submitted / not applicable, or moves its date; returns the whole grant. */
export async function updateAwardEvent(awardId: number, eventId: number, changes: ComplianceEventChanges): Promise<Award> {
  const response = await apiFetch(`/api/awards/${awardId}/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
  await ensureOk(response, 'Could not save the deadline');
  grantsChanged();
  return (await response.json()) as Award;
}

/** Removes a deadline the PI added; returns the whole grant. */
export async function deleteAwardEvent(awardId: number, eventId: number): Promise<Award> {
  const response = await apiFetch(`/api/awards/${awardId}/events/${eventId}`, { method: 'DELETE' });
  await ensureOk(response, 'Could not remove the deadline');
  grantsChanged();
  return (await response.json()) as Award;
}

/** Marks every pending deadline from before the grant was added as submitted (date unknown). */
export async function submitPastAwardEvents(awardId: number): Promise<Award> {
  const response = await apiFetch(`/api/awards/${awardId}/events/submit-past`, { method: 'POST' });
  await ensureOk(response, 'Could not update the earlier deadlines');
  grantsChanged();
  return (await response.json()) as Award;
}

/** Replaces the project's objectives (4.4); returns the whole grant. An empty list clears them. */
export async function updateAwardObjectives(awardId: number, objectives: string[]): Promise<Award> {
  const response = await apiFetch(`/api/awards/${awardId}/objectives`, {
    method: 'PUT',
    body: JSON.stringify({ objectives }),
  });
  await ensureOk(response, 'Could not save the objectives');
  return (await response.json()) as Award;
}

// ---------------------------------------------------------------------------
// Spend check (4.3): totals per head copied from the institute's statement
// ---------------------------------------------------------------------------

export type SpendWarningKind = 'OVERSPENT' | 'YEAR_END' | 'EQUIPMENT' | 'STALE' | 'ESTIMATED' | 'NO_SPENDING';

export interface SpendHead {
  head: BudgetHead;
  /** The head's allocation for the whole project. */
  allocated: number;
  /** Its budget for this year: what the PI entered, or FundSphere's estimate. */
  budget: number;
  estimated: boolean;
  /** Spent this year so far; null when not entered. */
  spent: number | null;
  usedPercent: number | null;
}

export interface SpendCheck {
  fyStartYear: number;
  /** "FY 2026-27" */
  label: string;
  /** YYYY-MM-DD: the year cut to the project's dates. */
  yearStart: string;
  yearEnd: string;
  /** The project ends before 31 March of this year. */
  endsWithProject: boolean;
  /** Today falls in this year. */
  current: boolean;
  yearGonePercent: number;
  /** YYYY-MM-DD: the statement the figures were copied from; null when none. */
  asOf: string | null;
  heads: SpendHead[];
  totalBudget: number;
  totalSpent: number | null;
  /** notice: asks for data (stale, estimated, nothing recorded) rather than warning about money. */
  warnings: { kind: SpendWarningKind; head: BudgetHead | null; message: string; notice: boolean }[];
  years: { fyStartYear: number; label: string }[];
  equipmentAlertPercent: number;
  equipmentAlertMonth: number;
}

/** Replaces a year's figures; budget null = use the estimate. Amounts are whole rupees. */
export interface SpendInput {
  asOf: string | null;
  heads: { head: BudgetHead; budget: number | null; spent: number | null }[];
  equipmentAlertPercent?: number;
  equipmentAlertMonth?: number;
}

/** The given year's spend check, or the year today falls in. */
export async function fetchSpending(awardId: number, fyStartYear?: number): Promise<SpendCheck> {
  const query = fyStartYear === undefined ? '' : `?fy=${fyStartYear}`;
  const response = await apiFetch(`/api/awards/${awardId}/spending${query}`);
  await ensureOk(response, 'Could not load the spending');
  return (await response.json()) as SpendCheck;
}

export async function updateSpending(awardId: number, fyStartYear: number, input: SpendInput): Promise<SpendCheck> {
  const response = await apiFetch(`/api/awards/${awardId}/spending/${fyStartYear}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  await ensureOk(response, 'Could not save the spending');
  grantsChanged();
  return (await response.json()) as SpendCheck;
}

// ---------------------------------------------------------------------------
// Outputs (4.4): what the project produced, the material progress reports are drafted from
// ---------------------------------------------------------------------------

export type AwardOutputType = 'PAPER' | 'STUDENT' | 'EQUIPMENT' | 'PATENT' | 'MILESTONE' | 'OTHER';

export interface AwardOutput {
  id: number;
  type: AwardOutputType;
  /** The paper's title, the student's name, the equipment item, the milestone. */
  title: string;
  details: string | null;
  /** "2027", "2027-03" or "2027-03-14": ORCID often has only the year or month. */
  date: string | null;
  /** Whole rupees, e.g. an equipment item's cost. */
  amount: number | null;
  /** A paper's DOI, a patent's application number. */
  reference: string | null;
  source: 'ORCID' | 'MANUAL';
  /** The ORCID put-code of an imported work. */
  externalId: string | null;
}

/** The quick-add form. On update every field is replaced. */
export interface AwardOutputInput {
  type: AwardOutputType;
  title: string;
  details: string | null;
  date: string | null;
  amount: number | null;
  reference: string | null;
}

export interface OrcidWork {
  putCode: string;
  title: string;
  journal: string | null;
  date: string | null;
  doi: string | null;
  /** ORCID's own type, e.g. "journal-article", "data-set". */
  workType: string | null;
  /** What it becomes when added. */
  outputType: AwardOutputType;
  /** null when ORCID has no date for it. */
  inPeriod: boolean | null;
  alreadyAdded: boolean;
}

export interface OrcidWorks {
  /** null when no iD was given and the profile has none; `message` then says so. */
  orcidId: string | null;
  /** Newest first. */
  works: OrcidWork[];
  message: string | null;
}

/** Outputs come back newest first, undated ones last. */
export async function fetchAwardOutputs(awardId: number): Promise<AwardOutput[]> {
  const response = await apiFetch(`/api/awards/${awardId}/outputs`);
  await ensureOk(response, 'Could not load the outputs');
  return (await response.json()) as AwardOutput[];
}

/** Adds an output; returns the whole list. */
export async function addAwardOutput(awardId: number, input: AwardOutputInput): Promise<AwardOutput[]> {
  const response = await apiFetch(`/api/awards/${awardId}/outputs`, { method: 'POST', body: JSON.stringify(input) });
  await ensureOk(response, 'Could not add the output');
  return (await response.json()) as AwardOutput[];
}

export async function updateAwardOutput(awardId: number, outputId: number, input: AwardOutputInput): Promise<AwardOutput[]> {
  const response = await apiFetch(`/api/awards/${awardId}/outputs/${outputId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  await ensureOk(response, 'Could not save the output');
  return (await response.json()) as AwardOutput[];
}

export async function deleteAwardOutput(awardId: number, outputId: number): Promise<AwardOutput[]> {
  const response = await apiFetch(`/api/awards/${awardId}/outputs/${outputId}`, { method: 'DELETE' });
  await ensureOk(response, 'Could not remove the output');
  return (await response.json()) as AwardOutput[];
}

/** The works on the PI's ORCID record; pass orcidId to use another iD than the profile's. */
export async function fetchOrcidWorks(awardId: number, orcidId?: string): Promise<OrcidWorks> {
  const query = orcidId ? `?orcidId=${encodeURIComponent(orcidId)}` : '';
  const response = await apiFetch(`/api/awards/${awardId}/outputs/orcid${query}`);
  await ensureOk(response, 'Could not load your ORCID works');
  return (await response.json()) as OrcidWorks;
}

/** Adds the ticked works (fetched again from ORCID on the server); returns the whole output list. */
export async function importOrcidWorks(awardId: number, putCodes: string[], orcidId?: string): Promise<AwardOutput[]> {
  const response = await apiFetch(`/api/awards/${awardId}/outputs/orcid`, {
    method: 'POST',
    body: JSON.stringify({ orcidId: orcidId ?? null, putCodes }),
  });
  await ensureOk(response, 'Could not add the works');
  return (await response.json()) as AwardOutput[];
}

// ---------------------------------------------------------------------------
// Progress-report drafts (4.4)
// ---------------------------------------------------------------------------

export type ReportKind = 'PROGRESS_REPORT' | 'FINAL_REPORT';

/**
 * One sentence of a draft. `sources` are entry ids ("out_12", "obj_1",
 * "grant" …); `supported` is the claim check's verdict and `problems` say why
 * not. A placeholder is an instruction in [brackets] for the PI to replace.
 */
export interface DraftSentence {
  id: string;
  text: string;
  sources: string[];
  origin: 'AI' | 'CODE';
  edited: boolean;
  placeholder: boolean;
  supported: boolean;
  problems: string[];
  /** The PI checked an unsupported sentence and kept it. */
  confirmed: boolean;
}

export interface DraftBlock {
  heading: string | null;
  style: 'paragraph' | 'list';
  sentences: DraftSentence[];
}

export interface DraftSection {
  key: string;
  heading: string;
  blocks: DraftBlock[];
}

export interface DraftContent {
  title: string;
  sections: DraftSection[];
  /** What each entry id stands for, e.g. out_12 → 'Paper: Arsenic sensing…'. */
  entries: { id: string; label: string }[];
  warnings: string[];
}

export interface ReportDraft {
  id: number;
  awardId: number;
  kind: ReportKind;
  title: string;
  /** YYYY-MM-DD */
  periodStart: string;
  periodEnd: string;
  /** The deadline it was drafted for, if any. */
  eventId: number | null;
  outputIds: number[];
  notes: string | null;
  /** The model that wrote the narrative; empty when only code wrote the draft. */
  model: string | null;
  unsupportedCount: number;
  placeholderCount: number;
  confirmedCount: number;
  /** Null in lists. */
  content: DraftContent | null;
  createdAt: string;
  updatedAt: string;
}

/** Either a deadline (eventId) or a kind with a period. outputIds omitted: those dated in the period plus undated ones. */
export interface GenerateDraftInput {
  eventId?: number;
  kind?: ReportKind;
  periodStart?: string;
  periodEnd?: string;
  outputIds?: number[];
  notes?: string | null;
}

export async function fetchReportDrafts(awardId: number): Promise<ReportDraft[]> {
  const response = await apiFetch(`/api/awards/${awardId}/reports`);
  await ensureOk(response, 'Could not load the report drafts');
  return (await response.json()) as ReportDraft[];
}

/** Writes a draft; takes up to a minute. */
export async function generateReportDraft(awardId: number, input: GenerateDraftInput): Promise<ReportDraft> {
  const response = await apiFetch(`/api/awards/${awardId}/reports`, { method: 'POST', body: JSON.stringify(input) });
  await ensureOk(response, 'Could not write the draft');
  return (await response.json()) as ReportDraft;
}

export async function fetchReportDraft(awardId: number, draftId: number): Promise<ReportDraft> {
  const response = await apiFetch(`/api/awards/${awardId}/reports/${draftId}`);
  await ensureOk(response, 'Could not load the draft');
  return (await response.json()) as ReportDraft;
}

/** Saves edited sections; every sentence is checked again against the grant's current records. */
export async function updateReportDraft(awardId: number, draftId: number, sections: DraftSection[]): Promise<ReportDraft> {
  const response = await apiFetch(`/api/awards/${awardId}/reports/${draftId}`, {
    method: 'PUT',
    body: JSON.stringify({ sections }),
  });
  await ensureOk(response, 'Could not save the draft');
  return (await response.json()) as ReportDraft;
}

/** Downloads the draft as a Word document, marked "Draft", with the check's counts at the top. */
export async function downloadReportDocx(awardId: number, draftId: number): Promise<void> {
  const response = await apiFetch(`/api/awards/${awardId}/reports/${draftId}/export.docx`);
  await ensureOk(response, 'Could not export the draft');
  const name = /filename="?([^";]+)"?/i.exec(response.headers.get('Content-Disposition') ?? '')?.[1];
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name ?? 'progress-report-DRAFT.docx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function deleteReportDraft(awardId: number, draftId: number): Promise<void> {
  const response = await apiFetch(`/api/awards/${awardId}/reports/${draftId}`, { method: 'DELETE' });
  await ensureOk(response, 'Could not delete the draft');
}

async function ensureOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  let message = `${fallback} (${response.status})`;
  try {
    const payload = (await response.clone().json()) as { message?: string; detail?: string; error?: string };
    const detail = payload.message ?? payload.detail ?? payload.error;
    if (detail) message = detail;
  } catch {
    // not JSON — keep the fallback
  }
  throw new Error(message);
}
