import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Bookmark, FileText } from 'lucide-react';
import { loadSession } from '../../services/authService';

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

  return (
    <div className="relative z-50" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-sm font-semibold flex items-center justify-center shadow-md hover:ring-2 hover:ring-primary-200 focus:outline-none focus:ring-2 focus:ring-primary-300 transition-all overflow-hidden"
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
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 mt-2 w-52 bg-white/95 backdrop-blur-xl border border-brand-100 rounded-xl shadow-xl shadow-brand-900/5 py-1 overflow-hidden z-50"
          >
            <button
              onClick={() => handleNavigate('profile')}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-brand-600 hover:bg-brand-50 hover:text-brand-900 transition-colors"
            >
              <User className="w-4 h-4 text-primary-500 shrink-0" />
              View Profile
            </button>

            <div className="border-t border-brand-100 my-1" />

            <button
              onClick={() => handleNavigate('saved-grants')}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-brand-600 hover:bg-brand-50 hover:text-brand-900 transition-colors"
            >
              <Bookmark className="w-4 h-4 text-primary-500 shrink-0" />
              Saved Grants
            </button>

            <button
              onClick={() => handleNavigate('proposal')}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-brand-600 hover:bg-brand-50 hover:text-brand-900 transition-colors"
            >
              <FileText className="w-4 h-4 text-primary-500 shrink-0" />
              Proposal Assistant
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
