/**
 * The researcher-profile context and its hook. The provider component lives
 * in ResearcherContext.tsx; they are separate files so fast refresh keeps
 * working (a module that exports a component should export only components).
 *
 * Three logical states for the researcher value:
 *   - `undefined` → not yet fetched (initial mount / post-login)
 *   - `null`      → fetched but no profile exists yet (404 → onboarding)
 *   - object      → fully loaded, can render protected pages
 */
import { createContext, useContext } from 'react';
import type { ResearcherResponse } from '../services/researcherService';

export type ResearcherState = ResearcherResponse | null | undefined;

export interface ResearcherContextValue {
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

export const ResearcherContext = createContext<ResearcherContextValue | undefined>(undefined);

export function useResearcher() {
  const ctx = useContext(ResearcherContext);
  if (!ctx) throw new Error('useResearcher must be used inside ResearcherProvider');
  return ctx;
}
