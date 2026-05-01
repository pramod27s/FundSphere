import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, UserPlus, LogIn, User } from 'lucide-react';

interface RegisterProps {
  onRegisterSuccess: () => void;
  onNavigateToLogin: () => void;
}

export default function Register({ onRegisterSuccess, onNavigateToLogin }: RegisterProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    try {
      const { register, saveSession } = await import('../../services/authService');
      const session = await register({ email, password, fullName: name });
      saveSession(session);
      onRegisterSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during registration. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="bg-white/80 backdrop-blur-xl border border-white/40 shadow-2xl rounded-3xl p-8 sm:p-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-50 text-primary-600 mb-4 shadow-inner">
            <UserPlus size={32} />
          </div>
          <h2 className="text-3xl font-extrabold text-brand-900 tracking-tight">Create Account</h2>
          <p className="text-brand-800/60 mt-2 font-medium">Join FundSphere and discover opportunities</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm text-center font-medium">
              {errorMsg}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-brand-800 mb-1">Full Name</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-brand-800/40 group-focus-within:text-primary-500 transition-colors">
                  <User size={20} />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-brand-100 rounded-xl bg-white/50 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none text-brand-900 placeholder:text-brand-800/40 shadow-sm"
                  placeholder="John Doe"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-brand-800 mb-1">Email Address</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-brand-800/40 group-focus-within:text-primary-500 transition-colors">
                  <Mail size={20} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-brand-100 rounded-xl bg-white/50 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none text-brand-900 placeholder:text-brand-800/40 shadow-sm"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-brand-800 mb-1">Password</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-brand-800/40 group-focus-within:text-primary-500 transition-colors">
                  <Lock size={20} />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-brand-100 rounded-xl bg-white/50 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none text-brand-900 placeholder:text-brand-800/40 shadow-sm"
                  placeholder="••••••••"
                  required
                  minLength={8}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center py-3.5 px-4 rounded-xl text-white bg-linear-to-r from-brand-900 to-brand-800 hover:from-black hover:to-brand-900 shadow-lg shadow-brand-900/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-900 transform transition-all active:scale-[0.98] font-bold text-lg group mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Signing Up...' : 'Sign Up'}
            {!isLoading && <ArrowRight size={20} className="ml-2 group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>

        <div className="mt-8 text-center text-sm font-medium text-brand-800/60 flex items-center justify-center gap-2">
          <span>Already have an account?</span>
          <button 
            type="button"
            onClick={onNavigateToLogin}
            className="text-brand-900 inline-flex items-center hover:text-black hover:underline transition-all"
          >
            Log in <LogIn size={16} className="ml-1" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
