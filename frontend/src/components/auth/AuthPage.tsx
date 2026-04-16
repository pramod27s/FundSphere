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

  const getFriendlyErrorMessage = (err: unknown): string => {
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      // Handle network errors
      if (msg.includes('failed to fetch') || msg.includes('network error')) {
        return 'Unable to connect to the server. Please check your internet connection.';
      }
      // Industry Standard: Do not reveal if the email exists or if the password was wrong on login
      if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid credentials')) {
        return 'Invalid email or password.';
      }
      // Handle registration conflict
      if (msg.includes('409') || msg.includes('conflict') || msg.includes('already registered')) {
        return 'An account with this email already exists.';
      }
      // Generic Bad Request
      if (msg.includes('400')) {
        return 'Please ensure all fields are filled out correctly.';
      }
      return 'An unexpected error occurred. Please try again later.';
    }
    return 'Authentication failed.';
  };

  const submit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    setError(null);

    // Client-side format validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (mode === 'register' && !fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'login') {
        const session = await login({ email, password });
        saveSession(session);
        onAuthenticated(session);
      } else {
        await register({ fullName, email, password });
        setMode('login');
        setPassword('');
        alert('Registration successful! Please log in with your new account.');
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
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

        <div className="flex gap-2 rounded-lg bg-brand-100 p-1 mb-4">
          <button type="button" className={`flex-1 rounded-md py-2 text-sm ${mode === 'login' ? 'bg-white shadow' : ''}`} onClick={() => setMode('login')}>Login</button>
          <button type="button" className={`flex-1 rounded-md py-2 text-sm ${mode === 'register' ? 'bg-white shadow' : ''}`} onClick={() => setMode('register')}>Register</button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <input
              className={inputClass}
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          )}

          <input
            className={inputClass}
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            className={inputClass}
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-primary-600 py-3 text-white font-medium hover:bg-primary-700 disabled:opacity-70"
          >
            {isLoading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
