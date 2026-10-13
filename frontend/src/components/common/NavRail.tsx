import { NavLink } from 'react-router-dom';
import { Bookmark, ClipboardCheck, Compass, FileText, Landmark, type LucideIcon } from 'lucide-react';
import UserAvatarMenu from './UserAvatarMenu';
import { useSavedGrantIds } from '../../hooks/useSavedGrants';
import { useDeadlineAlerts } from '../../hooks/useDeadlineAlerts';

interface NavRailProps {
  researcherId: number;
}

type Badge = 'saved' | 'deadlines';

const ITEMS: { to: string; label: string; icon: LucideIcon; badge?: Badge }[] = [
  { to: '/discovery', label: 'Discover', icon: Compass },
  { to: '/saved', label: 'Saved', icon: Bookmark, badge: 'saved' },
  { to: '/applications', label: 'Apply', icon: ClipboardCheck },
  { to: '/proposal', label: 'Proposals', icon: FileText },
  { to: '/my-grants', label: 'My grants', icon: Landmark, badge: 'deadlines' },
];

/** A tab's icon in its pill, with the saved-count or urgent-deadline badge. */
function TabIcon({ icon: Icon, badge, isActive, savedCount, urgent }: {
  icon: LucideIcon;
  badge?: Badge;
  isActive: boolean;
  savedCount: number;
  urgent: number;
}) {
  return (
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
      {badge === 'deadlines' && urgent > 0 && (
        <span
          className="absolute -top-1 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] font-bold leading-[18px] text-center tabular-nums ring-2 ring-white"
          aria-label={`${urgent} grant ${urgent === 1 ? 'deadline' : 'deadlines'} overdue or due within a week`}
        >
          {urgent > 99 ? '99+' : urgent}
        </span>
      )}
    </span>
  );
}

function tabLabelClass(isActive: boolean) {
  return isActive ? 'font-semibold text-primary-800' : 'font-medium text-brand-500 group-hover:text-brand-800';
}

/**
 * App navigation. On desktop, a slim vertical rail pinned to the right edge
 * with the account menu on top and icon + label tabs below. On phones, the
 * same tabs plus the account menu as a bar along the bottom of the screen;
 * its height is --mobile-tab-bar (index.css), which pages leave clear.
 */
export default function NavRail({ researcherId }: NavRailProps) {
  const { savedIds } = useSavedGrantIds();
  const savedCount = savedIds.size;
  const { urgent } = useDeadlineAlerts();

  return (
    <>
      <aside
        className="hidden md:flex fixed inset-y-0 right-0 z-40 w-20 flex-col items-center bg-white border-l border-brand-200"
        aria-label="App navigation"
      >
        {/* 64px, like every page header, so the top borders form one line */}
        <div className="h-16 w-full flex items-center justify-center border-b border-brand-200 shrink-0">
          <UserAvatarMenu researcherId={researcherId} />
        </div>

        <nav aria-label="Primary" className="flex flex-col items-center gap-2 w-full pt-4">
          {ITEMS.map(({ to, label, icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              className="group flex flex-col items-center gap-1 w-full py-1 rounded-lg"
            >
              {({ isActive }) => (
                <>
                  <TabIcon icon={icon} badge={badge} isActive={isActive} savedCount={savedCount} urgent={urgent} />
                  <span className={`text-xs ${tabLabelClass(isActive)}`}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <nav
        aria-label="Primary"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur border-t border-brand-200 pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-6 h-16">
          {ITEMS.map(({ to, label, icon, badge }) => (
            <li key={to}>
              <NavLink to={to} className="group flex h-full flex-col items-center justify-center gap-0.5">
                {({ isActive }) => (
                  <>
                    <TabIcon icon={icon} badge={badge} isActive={isActive} savedCount={savedCount} urgent={urgent} />
                    <span className={`text-[11px] leading-tight whitespace-nowrap ${tabLabelClass(isActive)}`}>{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li className="flex h-full flex-col items-center justify-center gap-0.5">
            <UserAvatarMenu researcherId={researcherId} placement="above" size="sm" />
            <span className="text-[11px] leading-tight font-medium text-brand-500">Account</span>
          </li>
        </ul>
      </nav>
    </>
  );
}
