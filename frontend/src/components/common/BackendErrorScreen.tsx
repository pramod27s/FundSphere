import { useState } from 'react';
import { ServerCrash, RefreshCw, LogOut } from 'lucide-react';
import { clearSession } from '../../services/authService';

interface BackendErrorScreenProps {
  message: string;
  /** Returns a promise so the button can show a spinner during retry. */
  onRetry: () => Promise<unknown>;
  /** Lets the user escape if the retry keeps failing. */
  onSignOut?: () => void;
}

/**
 * Shown by route guards when we have a session but can't reach the
 * backend. Distinct from "no profile" (which sends users to onboarding)
 * and "auth expired" (which redirects to /auth) — those are recoverable
 * via navigation; backend-down is recoverable via retry.
 */
export default function BackendErrorScreen({ message, onRetry, onSignOut }: BackendErrorScreenProps) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  const handleSignOut = () => {
    clearSession();
    onSignOut?.();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-brand-50 via-white to-primary-50/30">
      <div className="max-w-md w-full bg-white border border-brand-200/70 rounded-2xl shadow-[0_8px_24px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)] p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/60 flex items-center justify-center border border-amber-200 shadow-inner">
          <ServerCrash className="w-8 h-8 text-amber-600" />
        </div>

        <h1 className="text-xl font-bold text-brand-900 tracking-tight mb-2">
          Can't reach FundSphere
        </h1>
        <p className="text-sm text-brand-600 leading-relaxed mb-6">
          {message}
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold text-sm shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? 'Retrying…' : 'Try again'}
          </button>

          {onSignOut && (
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-brand-200 hover:border-brand-300 hover:bg-brand-50 text-brand-700 font-medium text-sm transition-all"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          )}
        </div>

        <p className="text-[11px] text-brand-400 mt-5 leading-snug">
          If this keeps happening, the FundSphere services may be down for maintenance.
        </p>
      </div>
    </div>
  );
}
