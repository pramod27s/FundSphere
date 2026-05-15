/**
 * Shared researcher-profile state for the routed app.
 *
 * Three logical states for the researcher value:
 *   - `undefined` → not yet fetched (initial mount / post-login)
 *   - `null`      → fetched but no profile exists yet (404 → onboarding)
 *   - object      → fully loaded, can render protected pages
 *
 * RequireResearcher reads this and decides whether to render the route,
 * redirect to /onboarding, or bounce to /auth.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { clearSession, loadSession } from '../services/authService';
import { getMyResearcher, type ResearcherResponse } from '../services/researcherService';

type ResearcherState = ResearcherResponse | null | undefined;

interface ResearcherContextValue {
  researcher: ResearcherState;
  /**
   * Non-null when the last fetch failed for a reason that ISN'T "no
   * profile" or "unauthenticated" — i.e. network down, server crash,
   * timeout. Distinct from the `researcher = null` case so route guards
   * can show a retry screen instead of bouncing the user to /onboarding.
   */
  error: string | null;
  setResearcher: (r: ResearcherResponse | null) => void;
  ensureLoaded: () => Promise<ResearcherState>;
  /**
   * Force a re-fetch even if we already have a cached value. Use after
   * any event that invalidates the cache — login, logout, profile edit.
   */
  refresh: () => Promise<ResearcherState>;
}

const ResearcherContext = createContext<ResearcherContextValue | undefined>(undefined);

export function ResearcherProvider({ children }: { children: ReactNode }) {
  const [researcher, setResearcherState] = useState<ResearcherState>(undefined);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<ResearcherState> | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Global auth-expiry listener — if any API call fires the
  // `auth:unauthorized` event, drop the cached profile and bounce to /auth.
  useEffect(() => {
    const onUnauthorized = () => {
      setResearcherState(null);
      if (location.pathname !== '/auth') {
        toast.error('Your session has expired. Please log in again.');
        navigate('/auth', { replace: true });
      }
    };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [navigate, location.pathname]);

  const setResearcher = useCallback((r: ResearcherResponse | null) => {
    setError(null);
    setResearcherState(r);
  }, []);

  /**
   * Always hits the API — used by both ensureLoaded (on a cache miss) and
   * refresh (to bypass the cache). Concurrent callers share the in-flight
   * promise to avoid duplicate /api/researchers/me requests.
   *
   * Returns:
   *   - ResearcherResponse on success
   *   - null on 404 (caller should redirect to /onboarding)
   *   - null + clearSession + nav to /auth on 401/403
   */
  const fetchProfile = useCallback(async (): Promise<ResearcherState> => {
    if (!loadSession()) {
      setError(null);
      setResearcherState(null);
      return null;
    }
    if (inFlight.current) return inFlight.current;

    inFlight.current = (async () => {
      try {
        const profile = await getMyResearcher();
        setError(null);
        setResearcherState(profile);
        return profile;
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (message.includes('404')) {
          // No profile yet — legitimate state, not a fetch failure.
          setError(null);
          setResearcherState(null);
          return null;
        }
        if (message.includes('401') || message.includes('403')) {
          // Auth issue — handled by the unauthorized listener; clear the
          // session and the error so /auth doesn't show a stale banner.
          setError(null);
          clearSession();
          setResearcherState(null);
          return null;
        }
        // Real fetch failure (backend down, network out, 5xx). Leave
        // researcher as `undefined` so route guards know we haven't
        // resolved it — they'll render the retry screen on `error`
        // rather than treating null as "no profile" and routing to
        // /onboarding.
        console.error('Failed to resolve researcher profile:', err);
        setError('Unable to reach the FundSphere server. Check the backend is running and try again.');
        return undefined;
      } finally {
        inFlight.current = null;
      }
    })();

    return inFlight.current;
  }, []);

  /**
   * Lazily fetch only if we haven't already. Returns the cached value
   * (including a cached `null` for "no profile") without re-hitting the API.
   * Use `refresh()` when the cache may be stale (login, logout, profile edit).
   */
  const ensureLoaded = useCallback(async (): Promise<ResearcherState> => {
    if (researcher !== undefined) return researcher;
    return fetchProfile();
  }, [researcher, fetchProfile]);

  const refresh = useCallback(async (): Promise<ResearcherState> => {
    setResearcherState(undefined);
    inFlight.current = null;
    return fetchProfile();
  }, [fetchProfile]);

  const value = useMemo(
    () => ({ researcher, error, setResearcher, ensureLoaded, refresh }),
    [researcher, error, setResearcher, ensureLoaded, refresh],
  );

  return <ResearcherContext.Provider value={value}>{children}</ResearcherContext.Provider>;
}

export function useResearcher() {
  const ctx = useContext(ResearcherContext);
  if (!ctx) throw new Error('useResearcher must be used inside ResearcherProvider');
  return ctx;
}
