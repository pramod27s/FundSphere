import { apiFetch } from './apiClient';
import { saveSession, type AuthSession } from './authService';

/**
 * Changes the password. The server signs out the user's other devices and
 * returns new tokens for this one, which are saved so it stays signed in.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const response = await apiFetch('/api/account/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  await ensureOk(response, 'Could not change your password');
  saveSession((await response.json()) as AuthSession);
}

/** Downloads everything FundSphere holds about the user as one JSON file. */
export async function downloadMyData(): Promise<void> {
  const response = await apiFetch('/api/account/export');
  await ensureOk(response, 'Could not prepare your data');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fundsphere-my-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Deletes the account and all of its data. The caller then clears the session. */
export async function deleteAccount(password: string): Promise<void> {
  const response = await apiFetch('/api/account', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
  await ensureOk(response, 'Could not delete your account');
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
