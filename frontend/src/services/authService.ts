export interface AuthUser {
  id: number;
  fullName: string;
  email: string;
  role: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: AuthUser;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload extends AuthCredentials {
  fullName: string;
}

const API_BASE_URL = 'http://localhost:8080/api/auth';
const STORAGE_KEY = 'fundsphere.auth.session';

export function loadSession(): AuthSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveSession(session: AuthSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

/**
 * Clear the persisted session. Pure local-state cleanup — does NOT
 * dispatch `auth:unauthorized`. Use this for explicit user-initiated
 * logout. The unauthorized event is reserved for genuine server-side
 * 401/403 responses (see apiClient.refreshSession).
 */
export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function register(payload: RegisterPayload): Promise<AuthSession> {
  return post<AuthSession>('/register', payload);
}

export async function login(payload: AuthCredentials): Promise<AuthSession> {
  return post<AuthSession>('/login', payload);
}

export async function refreshToken(refreshTokenValue: string): Promise<AuthSession> {
  return post<AuthSession>('/refresh', { refreshToken: refreshTokenValue });
}

export async function logout(refreshTokenValue?: string): Promise<void> {
  await fetch(`${API_BASE_URL}/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken: refreshTokenValue ?? '' }),
  });
}

/**
 * Translate the raw server / network error from login/register into a
 * user-friendly message. Hides backend exception class names (e.g.
 * "BadCredentialsException") and follows the standard of not revealing
 * whether an account exists on a failed login (returns the same message
 * for "wrong password" and "no such email").
 */
export function friendlyAuthError(err: unknown, mode: 'login' | 'register'): string {
  if (!(err instanceof Error)) return 'Authentication failed. Please try again.';
  const raw = err.message ?? '';
  const msg = raw.toLowerCase();

  if (msg.includes('failed to fetch') || msg.includes('networkerror')) {
    return 'Unable to reach the server. Check your internet connection and try again.';
  }
  if (
    msg.includes('badcredentials') ||
    msg.includes('bad credentials') ||
    msg.includes('invalid credentials') ||
    msg.includes('401') ||
    msg.includes('unauthorized')
  ) {
    return 'Incorrect email or password.';
  }
  if (msg.includes('409') || msg.includes('already exists') || msg.includes('already registered') || msg.includes('duplicate')) {
    return mode === 'register'
      ? 'An account with this email already exists. Try logging in instead.'
      : 'Account conflict. Please contact support.';
  }
  if (msg.includes('400') || msg.includes('validation')) {
    return 'Please double-check your details and try again.';
  }
  if (msg.includes('500') || msg.includes('503') || msg.includes('service unavailable')) {
    return 'Our servers are having trouble right now. Please try again in a moment.';
  }
  if (msg.includes('429') || msg.includes('too many')) {
    return 'Too many attempts. Please wait a minute before trying again.';
  }
  return mode === 'login'
    ? 'Something went wrong while signing you in. Please try again.'
    : 'Something went wrong while creating your account. Please try again.';
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorText = await response.text();
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.message) {
        errorText = errorJson.message;
      } else if (errorJson.error) {
        errorText = errorJson.error;
      }
    } catch {
      // Ignore if not JSON
    }

    // Throw a cleaner error string so the UI can display it
    throw new Error(errorText || `Authentication failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}
