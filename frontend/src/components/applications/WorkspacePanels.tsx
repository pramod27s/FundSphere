import { User } from 'lucide-react';
import type { ChecklistItem } from '../../services/applicationsService';
import { formatDay, todayIso } from '../../utils/applicationDates';
import { PanelCard, PanelNote } from '../common/PageLayout';
import { CATEGORY_META, CATEGORY_ORDER } from './applicationMeta';

/*
 * Side cards for an application's tabs (xl up). They summarise what the
 * tab lists, so below xl, where the tab has the full width, they're left out.
 */

/** Checklist tab: how far each kind of requirement has got. Items marked not applicable don't count. */
export function CategoryProgress({ items }: { items: ChecklistItem[] }) {
  const rows = CATEGORY_ORDER.flatMap((category) => {
    const counted = items.filter((i) => i.category === category && i.status !== 'NA');
    return counted.length === 0 ? [] : [{ category, total: counted.length, done: counted.filter((i) => i.status === 'DONE').length }];
  });
  if (rows.length === 0) return null;
  const done = rows.reduce((n, r) => n + r.done, 0);
  const total = rows.reduce((n, r) => n + r.total, 0);

  return (
    <PanelCard title="By category" detail={`${done} of ${total} done`} className="hidden xl:block">
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.category}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium text-brand-800 truncate">{CATEGORY_META[row.category].label}</span>
              <span className="shrink-0 tabular-nums text-brand-500">{row.done}/{row.total}</span>
            </div>
            <span className="mt-1 block h-1.5 rounded-full bg-brand-100 overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-full bg-primary-500" style={{ width: `${(row.done / row.total) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}

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
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}
