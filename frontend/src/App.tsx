import { Suspense, lazy, useEffect, useRef } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import LandingPage from './components/landing/LandingPage.tsx';
import BackendErrorScreen from './components/common/BackendErrorScreen.tsx';
import ErrorBoundary from './components/common/ErrorBoundary.tsx';
import ScrollToTopButton from './components/common/ScrollToTopButton.tsx';
import TopLoadingBar from './components/common/TopLoadingBar.tsx';
import NavRail from './components/common/NavRail.tsx';
import { RAIL_SCROLL_TOP_POSITION } from './components/common/PageLayout.tsx';

// The landing page ships in the main bundle (it's the first paint for most
// visitors); every other screen is split into its own chunk and fetched on
// first navigation.
const OnboardingWizard = lazy(() => import('./components/onboarding/OnboardingWizard.tsx'));
const GrantDiscovery = lazy(() => import('./components/discovery/GrantDiscovery.tsx'));
const ResearcherProfile = lazy(() => import('./components/profile/ResearcherProfile.tsx'));
const AuthPage = lazy(() => import('./components/auth/AuthPage.tsx'));
const SavedGrants = lazy(() => import('./components/saved-grants/SavedGrants.tsx'));
const ProposalAssistant = lazy(() => import('./components/proposal-review/ProposalAssistant.tsx'));
const Applications = lazy(() => import('./components/applications/Applications.tsx'));
const ApplicationDetail = lazy(() => import('./components/applications/ApplicationDetail.tsx'));
const Awards = lazy(() => import('./components/awards/Awards.tsx'));
const AwardDetail = lazy(() => import('./components/awards/AwardDetail.tsx'));
const ReportEditor = lazy(() => import('./components/awards/ReportEditor.tsx'));
const AdminPage = lazy(() => import('./components/admin/AdminPage.tsx'));
import { loadSession, signOut } from './services/authService';
import { ResearcherProvider } from './context/ResearcherContext';
import { useResearcher } from './context/useResearcher';

const SCROLL_KEY_PREFIX = 'fundsphere.scroll.';

/** Routes rendered inside <AppShell>, i.e. with the desktop nav rail (prefix match). */
const RAIL_ROUTES = ['/discovery', '/saved', '/applications', '/my-grants', '/proposal', '/profile', '/admin'];

