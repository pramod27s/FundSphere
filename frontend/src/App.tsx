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
      
      {/* Temporary Navigation for Review Purposes */}
      <div className="fixed bottom-4 right-4 z-50 flex gap-2 bg-white p-2 rounded-xl shadow-lg border border-brand-200">
        <button 
          onClick={() => setCurrentPage('onboarding')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${currentPage === 'onboarding' ? 'bg-primary-600 text-white' : 'bg-brand-50 text-brand-600 hover:bg-brand-100'}`}
        >
          View Onboarding
        </button>
        <button 
          onClick={() => setCurrentPage('discovery')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${currentPage === 'discovery' ? 'bg-primary-600 text-white' : 'bg-brand-50 text-brand-600 hover:bg-brand-100'}`}
        >
          View Grant Discovery
        </button>
      </div>

      {currentPage === 'onboarding' ? (
        <div className="w-full max-w-3xl">
          <OnboardingWizard />
        </div>
      ) : currentPage === 'discovery' ? (
        <GrantDiscovery />
      ) : null}
    </div>
  );
}

export default App;
