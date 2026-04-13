import { useState } from 'react';
import AnimatedLogo from '../common/AnimatedLogo.tsx';
import { login, register, saveSession, type AuthSession } from '../../services/authService';

interface AuthPageProps {
  onAuthenticated: (session: AuthSession) => void;
}

export default function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const session = mode === 'login'
        ? await login({ email, password })
        : await register({ fullName, email, password });
      saveSession(session);
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = 'w-full rounded-lg border border-brand-200 px-4 py-3 outline-none focus:border-primary-500';

  return (
    <div className="min-h-screen bg-brand-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-brand-100 shadow-lg p-6 space-y-4">
        <div className="flex items-center gap-3">
          <AnimatedLogo className="w-8 h-8" />
          <h1 className="text-xl font-semibold text-brand-900">FundSphere</h1>
        </div>

        <div className="flex gap-2 rounded-lg bg-brand-100 p-1">
          <button className={`flex-1 rounded-md py-2 text-sm ${mode === 'login' ? 'bg-white shadow' : ''}`} onClick={() => setMode('login')}>Login</button>
          <button className={`flex-1 rounded-md py-2 text-sm ${mode === 'register' ? 'bg-white shadow' : ''}`} onClick={() => setMode('register')}>Register</button>
        </div>

        {mode === 'register' && (
          <input
            className={inputClass}
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        )}

        <input
          className={inputClass}
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className={inputClass}
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={() => void submit()}
          disabled={isLoading}
          className="w-full rounded-lg bg-primary-600 py-3 text-white font-medium hover:bg-primary-700 disabled:opacity-70"
        >
          {isLoading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}
        </button>
      </div>
    </div>
  );
}

