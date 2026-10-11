/**
 * One calendar of everything the user has on (4.2): applications' deadlines
 * and checklist items, and grants' reporting deadlines. Download it once, or
 * subscribe through a secret link that calendar apps keep fetching.
 */
import { apiFetch } from './apiClient';

/** Downloads the calendar as an .ics file to import. */
export async function downloadDeadlinesCalendar(): Promise<void> {
  const response = await apiFetch('/api/calendar/download');
  await ensureOk(response, 'Could not create the calendar file');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fundsphere-deadlines.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Whether a subscription link is active. The link itself can't be shown again: only its hash is kept. */
export async function fetchSubscriptionStatus(): Promise<boolean> {
  const response = await apiFetch('/api/calendar/subscription');
  await ensureOk(response, 'Could not check your calendar link');
  return ((await response.json()) as { active: boolean }).active;
}

/** Makes a new subscription link; any earlier one stops working. */
export async function createSubscriptionLink(): Promise<string> {
  const response = await apiFetch('/api/calendar/subscription', { method: 'POST' });
  await ensureOk(response, 'Could not create the calendar link');
  return ((await response.json()) as { url: string }).url;
}

export async function turnOffSubscriptionLink(): Promise<void> {
  const response = await apiFetch('/api/calendar/subscription', { method: 'DELETE' });
  await ensureOk(response, 'Could not turn off the calendar link');
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
