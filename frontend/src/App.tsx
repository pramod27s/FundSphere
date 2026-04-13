import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import OnboardingWizard from './components/onboarding/OnboardingWizard.tsx';
import GrantDiscovery from './components/discovery/GrantDiscovery.tsx';
import ResearcherProfile from './components/profile/ResearcherProfile.tsx';
import SplashScreen from './components/common/SplashScreen.tsx';
import type { ResearcherResponse } from './services/researcherService';

function App() {
  const [currentPage, setCurrentPage] = useState<'splash' | 'onboarding' | 'discovery' | 'profile'>('splash');
  const [researcherData, setResearcherData] = useState<ResearcherResponse | null>(null);

  const handleOnboardingComplete = (data: ResearcherResponse) => {
    setResearcherData(data);
    setCurrentPage('discovery');
  };

  return (
    <div className={`min-h-screen bg-brand-50 flex flex-col ${currentPage === 'onboarding' ? 'justify-center items-center p-4 sm:p-6 lg:p-8' : ''}`}>
      
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