function hasNavRail(pathname: string): boolean {
  return RAIL_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Manual scroll-position memory across navigations.
 */
function ScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previousKey = useRef<string>(location.key);

  useEffect(() => {
    return () => {
      try {
        sessionStorage.setItem(
          SCROLL_KEY_PREFIX + previousKey.current,
          String(window.scrollY),
        );
      } catch {
        // sessionStorage might be full or disabled — non-fatal.
      }
    };
  }, [location.key]);

  useEffect(() => {
    if (navigationType === 'POP') {
      const saved = sessionStorage.getItem(SCROLL_KEY_PREFIX + location.key);
      window.scrollTo({ top: saved ? Number(saved) : 0, behavior: 'instant' as ScrollBehavior });
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
    previousKey.current = location.key;
  }, [location.key, navigationType]);

  return null;
}

/**
 * Root layout: provides the researcher context to all routes, owns the
 * single <Toaster>, and applies the centred flex layout used by /auth
 * and /onboarding (the other routes paint full-bleed and override it).
 */
function RootLayout() {
  const location = useLocation();
  const centred = location.pathname === '/auth' || location.pathname === '/onboarding';
  const hasRail = hasNavRail(location.pathname);
  return (
    <ResearcherProvider>
      <ScrollRestoration />
      <div
        className={`min-h-screen flex flex-col ${
          centred ? 'justify-center items-center p-4 sm:p-6 lg:p-8' : ''
        }`}
      >
        <Toaster
          position="bottom-right"
          gutter={8}
          containerClassName={hasRail ? 'bottom-[calc(var(--mobile-tab-bar)_+_0.5rem)]! md:bottom-4! md:right-24!' : undefined}
          toastOptions={{
            duration: 2800,
            style: {
              background: 'white',
              color: '#0f172a',
              border: '1px solid rgb(226 232 240)',
              borderRadius: '12px',
              boxShadow: '0 4px 16px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)',
              fontSize: '14px',
              fontWeight: 500,
              padding: '10px 14px',
            },
            success: { iconTheme: { primary: '#0d9488', secondary: 'white' } },
            error: { iconTheme: { primary: '#dc2626', secondary: 'white' } },
          }}
        />
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<TopLoadingBar visible />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
        <ScrollToTopButton positionClassName={hasRail ? RAIL_SCROLL_TOP_POSITION : undefined} />
      </div>
    </ResearcherProvider>
  );
}

/**
 * Guards every authenticated route. Lazily fetches the researcher profile
 * if it hasn't been loaded yet (e.g. user deep-linked to /discovery on a
 * fresh refresh).
 */
function RequireResearcher() {
  const navigate = useNavigate();
  const { researcher, ensureLoaded, refresh, error } = useResearcher();
  // Settled once the profile is known (an object, or null for none) or the fetch failed.
  const resolved = researcher !== undefined || error !== null;

  useEffect(() => {
    if (researcher === undefined) void ensureLoaded();
  }, [researcher, ensureLoaded]);

  if (!resolved) return null; // No flash — fetch is sub-second
  if (error) {
    return (
      <BackendErrorScreen
        message={error}
        onRetry={() => refresh()}
        onSignOut={() => navigate('/auth', { replace: true })}
      />
    );
  }
  if (!loadSession()) return <Navigate to="/auth" replace />;
  if (researcher === null) return <Navigate to="/onboarding" replace />;
  if (!researcher) return null;
  return <Outlet />;
}

/**
 * `/auth` — public for unauthenticated visitors. If the user is already
 * logged in, kick them through the same route-decision the SplashScreen
 * uses so they land on /discovery or /onboarding rather than re-seeing
 * the login form.
 */
function AuthRoute() {
  const navigate = useNavigate();
  const { researcher, ensureLoaded, refresh, error } = useResearcher();
  const signedIn = loadSession() !== null;
  // Signed out: show the form straight away. Signed in: wait for the profile (or a failed fetch).
  const resolved = !signedIn || researcher !== undefined || error !== null;

  // If a session already exists, resolve the profile and redirect. This
  // handles "user types /auth while logged in".
  useEffect(() => {
    if (researcher === undefined && loadSession()) void ensureLoaded();
  }, [researcher, ensureLoaded]);

  if (!resolved) return null;
  // Only someone still signed in moves on. A profile left in the cache after
  // signing out must not send them to /discovery, which would send them
  // straight back here (an endless redirect instead of the sign-in form).
  if (researcher && signedIn) return <Navigate to="/discovery" replace />;
  if (researcher === null && signedIn) return <Navigate to="/onboarding" replace />;

  // refresh() bypasses any cached `null` left over from a previous logout,
  // so a returning user with a profile lands on /discovery, not /onboarding.
  const handleAuthenticated = async () => {
    const profile = await refresh();
    navigate(profile ? '/discovery' : '/onboarding', { replace: true });
  };

  return <AuthPage onAuthenticated={handleAuthenticated} />;
}

/**
 * `/onboarding` — only reachable when authenticated AND missing a
 * researcher row. Lazily fetches the profile if not yet loaded so a
 * direct URL hit doesn't slip past the existing-profile check.
 */
function OnboardingRoute() {
  const navigate = useNavigate();
  const { researcher, ensureLoaded, refresh, setResearcher, error } = useResearcher();
  // Settled once the profile is known (an object, or null for none) or the fetch failed.
  const resolved = researcher !== undefined || error !== null;

  useEffect(() => {
    if (researcher === undefined) void ensureLoaded();
  }, [researcher, ensureLoaded]);

  if (!loadSession()) return <Navigate to="/auth" replace />;
  if (!resolved) return null;
  if (error) {
    return (
      <BackendErrorScreen
        message={error}
        onRetry={() => refresh()}
        onSignOut={() => navigate('/auth', { replace: true })}
      />
    );
  }
  // Existing profile — wizard would create a duplicate, so bounce.
  if (researcher) return <Navigate to="/discovery" replace />;

  return (
    <div className="w-full max-w-3xl">
      <OnboardingWizard
        onComplete={(data) => {
          setResearcher(data);
          navigate('/discovery', { replace: true });
        }}
      />
    </div>
  );
}

/**
 * Chrome for every signed-in page: content on the left, the nav rail
 * pinned to the right edge on desktop (padding keeps content clear of it).
 */
function AppShell() {
  const { researcher } = useResearcher();
  return (
    <>
      <div className="pb-[var(--mobile-tab-bar)] md:pb-0 md:pr-20">
        {/* Own boundary so switching tabs keeps the rail mounted while the next screen's chunk loads. */}
        <Suspense fallback={<TopLoadingBar visible />}>
          <Outlet />
        </Suspense>
      </div>
      {researcher && <NavRail researcherId={researcher.id} />}
    </>
  );
}

function DiscoveryRoute() {
  const { researcher } = useResearcher();
  return <GrantDiscovery researcher={researcher ?? null} />;
}

function ProfileRoute() {
  const navigate = useNavigate();
  const { researcher, setResearcher } = useResearcher();
  if (!researcher) return null;
  return (
    <ResearcherProfile
      researcher={researcher}
      onLogout={() => {
        signOut();
        setResearcher(null);
        navigate('/auth', { replace: true });
        toast.success('You\'ve been logged out');
      }}
    />
  );
}

function SavedRoute() {
  const navigate = useNavigate();
  return <SavedGrants onBack={() => navigate('/discovery')} />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/auth" element={<AuthRoute />} />
        <Route path="/onboarding" element={<OnboardingRoute />} />
        <Route element={<RequireResearcher />}>
          <Route element={<AppShell />}>
            <Route path="/discovery" element={<DiscoveryRoute />} />
            <Route path="/saved" element={<SavedRoute />} />
            <Route path="/applications" element={<Applications />} />
            <Route path="/applications/:id" element={<ApplicationDetail />} />
            <Route path="/my-grants" element={<Awards />} />
            <Route path="/my-grants/:id" element={<AwardDetail />} />
            <Route path="/my-grants/:id/reports/:draftId" element={<ReportEditor />} />
            <Route path="/proposal" element={<ProposalAssistant />} />
            <Route path="/profile" element={<ProfileRoute />} />
            {/* Admins only: the page asks the server and sends anyone else to /discovery. */}
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
