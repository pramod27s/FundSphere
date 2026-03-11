import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import OnboardingWizard from './components/onboarding/OnboardingWizard.tsx';
import GrantDiscovery from './components/discovery/GrantDiscovery.tsx';
import SplashScreen from './components/common/SplashScreen.tsx';

function App() {
  const [currentPage, setCurrentPage] = useState<'splash' | 'onboarding' | 'discovery'>('splash');

  return (
    <div className={`min-h-screen bg-brand-50 flex flex-col ${currentPage === 'onboarding' ? 'justify-center items-center p-4 sm:p-6 lg:p-8' : ''}`}>
      
      <AnimatePresence mode="wait">
        {currentPage === 'splash' && (
          <SplashScreen key="splash" onComplete={() => setCurrentPage('onboarding')} />
        )}
      </AnimatePresence>

      {currentPage === 'onboarding' ? (
        <div className="w-full max-w-3xl">
          <OnboardingWizard onComplete={() => setCurrentPage('discovery')} />
        </div>
      ) : currentPage === 'discovery' ? (
        <GrantDiscovery />
      ) : null}
    </div>
  );
}

export default App;
