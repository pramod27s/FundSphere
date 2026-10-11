/**
 * Frontend client for My grants (Objective 4, Grant Compliance Desk) on
 * Spring Boot: the grants a user holds, with their dates, portal and
 * budget heads. Amounts are whole rupees.
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
  /** In the standard head order; heads with nothing allocated are left out. */
  budgetLines: BudgetLine[];
  /** Reporting deadlines in date order. */
  events: ComplianceEvent[];
  /** The earliest pending deadline, overdue ones included. */
  nextEvent: ComplianceEvent | null;
  overdueCount: number;
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
