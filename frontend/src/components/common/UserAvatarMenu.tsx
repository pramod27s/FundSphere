import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Bookmark, FileText, LogOut } from 'lucide-react';
import { loadSession, clearSession } from '../../services/authService';
import { useSavedGrantIds } from '../../hooks/useSavedGrants';

interface UserAvatarMenuProps {
  researcherId?: number;
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function UserAvatarMenu({ researcherId }: UserAvatarMenuProps) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const session = loadSession();
  const initials = session ? getInitials(session.user.fullName) : '?';

  // Lightweight saved-grant count — just IDs, no full payload fetch.
  const { savedIds } = useSavedGrantIds();
  const savedCount = savedIds.size;
  const savedDisplay = savedCount > 9 ? '9+' : String(savedCount);

  const [profileImage, setProfileImage] = useState<string | null>(() =>
    researcherId ? localStorage.getItem(`profile_image_${researcherId}`) : null,
  );

  useEffect(() => {
    if (!researcherId) return;
    const key = `profile_image_${researcherId}`;
    setProfileImage(localStorage.getItem(key));

    const handleStorage = (e: StorageEvent) => {
      if (e.key === key) setProfileImage(e.newValue);
    };
    const handleLocalUpdate = () => setProfileImage(localStorage.getItem(key));

    window.addEventListener('storage', handleStorage);
    window.addEventListener('profile:image-updated', handleLocalUpdate);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('profile:image-updated', handleLocalUpdate);
    };
  }, [researcherId]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const handleNavigate = (page: 'profile' | 'saved-grants' | 'proposal') => {
    setIsOpen(false);
    const pathMap = {
      profile: '/profile',
      'saved-grants': '/saved',
      proposal: '/proposal',
    } as const;
    navigate(pathMap[page]);
  };

  const handleLogout = () => {
    setIsOpen(false);
    clearSession();
    navigate('/auth', { replace: true });
  };

  return (
    <div className="relative z-50" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-sm font-semibold flex items-center justify-center shadow-md hover:ring-2 hover:ring-primary-200 focus:outline-none focus:ring-2 focus:ring-primary-300 transition-all overflow-hidden cursor-pointer"
        aria-label="Open user menu"
        aria-expanded={isOpen}
      >
        {profileImage ? (
          <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 mt-2 w-56 bg-white border border-brand-200/80 rounded-2xl shadow-xl shadow-brand-900/10 py-1.5 overflow-hidden z-50"
          >
            {/* User Identity Header */}
            {session && (
              <div className="px-4 py-2.5 border-b border-brand-100 bg-brand-50/50">
                <p className="text-sm font-bold text-brand-900 truncate">{session.user.fullName}</p>
                <p className="text-xs text-brand-500 truncate">{session.user.email}</p>
              </div>
            )}

            <div className="py-1">
              <button
                onClick={() => handleNavigate('profile')}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-brand-700 hover:bg-brand-50 hover:text-brand-900 transition-colors cursor-pointer"
              >
                <User className="w-4 h-4 text-primary-600 shrink-0" />
                <span>View Profile</span>
              </button>

              {/* Mobile-only shortcuts (hidden on desktop where navbar tabs are present) */}
              <div className="md:hidden">
                <div className="border-t border-brand-100 my-1" />
                <button
                  onClick={() => handleNavigate('saved-grants')}
                  className="flex items-center gap-3 w-full px-4 py-2 text-sm text-brand-700 hover:bg-brand-50 hover:text-brand-900 transition-colors cursor-pointer"
                >
                  <Bookmark className="w-4 h-4 text-primary-600 shrink-0" />
                  <span className="flex-1 text-left">Saved Grants</span>
                  {savedCount > 0 && (
                    <span className="text-[10px] font-bold tabular-nums bg-primary-100 text-primary-800 px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                      {savedDisplay}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => handleNavigate('proposal')}
                  className="flex items-center gap-3 w-full px-4 py-2 text-sm text-brand-700 hover:bg-brand-50 hover:text-brand-900 transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-primary-600 shrink-0" />
                  <span>Proposal Assistant</span>
                </button>
              </div>

              <div className="border-t border-brand-100 my-1" />

              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-red-500 shrink-0" />
                <span>Sign Out</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
