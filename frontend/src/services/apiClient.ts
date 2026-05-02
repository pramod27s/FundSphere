import { clearSession, loadSession, refreshToken, saveSession, type AuthSession } from './authService';

const API_BASE_URL = 'http://localhost:8080';

let refreshPromise: Promise<AuthSession | null> | null = null;

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const attempt = await doFetch(path, init, false);
  if (attempt.status !== 401 && attempt.status !== 403) {
    return attempt;
  }

  const refreshed = await refreshSession();
  if (!refreshed) {
    return attempt;
  }

  return doFetch(path, init, true);
}

async function doFetch(path: string, init: RequestInit, useLatestToken: boolean): Promise<Response> {
  const session = loadSession();
  const headers = new Headers(init.headers ?? {});

  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (session?.accessToken) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
  }

  if (useLatestToken) {
    const latest = loadSession();
    if (latest?.accessToken) {
      headers.set('Authorization', `Bearer ${latest.accessToken}`);
    }
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
}

async function refreshSession(): Promise<AuthSession | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  const existing = loadSession();
  if (!existing?.refreshToken) {
    clearSession();
    return null;
  }

  refreshPromise = refreshToken(existing.refreshToken)
    .then((next) => {
      saveSession(next);
      return next;
    })
    .catch(() => {
      clearSession();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}
