import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import TopLoadingBar from '../common/TopLoadingBar';
import { loadSession, saveSession, type AuthUser } from '../../services/authService';
import { fetchMe } from '../../services/adminService';
import AdminsSection from './AdminsSection';
import AddGrant from './AddGrant';

type Gate = { status: 'checking' } | { status: 'allowed'; me: AuthUser } | { status: 'denied' };

/**
 * The admin area (2nd.md): adding a grant by hand (Part B) and, for the
 * owner only, the admins (Part A). Rendered only when the server says this account is an admin;
 * the copy of the role saved in the browser can be edited, so it only
 * decides whether the menu shows the link.
 */
export default function AdminPage() {
  const navigate = useNavigate();
  const [gate, setGate] = useState<Gate>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) => {
        if (cancelled) return;
        // Keep the saved copy in step, so the menu matches what the server says.
        const session = loadSession();
        if (session) saveSession({ ...session, user: { ...session.user, role: me.role, owner: me.owner } });
        setGate(me.role === 'ADMIN' ? { status: 'allowed', me } : { status: 'denied' });
      })
      .catch(() => {
        if (!cancelled) setGate({ status: 'denied' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (gate.status === 'checking') return <TopLoadingBar visible />;
  if (gate.status === 'denied') return <Navigate to="/discovery" replace />;
  const { me } = gate;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-white border-b border-brand-200 px-4 sm:px-6 h-16 flex items-center gap-4 sticky top-0 z-30">
        <button
          onClick={() => navigate('/discovery')}
          className="hidden md:flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-900 transition-colors px-2 py-1.5 -ml-2 rounded-lg hover:bg-brand-100"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <div className="hidden md:block h-5 w-px bg-brand-200" />
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center shadow-xs shrink-0">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-brand-900 tracking-tight leading-none truncate">Admin</h1>
            <p className="text-xs text-brand-600 mt-1 leading-none truncate">
              {me.owner ? 'You are the owner' : 'You are an admin'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">
        <AddGrant />
        {/* Only the owner sees who the admins are; the server refuses the list to anyone else. */}
        {me.owner && <AdminsSection />}
      </div>
    </div>
  );
}
