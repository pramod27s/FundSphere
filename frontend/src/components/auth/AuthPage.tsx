import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Login from './Login';
import Register from './Register';
import AnimatedLogo from '../common/AnimatedLogo';
import type { AuthSession } from '../../services/authService';

interface AuthPageProps {
  /**
   * Called after either login or register completes successfully and the
   * session has been persisted to localStorage. May return a Promise —
   * the Login/Register button keeps its loading state until this resolves
   * so the user isn't shown a brief "logged in but still on auth form"
   * state during the post-auth profile fetch + route decision.
   */
  onAuthenticated: (session?: AuthSession) => void | Promise<void>;
}

type AuthMode = 'login' | 'register';

export default function AuthPage({ onAuthenticated }: AuthPageProps) {
  // ?mode=register opens the sign-up form, e.g. from "Get started" on the landing page.
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setModeState] = useState<AuthMode>(searchParams.get('mode') === 'register' ? 'register' : 'login');
  const setMode = (next: AuthMode) => {
    setModeState(next);
    setSearchParams(next === 'register' ? { mode: 'register' } : {}, { replace: true });
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center gap-6">
      <div className="flex items-center gap-3">
        <AnimatedLogo className="w-9 h-9" />
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="text-primary-600">Fund</span>
          <span className="text-brand-900">Sphere</span>
        </h1>
      </div>

      <AnimatePresence mode="wait">
        {mode === 'login' ? (
          <Login
            key="login"
            onLoginSuccess={() => onAuthenticated()}
            onNavigateToRegister={() => setMode('register')}
          />
        ) : (
          <Register
            key="register"
            onRegisterSuccess={() => onAuthenticated()}
            onNavigateToLogin={() => setMode('login')}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
