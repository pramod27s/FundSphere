import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import OnboardingWizard from './components/onboarding/OnboardingWizard.tsx';
import GrantDiscovery from './components/discovery/GrantDiscovery.tsx';
import ResearcherProfile from './components/profile/ResearcherProfile.tsx';
import SplashScreen from './components/common/SplashScreen.tsx';
import AuthPage from './components/auth/AuthPage.tsx';
import { clearSession, loadSession, logout, type AuthSession } from './services/authService';
import { getMyResearcher, type ResearcherResponse } from './services/researcherService';

function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(!!loadSession());
  const [currentPage, setCurrentPage] = useState<'splash' | 'onboarding' | 'discovery' | 'profile'>('splash');
  const [researcherData, setResearcherData] = useState<ResearcherResponse | null>(null);

  useEffect(() => {
    if (!session) {
      setResearcherData(null);
      setCurrentPage('splash');
      setIsBootstrapping(false);
      return;
    }

    const bootstrap = async () => {
      setIsBootstrapping(true);
      try {
        const profile = await getMyResearcher();
        setResearcherData(profile);
        setCurrentPage('discovery');
      } catch {
        setResearcherData(null);
        setCurrentPage('onboarding');
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
  }, [session]);

  const handleOnboardingComplete = (data: ResearcherResponse) => {
    setResearcherData(data);
    setCurrentPage('discovery');
  };

  const handleLogout = async () => {
    await logout(session?.refreshToken);
    clearSession();
    setSession(null);
  };

  if (!session) {
    return <AuthPage onAuthenticated={(next) => setSession(next)} />;
  }

  if (isBootstrapping) {
    return <div className="min-h-screen bg-brand-50 flex items-center justify-center text-brand-600">Loading your workspace...</div>;
  }

  return (
    <div className={`min-h-screen bg-brand-50 flex flex-col ${currentPage === 'onboarding' ? 'justify-center items-center p-4 sm:p-6 lg:p-8' : ''}`}>
      <button onClick={() => void handleLogout()} className="fixed top-4 left-4 z-50 bg-white border border-brand-200 rounded-lg px-3 py-2 text-sm">
        Logout
      </button>

      <AnimatePresence mode="wait">
        {currentPage === 'splash' && (
          <SplashScreen key="splash" onComplete={() => setCurrentPage('onboarding')} />
        )}
      </AnimatePresence>

      {currentPage === 'onboarding' ? (
        <div className="w-full max-w-3xl">
          <OnboardingWizard onComplete={handleOnboardingComplete} />
        </div>
      ) : currentPage === 'profile' && researcherData ? (
        <ResearcherProfile 
          researcher={researcherData} 
          onBack={() => setCurrentPage('discovery')} 
        />
      ) : currentPage === 'discovery' ? (
        <div className="relative">
             {/* Simple navigation to toggle back to profile if we have data */}
            {researcherData && (
                <button 
                    onClick={() => setCurrentPage('profile')}
                    className="absolute top-4 right-4 z-50 bg-white shadow-md px-4 py-2 rounded-lg text-sm font-medium text-primary-600 hover:bg-gray-50 border border-gray-100"
                >
                    View Profile
                </button>
            )}
            <GrantDiscovery researcher={researcherData} />
        </div>
      ) : null}
    </div>
  );
}

export default App;
