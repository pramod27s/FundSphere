/**
 * Frontend client for the admin area (2nd.md): who the admins are (Part A)
 * and adding a grant by hand from a call's PDF, link or text (Part B).
 * The server checks every request; nothing here grants access.
 */
import { apiFetch } from './apiClient';
import type { AuthUser } from './authService';
import type { SourcedValue } from './awardsService';

export interface AdminUser {
  id: number;
  fullName: string;
  email: string;
  owner: boolean;
}

export type DeadlineType = 'FIXED' | 'ROLLING' | 'CALL_BASED' | 'UNKNOWN';

/** A call read by the AI service: each value with the sentence it came from. Nothing is stored. */
export interface CallReading {
  title: SourcedValue;
  agency: SourcedValue;
  programme: SourcedValue;
  purpose: SourcedValue;
  /** YYYY-MM-DD */
  deadline: SourcedValue;
  opening_date: SourcedValue;
  open_all_year: SourcedValue<'YES'>;
  /** Whole rupees. */
  amount_min: SourcedValue<number>;
  amount_max: SourcedValue<number>;
  duration: SourcedValue;
  eligibility: SourcedValue;
  themes: SourcedValue;
  application_link: SourcedValue;
  requires_phd: SourcedValue<'YES' | 'NO'>;
  citizenship: SourcedValue;
  grant_type: SourcedValue;
  deadline_type: DeadlineType;
  warnings: string[];
  source_kind: 'pdf' | 'web' | 'text' | '';
  source_name: string;
  /** The link the admin pasted, to fill the grant's link. */
  source_url: string;
  page_count: number;
}

export type CallSource = { kind: 'pdf'; file: File } | { kind: 'url'; url: string } | { kind: 'text'; text: string };

export interface PossibleDuplicate {
  id: number;
  grantTitle: string;
  fundingAgency: string | null;
  grantUrl: string;
  score: number;
  /** The same link: certainly this call. */
  sameUrl: boolean;
}

/** What the admin saves: the backend's grant fields. Amounts are whole rupees, dates ISO date-times. */
export interface ManualGrantInput {
  grantTitle: string;
  grantUrl: string;
  fundingAgency: string | null;
  programName: string | null;
  description: string | null;
  applicationDeadline: string | null;
  deadlineType: DeadlineType;
  openingDate: string | null;
  fundingAmountMin: number | null;
  fundingAmountMax: number | null;
  fundingCurrency: string;
  grantDuration: string | null;
  eligibilityCriteria: string | null;
  researchThemes: string | null;
  applicationLink: string | null;
  requiresPhd: boolean | null;
  citizenshipRequired: string | null;
  eligibleCountries: string | null;
  grantType: string | null;
}

export interface SavedGrant {
  id: number;
  grantTitle: string;
}

/** The signed-in user as the server sees them now (role and owner come from the database). */
export async function fetchMe(): Promise<AuthUser> {
  const response = await apiFetch('/api/auth/me');
  await ensureOk(response, 'Could not check your account');
  return (await response.json()) as AuthUser;
}

export async function listAdmins(): Promise<AdminUser[]> {
  const response = await apiFetch('/api/admin/admins');
  await ensureOk(response, 'Could not load the admins');
  return (await response.json()) as AdminUser[];
}

/** Owner only: makes an existing account an admin. */
export async function addAdmin(email: string): Promise<AdminUser> {
  const response = await apiFetch('/api/admin/admins', { method: 'POST', body: JSON.stringify({ email }) });
  await ensureOk(response, 'Could not add the admin');
  return (await response.json()) as AdminUser;
}

/** Owner only: makes an admin a normal user again. */
export async function removeAdmin(userId: number): Promise<void> {
  const response = await apiFetch(`/api/admin/admins/${userId}`, { method: 'DELETE' });
  await ensureOk(response, 'Could not remove the admin');
}

/** Reads a call so the form can be filled from it. Takes about 15 seconds. */
export async function readCall(source: CallSource): Promise<CallReading> {
  const form = new FormData();
  if (source.kind === 'pdf') form.append('callPdf', source.file);
  if (source.kind === 'url') form.append('url', source.url);
  if (source.kind === 'text') form.append('text', source.text);
  const response = await apiFetch('/api/admin/grants/read', { method: 'POST', body: form });
  await ensureOk(response, 'Could not read the call');
  return (await response.json()) as CallReading;
}

export async function findDuplicates(params: {
  grantUrl?: string;
  grantTitle?: string;
  fundingAgency?: string;
  applicationLink?: string;
}): Promise<PossibleDuplicate[]> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && value.trim()) query.set(key, value.trim());
  }
  const response = await apiFetch(`/api/admin/grants/duplicates?${query.toString()}`);
  await ensureOk(response, 'Could not check for duplicates');
  return (await response.json()) as PossibleDuplicate[];
}

/** Saves a checked grant. It's indexed for AI Match and the scraper never changes it. */
export async function createManualGrant(input: ManualGrantInput): Promise<SavedGrant> {
  const response = await apiFetch('/api/admin/grants', { method: 'POST', body: JSON.stringify(input) });
  await ensureOk(response, 'Could not save the grant');
  return (await response.json()) as SavedGrant;
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
