import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight, UserPlus } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: () => void;
  onNavigateToRegister: () => void;
}

export default function Login({ onLoginSuccess, onNavigateToRegister }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // JWT auth will go here later
    // For now, mock a successful login
    onLoginSuccess();
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
            <Lock size={32} />
          </div>
          <h2 className="text-3xl font-extrabold text-brand-900 tracking-tight">Welcome Back</h2>
          <p className="text-brand-800/60 mt-2 font-medium">Log in to access your FundSphere account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
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
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-semibold text-brand-800">Password</label>
                <a href="#" className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors">Forgot password?</a>
              </div>
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
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center py-3.5 px-4 rounded-xl text-white bg-linear-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 shadow-lg shadow-primary-500/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transform transition-all active:scale-[0.98] font-bold text-lg group"
          >
            Sign In
            <ArrowRight size={20} className="ml-2 group-hover:translate-x-1 transition-transform" />
          </button>
        </form>

        <div className="mt-8 text-center text-sm font-medium text-brand-800/60 flex items-center justify-center gap-2">
          <span>Don't have an account?</span>
          <button 
            type="button"
            onClick={onNavigateToRegister}
            className="text-primary-600 inline-flex items-center hover:text-primary-700 hover:underline transition-all"
          >
            Create one <UserPlus size={16} className="ml-1" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
