import { User } from 'lucide-react';
import type { ChecklistItem } from '../../services/applicationsService';
import { formatDay, todayIso } from '../../utils/applicationDates';
import { PanelCard, PanelNote } from '../common/PageLayout';

/*
 * Side cards for an application's tabs (xl up). They summarise what the
 * tab lists, so below xl, where the tab has the full width, they're left out.
 * (The checklist's progress by category is on its filter chips, in ChecklistTab.)
 */

/** Tracker tab: who has what left, overdue first, with the unassigned items last. */
export function OwnerLoad({ items }: { items: ChecklistItem[] }) {
  if (items.length === 0) return null;
  const today = todayIso();
  const open = items.filter((i) => i.status === 'TODO');

  const byOwner = new Map<string | null, { open: number; overdue: number; nextDue: string | null }>();
  for (const item of open) {
    const owner = item.ownerName?.trim() || null;
    const row = byOwner.get(owner) ?? { open: 0, overdue: 0, nextDue: null };
    row.open += 1;
    if (item.dueDate && item.dueDate < today) row.overdue += 1;
    else if (item.dueDate && (row.nextDue === null || item.dueDate < row.nextDue)) row.nextDue = item.dueDate;
    byOwner.set(owner, row);
  }
  const rows = [...byOwner]
    .map(([owner, row]) => ({ owner, ...row }))
    .sort((a, b) =>
      Number(a.owner === null) - Number(b.owner === null)
      || b.overdue - a.overdue
      || b.open - a.open
      || (a.owner ?? '').localeCompare(b.owner ?? ''));
  const unassigned = byOwner.get(null)?.open ?? 0;

  return (
    <PanelCard title="Who's doing what" detail={`${open.length} to do`} className="hidden xl:block">
      {open.length === 0 ? (
        <PanelNote>Every item is done or not applicable.</PanelNote>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <li key={row.owner ?? ''} className="flex items-center gap-3">
                <span
                  className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-[11px] font-semibold flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  {row.owner ? initials(row.owner) : <User className="w-3.5 h-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-brand-900 truncate">{row.owner ?? 'Unassigned'}</span>
                  <span className="block text-xs text-brand-500 tabular-nums">
                    {row.open} to do
                    {row.overdue > 0 && <span className="font-semibold text-red-700"> · {row.overdue} overdue</span>}
                    {row.overdue === 0 && row.nextDue && <> · next due {formatDay(row.nextDue, false)}</>}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {unassigned > 0 && (
            <p className="mt-3 pt-3 border-t border-brand-100 text-xs text-brand-500 leading-relaxed">
              Give each item an owner, and the pending list you send groups the work by person.
            </p>
          )}
        </>
      )}
    </PanelCard>
  );
}

/** "Priya Sharma" → "PS"; "lab office" → "LO". */
/** "Ravi (JRF)" → "RJ": the first letter of each word, skipping brackets and punctuation. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word.match(/\p{L}|\p{N}/u)?.[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
