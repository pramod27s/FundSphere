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

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('auth:unauthorized'));
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
