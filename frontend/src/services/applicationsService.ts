/**
 * Frontend client for the Application Readiness Workspace (Objective 3)
 * on Spring Boot: applications, their AI requirements checklist and the
 * readiness tracker.
 *
 * Every mutation returns the full application (items + readiness), so the
 * page can replace its state with the server's answer.
 */
import { apiFetch } from './apiClient';

export type ApplicationStatus = 'PREPARING' | 'SUBMITTED' | 'AWARDED' | 'NOT_FUNDED';
export type ChecklistCategory = 'DOCUMENTS' | 'FORMAT' | 'ELIGIBILITY' | 'BUDGET' | 'SUBMISSION' | 'KEY_DATES';
export type ChecklistItemStatus = 'TODO' | 'DONE' | 'NA';

export interface Readiness {
  mandatoryTotal: number;
  mandatoryDone: number;
  /** null when there are no mandatory items yet. */
  percent: number | null;
  overdue: number;
}

export interface ChecklistItem {
  id: number;
  category: ChecklistCategory;
  text: string;
  mandatory: boolean;
  signOff: boolean;
  sourceQuote: string | null;
  sourcePage: number | null;
  /** true/false for AI items; null for items added by hand. */
  sourceVerified: boolean | null;
  ownerName: string | null;
  /** YYYY-MM-DD */
  dueDate: string | null;
  /** Days before the deadline; null when the due date is fixed. */
  dueOffsetDays: number | null;
  status: ChecklistItemStatus;
  origin: 'AI' | 'MANUAL';
}

export interface StatusChange {
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  changedAt: string;
}

export interface Application {
  id: number;
  grantId: number | null;
  title: string;
  agency: string | null;
  callUrl: string | null;
  /** YYYY-MM-DD */
  deadline: string | null;
  status: ApplicationStatus;
  statusChangedAt: string;
  notes: string | null;
  guidelinesSource: string | null;
  checklistWarnings: string[];
  checklistGeneratedAt: string | null;
  /** Set once the guidelines have been read; the Proposal tab checks drafts against them. */
  guidelineExtractionId: number | null;
  readiness: Readiness;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  /** Only on the detail endpoints. */
  items?: ChecklistItem[];
  statusHistory?: StatusChange[];
}

export interface NewApplication {
  grantId?: number;
  title?: string;
  agency?: string;
  callUrl?: string;
  deadline?: string;
  notes?: string;
}

/** null = unchanged; '' clears a text field; clearDeadline removes the deadline. */
export interface ApplicationChanges {
  title?: string;
  agency?: string;
  callUrl?: string;
  deadline?: string;
  clearDeadline?: boolean;
  notes?: string;
  status?: ApplicationStatus;
}

export interface ChecklistItemChanges {
  category?: ChecklistCategory;
  text?: string;
  mandatory?: boolean;
  signOff?: boolean;
  /** '' clears the owner. */
  ownerName?: string;
  dueDate?: string;
  clearDueDate?: boolean;
  status?: ChecklistItemStatus;
}

export async function fetchApplications(): Promise<Application[]> {
  const response = await apiFetch('/api/applications');
  await ensureOk(response, 'Could not load your applications');
  return (await response.json()) as Application[];
}

export async function fetchApplication(id: number): Promise<Application> {
  const response = await apiFetch(`/api/applications/${id}`);
  await ensureOk(response, 'Could not load this application');
  return (await response.json()) as Application;
}

/**
 * Starts an application. For a grant that already has one, the server
 * returns the existing application and `created` is false.
 */
export async function createApplication(body: NewApplication): Promise<{ application: Application; created: boolean }> {
  const response = await apiFetch('/api/applications', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  await ensureOk(response, 'Could not start the application');
  return { application: (await response.json()) as Application, created: response.status === 201 };
}

export async function updateApplication(id: number, changes: ApplicationChanges): Promise<Application> {
  const response = await apiFetch(`/api/applications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
  await ensureOk(response, 'Could not save the application');
  return (await response.json()) as Application;
}

export async function deleteApplication(id: number): Promise<void> {
  const response = await apiFetch(`/api/applications/${id}`, { method: 'DELETE' });
  await ensureOk(response, 'Could not delete the application');
}

/** Runs the AI checklist extraction on a guidelines PDF or a link (one of the two). */
export async function extractChecklist(
  id: number,
  source: { file: File } | { url: string },
): Promise<Application> {
  const form = new FormData();
  if ('file' in source) {
    form.append('guidelinesPdf', source.file);
  } else {
    form.append('url', source.url);
  }
  const response = await apiFetch(`/api/applications/${id}/checklist/extract`, {
    method: 'POST',
    body: form,
  });
  await ensureOk(response, 'Could not read the guidelines');
  return (await response.json()) as Application;
}

export async function addChecklistItem(id: number, item: ChecklistItemChanges & { text: string }): Promise<Application> {
  const response = await apiFetch(`/api/applications/${id}/checklist/items`, {
    method: 'POST',
    body: JSON.stringify(item),
  });
  await ensureOk(response, 'Could not add the item');
  return (await response.json()) as Application;
}

export async function updateChecklistItem(id: number, itemId: number, changes: ChecklistItemChanges): Promise<Application> {
  const response = await apiFetch(`/api/applications/${id}/checklist/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
  await ensureOk(response, 'Could not save the item');
  return (await response.json()) as Application;
}

export async function deleteChecklistItem(id: number, itemId: number): Promise<Application> {
  const response = await apiFetch(`/api/applications/${id}/checklist/items/${itemId}`, { method: 'DELETE' });
  await ensureOk(response, 'Could not delete the item');
  return (await response.json()) as Application;
}

/** Downloads the deadline and every open due date as an .ics file. */
export async function downloadCalendarFile(id: number): Promise<void> {
  const response = await apiFetch(`/api/applications/${id}/calendar.ics`);
  await ensureOk(response, 'Could not create the calendar file');
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? 'application.ics';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Same formula as the backend: mandatory done ÷ mandatory, N/A excluded, rounded down. */
export function computeReadiness(items: ChecklistItem[], today: string): Readiness {
  let total = 0;
  let done = 0;
  let overdue = 0;
  for (const item of items) {
    if (item.status === 'NA') continue;
    if (item.mandatory) {
      total += 1;
      if (item.status === 'DONE') done += 1;
    }
    if (item.status === 'TODO' && item.dueDate && item.dueDate < today) overdue += 1;
  }
  return {
    mandatoryTotal: total,
    mandatoryDone: done,
    percent: total === 0 ? null : Math.floor((done * 100) / total),
    overdue,
  };
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
