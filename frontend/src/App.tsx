import { useEffect, useRef, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import OnboardingWizard from './components/onboarding/OnboardingWizard.tsx';
import GrantDiscovery from './components/discovery/GrantDiscovery.tsx';
import ResearcherProfile from './components/profile/ResearcherProfile.tsx';
import AuthPage from './components/auth/AuthPage.tsx';
import SavedGrants from './components/saved-grants/SavedGrants.tsx';
import WritingProposal from './components/proposal/WritingProposal.tsx';
import LandingPage from './components/landing/LandingPage.tsx';
import BackendErrorScreen from './components/common/BackendErrorScreen.tsx';
import ScrollToTopButton from './components/common/ScrollToTopButton.tsx';
import { loadSession, clearSession } from './services/authService';
import { ResearcherProvider, useResearcher } from './context/ResearcherContext';

const SCROLL_KEY_PREFIX = 'fundsphere.scroll.';

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
        <Outlet />
        <ScrollToTopButton />
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
  const [resolved, setResolved] = useState(researcher !== undefined);

  useEffect(() => {
    if (researcher !== undefined) {
      setResolved(true);
      return;
    }
    void (async () => {
      await ensureLoaded();
      setResolved(true);
    })();
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
  const { researcher, ensureLoaded, refresh } = useResearcher();
  const [resolved, setResolved] = useState(researcher !== undefined);

  // On first mount: if a session already exists, resolve the profile and
  // redirect. This handles "user types /auth while logged in".
  useEffect(() => {
    if (researcher !== undefined) {
      setResolved(true);
      return;
    }
    if (!loadSession()) {
      setResolved(true);
      return;
    }
    void (async () => {
      await ensureLoaded();
      setResolved(true);
    })();
  }, [researcher, ensureLoaded]);

  if (!resolved) return null;
  if (researcher) return <Navigate to="/discovery" replace />;
  if (researcher === null && loadSession()) return <Navigate to="/onboarding" replace />;

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
  const [resolved, setResolved] = useState(researcher !== undefined);

  useEffect(() => {
    if (researcher !== undefined) {
      setResolved(true);
      return;
    }
    void (async () => {
      await ensureLoaded();
      setResolved(true);
    })();
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
      onBack={() => navigate('/discovery')}
      onLogout={() => {
        clearSession();
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

function ProposalRoute() {
  const navigate = useNavigate();
  return <WritingProposal onBack={() => navigate('/discovery')} />;
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
          <Route path="/discovery" element={<DiscoveryRoute />} />
          <Route path="/saved" element={<SavedRoute />} />
          <Route path="/proposal" element={<ProposalRoute />} />
          <Route path="/profile" element={<ProfileRoute />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
