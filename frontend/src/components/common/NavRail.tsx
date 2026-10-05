import { NavLink } from 'react-router-dom';
import { Bookmark, Compass, FileText, type LucideIcon } from 'lucide-react';
import UserAvatarMenu from './UserAvatarMenu';
import { useSavedGrantIds } from '../../hooks/useSavedGrants';

interface NavRailProps {
  researcherId: number;
}

const ITEMS: { to: string; label: string; icon: LucideIcon; badge?: 'saved' }[] = [
  { to: '/discovery', label: 'Discover', icon: Compass },
  { to: '/saved', label: 'Saved', icon: Bookmark, badge: 'saved' },
  { to: '/proposal', label: 'Proposal', icon: FileText },
];

/**
 * Desktop app navigation: a slim vertical rail pinned to the right edge
 * with the account menu on top and icon + label tabs below. Mobile keeps
 * using the avatar menu, which carries the same destinations.
 */
export default function NavRail({ researcherId }: NavRailProps) {
  const { savedIds } = useSavedGrantIds();
  const savedCount = savedIds.size;

  return (
    <aside
      className="hidden md:flex fixed inset-y-0 right-0 z-40 w-20 flex-col items-center bg-white border-l border-brand-200"
      aria-label="App navigation"
    >
      {/* 64px, like every page header, so the top borders form one line */}
      <div className="h-16 w-full flex items-center justify-center border-b border-brand-200 shrink-0">
        <UserAvatarMenu researcherId={researcherId} />
      </div>

      <nav aria-label="Primary" className="flex flex-col items-center gap-2 w-full pt-4">
        {ITEMS.map(({ to, label, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            className="group flex flex-col items-center gap-1 w-full py-1 rounded-lg"
          >
            {({ isActive }) => (
              <>
                <span
                  className={`relative flex items-center justify-center w-12 h-8 rounded-full transition-colors ${
                    isActive
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-brand-500 group-hover:bg-brand-100 group-hover:text-brand-800'
                  }`}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  {badge === 'saved' && savedCount > 0 && (
                    <span
                      className="absolute -top-1 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary-600 text-white text-[11px] font-bold leading-[18px] text-center tabular-nums ring-2 ring-white"
                      aria-label={`${savedCount} saved`}
                    >
                      {savedCount > 99 ? '99+' : savedCount}
                    </span>
                  )}
                </span>
                <span
                  className={`text-xs ${
                    isActive ? 'font-semibold text-primary-800' : 'font-medium text-brand-500 group-hover:text-brand-800'
                  }`}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
