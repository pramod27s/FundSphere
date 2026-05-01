import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import OnboardingWizard from './components/onboarding/OnboardingWizard.tsx';
import GrantDiscovery from './components/discovery/GrantDiscovery.tsx';
import ResearcherProfile from './components/profile/ResearcherProfile.tsx';
import SplashScreen from './components/common/SplashScreen.tsx';
import AuthPage from './components/auth/AuthPage.tsx';
import UserAvatarMenu from './components/common/UserAvatarMenu.tsx';
import SavedGrants from './components/saved-grants/SavedGrants.tsx';
import WritingProposal from './components/proposal/WritingProposal.tsx';
import { getMyResearcher, type ResearcherResponse } from './services/researcherService';
import { loadSession, clearSession } from './services/authService';

function App() {
  const [currentPage, setCurrentPage] = useState<'splash' | 'auth' | 'onboarding' | 'discovery' | 'profile' | 'saved-grants' | 'proposal'>('splash');
  const [researcherData, setResearcherData] = useState<ResearcherResponse | null>(null);

  useEffect(() => {
    const handleUnauthorized = () => {
      setResearcherData(null);
      setCurrentPage('auth');
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const routeLoggedInUser = async () => {
    try {
      const profile = await getMyResearcher();
      setResearcherData(profile);
      setCurrentPage('discovery');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      if (message.includes('404')) {
        // New user without onboarding profile should be sent to onboarding.
        setCurrentPage('onboarding');
        return;
      }

      if (message.includes('401') || message.includes('403')){
        alert('Your session has expired. Please log in again.');
        clearSession();
        setCurrentPage('auth');
        return;
      }

      console.error('Failed to resolve researcher profile:', error);
      // Only default to onboarding on actual 404. Otherwise it might be a 500 or network error.
      alert('Unable to load profile. Please make sure the backend is running.');
      clearSession();
      setCurrentPage('auth');
    }
  };

  const handleOnboardingComplete = (data: ResearcherResponse) => {
    setResearcherData(data);
    setCurrentPage('discovery');
  };

  const handleAuthSuccess = () => {
    void routeLoggedInUser();
  };

  const handleLogout = () => {
    clearSession();
    setResearcherData(null);
    setCurrentPage('auth');
  };

  return (
    <div className={`min-h-screen bg-brand-50 flex flex-col ${['onboarding', 'auth'].includes(currentPage) ? 'justify-center items-center p-4 sm:p-6 lg:p-8' : ''}`}>
      
      <AnimatePresence mode="wait">
        {currentPage === 'splash' && (
          <SplashScreen 
            key="splash" 
            onComplete={() => {
              const session = loadSession();
              if (!session) {
                setCurrentPage('auth');
                return;
              }
              void routeLoggedInUser();
            }}
          />
        )}
      </AnimatePresence>

      {currentPage === 'auth' ? (
        <AuthPage onAuthenticated={handleAuthSuccess} />
      ) : currentPage === 'onboarding' ? (
        <div className="w-full max-w-3xl">
          <OnboardingWizard onComplete={handleOnboardingComplete} />
        </div>
      ) : currentPage === 'profile' && researcherData ? (
        <ResearcherProfile
          researcher={researcherData}
          onBack={() => setCurrentPage('discovery')}
          onLogout={handleLogout}
        />
      ) : currentPage === 'saved-grants' && researcherData ? (
        <SavedGrants onBack={() => setCurrentPage('discovery')} />
      ) : currentPage === 'proposal' && researcherData ? (
        <WritingProposal onBack={() => setCurrentPage('discovery')} />
      ) : currentPage === 'discovery' ? (
        <div className="relative">
            {researcherData && (
              <div className="absolute top-4 right-4 z-50">
                <UserAvatarMenu onNavigate={(page) => setCurrentPage(page)} />
              </div>
            )}
            <GrantDiscovery researcher={researcherData} />
        </div>
      ) : null}
    </div>
  );
}

export default App;
