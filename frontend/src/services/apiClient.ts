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
    expireSession();
    return null;
  }

  refreshPromise = refreshToken(existing.refreshToken)
    .then((next) => {
      saveSession(next);
      return next;
    })
    .catch(() => {
      expireSession();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

/**
 * Server told us the session is dead and we couldn't recover — drop the
 * cached tokens and notify the app (ResearcherContext bounces to /auth).
 * Distinct from a user-initiated logout, which uses clearSession() alone.
 */
function expireSession(): void {
  clearSession();
  window.dispatchEvent(new Event('auth:unauthorized'));
}
