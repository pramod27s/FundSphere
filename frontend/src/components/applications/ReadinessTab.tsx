import { useId, useMemo, useState } from 'react';
import { CalendarClock, Check, ChevronDown, RotateCcw, User } from 'lucide-react';
import type { Application, ChecklistItem, ChecklistItemChanges } from '../../services/applicationsService';
import { dueDefaults, dueHint } from './dueDefaults';
import { dueLabel, TONE_TEXT } from '../../utils/applicationDates';
import { CATEGORY_META } from './applicationMeta';

interface ReadinessTabProps {
  application: Application;
  items: ChecklistItem[];
  onPatchItem: (itemId: number, changes: ChecklistItemChanges) => void;
  onEditDetails: () => void;
}

const EVERYONE = '__everyone__';
const UNASSIGNED = '__unassigned__';

/** 3.3: who is doing each item, by when, and whether it's done. */
export default function ReadinessTab({ application, items, onPatchItem, onEditDetails }: ReadinessTabProps) {
  const listId = useId();
  const [ownerFilter, setOwnerFilter] = useState(EVERYONE);
  const [showClosed, setShowClosed] = useState(false);

  const owners = useMemo(
    () => [...new Set(items.map((i) => i.ownerName?.trim()).filter((o): o is string => Boolean(o)))].sort((a, b) => a.localeCompare(b)),
    [items],
  );

  const matchesOwner = (item: ChecklistItem) =>
    ownerFilter === EVERYONE || (ownerFilter === UNASSIGNED ? !item.ownerName : item.ownerName === ownerFilter);

  const open = items
    .filter((i) => i.status === 'TODO' && matchesOwner(i))
    .sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31') || Number(b.mandatory) - Number(a.mandatory));
  const closed = items.filter((i) => i.status !== 'TODO' && matchesOwner(i));

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-brand-200 bg-white p-10 text-center text-sm text-brand-600">
        Build the checklist first. Then give each item an owner and a due date here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {!application.deadline && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-wrap items-center gap-2">
          <CalendarClock className="w-4 h-4 text-amber-600" />
          <span className="flex-1 min-w-[12rem]">Add the call deadline and every item gets a due date counted back from it.</span>
          <button type="button" onClick={onEditDetails} className="font-semibold text-amber-900 underline underline-offset-2">
            Add deadline
          </button>
        </div>
      )}

      {owners.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto" role="group" aria-label="Show items for">
          {[EVERYONE, ...owners, UNASSIGNED].map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOwnerFilter(o)}
              aria-pressed={ownerFilter === o}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                ownerFilter === o ? 'bg-brand-900 text-white border-brand-900' : 'bg-white text-brand-700 border-brand-200 hover:bg-brand-50'
              }`}
            >
              {o === EVERYONE ? 'Everyone' : o === UNASSIGNED ? 'Unassigned' : o}
            </button>
          ))}
        </div>
      )}

      <datalist id={listId}>
        {owners.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      <section className="bg-white border border-brand-200 rounded-lg overflow-hidden">
        <header className="px-4 py-3 border-b border-brand-100 bg-brand-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-brand-900">To do</h3>
          <span className="text-xs text-brand-500 tabular-nums">{open.length}</span>
        </header>
        {open.length === 0 ? (
          <p className="px-4 py-6 text-sm text-brand-500 text-center">Nothing left to do here.</p>
        ) : (
          <ul className="divide-y divide-brand-100">
            {open.map((item) => (
              <TrackerRow key={item.id} item={item} deadline={application.deadline} ownersListId={listId} onPatch={onPatchItem} />
            ))}
          </ul>
        )}
      </section>

      {closed.length > 0 && (
        <section className="bg-white border border-brand-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            aria-expanded={showClosed}
            className="w-full px-4 py-3 bg-brand-50 flex items-center justify-between text-left"
          >
            <h3 className="text-sm font-bold text-brand-900">Done or not applicable</h3>
            <span className="inline-flex items-center gap-1 text-xs text-brand-500 tabular-nums">
              {closed.length}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showClosed ? 'rotate-180' : ''}`} />
            </span>
          </button>
          {showClosed && (
            <ul className="divide-y divide-brand-100 border-t border-brand-100">
              {closed.map((item) => (
                <TrackerRow key={item.id} item={item} deadline={application.deadline} ownersListId={listId} onPatch={onPatchItem} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function TrackerRow({
  item,
  deadline,
  ownersListId,
  onPatch,
}: {
  item: ChecklistItem;
  deadline: string | null;
  ownersListId: string;
  onPatch: (itemId: number, changes: ChecklistItemChanges) => void;
}) {
  const [owner, setOwner] = useState(item.ownerName ?? '');
  const [lastSynced, setLastSynced] = useState(item.ownerName ?? '');
  // Pick up owner changes made elsewhere (e.g. after a refresh) without
  // clobbering what the user is typing.
  if ((item.ownerName ?? '') !== lastSynced) {
    setLastSynced(item.ownerName ?? '');
    setOwner(item.ownerName ?? '');
  }

  const done = item.status === 'DONE';
  const na = item.status === 'NA';
  const due = dueLabel(item.dueDate, done || na);
  const defaults = dueDefaults(item, deadline);

  const commitOwner = () => {
    const next = owner.trim();
    if (next !== (item.ownerName ?? '')) onPatch(item.id, { ownerName: next });
  };

  return (
    <li className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex gap-3 flex-1 min-w-0">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Mark "${item.text}" as not done` : `Mark "${item.text}" as done`}
          disabled={na}
          onClick={() => onPatch(item.id, { status: done ? 'TODO' : 'DONE' })}
          className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
            done ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-brand-300 hover:border-primary-400'
          } disabled:opacity-40`}
        >
          {done && <Check className="w-3.5 h-3.5" />}
        </button>
        <div className="min-w-0">
          <p className={`text-sm leading-snug ${na ? 'text-brand-400 line-through' : done ? 'text-brand-500' : 'text-brand-900'}`}>
            {item.text}
          </p>
          <p className="text-[11px] text-brand-500 mt-0.5">
            {CATEGORY_META[item.category].label}
            {!item.mandatory && ' · optional'}
            {item.signOff && ' · needs a sign-off'}
            {na && ' · not applicable'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:w-[22rem] shrink-0 pl-8 sm:pl-0">
        <label className="relative flex-1 min-w-0">
          <span className="sr-only">Owner</span>
          <User className="w-3.5 h-3.5 text-brand-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            onBlur={commitOwner}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            list={ownersListId}
            maxLength={120}
            placeholder="Who? e.g. Ravi (JRF)"
            className="w-full bg-white border border-brand-200 rounded-md pl-8 pr-2 py-1.5 text-xs text-brand-900 placeholder:text-brand-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200"
          />
        </label>
        <div className="flex flex-col items-end shrink-0">
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={item.dueDate ?? ''}
              onChange={(e) => onPatch(item.id, e.target.value ? { dueDate: e.target.value } : { clearDueDate: true })}
              aria-label={`Due date for "${item.text}"`}
              className="bg-white border border-brand-200 rounded-md px-2 py-1 text-xs text-brand-900 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200"
            />
            {defaults.canReset && (
              <button
                type="button"
                onClick={() => onPatch(item.id, { dueDate: defaults.defaultDate! })}
                className="p-1 rounded-md text-brand-400 hover:text-brand-700 hover:bg-brand-100"
                title={`Reset to ${dueHint(defaults.defaultOffset)}`}
                aria-label={`Reset due date to ${dueHint(defaults.defaultOffset)}`}
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
          <span className={`text-[11px] mt-0.5 font-medium ${TONE_TEXT[due.tone]}`}>{due.label}</span>
        </div>
      </div>
    </li>
  );
}
