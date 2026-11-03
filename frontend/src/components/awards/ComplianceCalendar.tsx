import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'react-hot-toast';
import { Check, ChevronDown, Info, Loader2, Minus, Plus, RotateCcw, Sparkles } from 'lucide-react';
import MoreActions from '../common/MoreActions';
import DeadlineTimeline from './DeadlineTimeline';
import {
  addAwardEvent,
  deleteAwardEvent,
  submitPastAwardEvents,
  updateAwardEvent,
  type Award,
  type ComplianceEvent,
  type ComplianceEventChanges,
} from '../../services/awardsService';
import { formatDay, todayIso } from '../../utils/applicationDates';
import { ROW_ACTION } from '../common/buttonStyles';
import { DEADLINE_TONE_CLASS, deadlineStatus, PROFILE_RULES_NAME } from './awardMeta';

interface ComplianceCalendarProps {
  award: Award;
  onAward: (award: Award) => void;
  /** Opens the progress-report draft dialog for a report deadline (4.4). */
  onDraftReport?: (eventId: number) => void;
}

/** Later deadlines shown before "Show more"; the overdue and next-30-days ones always show. */
const LATER_SHOWN = 4;

/** How long a row stays highlighted after a timeline dot jumps to it. */
const HIGHLIGHT_MS = 1800;

/** Later deadlines by the calendar year they're due in, in date order. */
function byYear(events: ComplianceEvent[]): [string, ComplianceEvent[]][] {
  const groups = new Map<string, ComplianceEvent[]>();
  for (const event of events) {
    const year = event.dueDate.slice(0, 4);
    groups.set(year, [...(groups.get(year) ?? []), event]);
  }
  return [...groups];
}

const INPUT =
  'bg-white border border-brand-200 rounded-lg px-2.5 py-1.5 text-sm text-brand-900 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200';

/**
 * 4.2: the grant's reporting deadlines, worked out from its dates and its
 * agency's rules, with what to do about each. Overdue first, then the next
 * 30 days, then later; submitted and not-applicable ones fold away.
 */
export default function ComplianceCalendar({ award, onAward, onDraftReport }: ComplianceCalendarProps) {
  const [busyId, setBusyId] = useState<number | 'past' | 'new' | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [showAllLater, setShowAllLater] = useState(false);
  const [adding, setAdding] = useState(false);
  /** The row a timeline dot asked for; `n` lets the same dot be clicked again. */
  const [jump, setJump] = useState<{ id: number; n: number } | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const today = todayIso();
  const addedOn = award.createdAt.slice(0, 10);
  const pending = award.events
    .filter((e) => e.status === 'PENDING')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const done = award.events.filter((e) => e.status !== 'PENDING');
  const overdue = pending.filter((e) => e.dueDate < today);
  const soon = pending.filter((e) => e.dueDate >= today && deadlineStatus(e.dueDate, today).tone !== 'green');
  const later = pending.filter((e) => deadlineStatus(e.dueDate, today).tone === 'green');
  const fromBeforeAdding = pending.filter((e) => e.dueDate < addedOn);
  const laterShown = showAllLater ? later : later.slice(0, LATER_SHOWN);

  // A timeline dot: open whatever folds its row away, then scroll to the row and light it briefly.
  const jumpTo = (id: number) => {
    const event = award.events.find((e) => e.id === id);
    if (!event) return;
    if (event.status !== 'PENDING') setShowDone(true);
    else if (later.findIndex((e) => e.id === id) >= LATER_SHOWN) setShowAllLater(true);
    setJump((current) => ({ id, n: (current?.n ?? 0) + 1 }));
  };

  useEffect(() => {
    if (!jump) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`deadline-${jump.id}`)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      setHighlightId(jump.id);
    });
    const timer = window.setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [jump]);

  const run = async (id: number | 'past' | 'new', action: () => Promise<Award>, success?: string) => {
    setBusyId(id);
    try {
      onAward(await action());
      if (success) toast.success(success);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const change = (event: ComplianceEvent, changes: ComplianceEventChanges, success?: string) =>
    run(event.id, () => updateAwardEvent(award.id, event.id, changes), success);

  const row = (event: ComplianceEvent) => (
    <EventRow
      key={event.id}
      event={event}
      portalUrl={award.portalUrl}
      busy={busyId === event.id}
      highlighted={highlightId === event.id}
      today={today}
      onChange={(changes, success) => change(event, changes, success)}
      onDelete={() => run(event.id, () => deleteAwardEvent(award.id, event.id), 'Deadline removed')}
      onDraft={
        onDraftReport && (event.type === 'PROGRESS_REPORT' || event.type === 'FINAL_REPORT')
          ? () => onDraftReport(event.id)
          : undefined
      }
    />
  );

  return (
    <section className="bg-white border border-brand-200 rounded-xl p-5 sm:p-6 shadow-xs mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-brand-900 tracking-tight">Reporting deadlines</h2>
          <p className="text-xs text-brand-500 mt-0.5">
            Worked out from the project dates using {PROFILE_RULES_NAME[award.reportingProfile]} rules.
            Your sanction order wins: move any date, or mark it not applicable.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-800 bg-white border border-brand-300 hover:bg-brand-50 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Add a deadline
        </button>
      </div>

      <DeadlineTimeline award={award} today={today} onJump={jumpTo} />

      {fromBeforeAdding.length > 0 && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="flex-1 text-sm text-amber-900">
            {fromBeforeAdding.length} {fromBeforeAdding.length === 1 ? 'deadline' : 'deadlines'} passed before you added
            this grant on {formatDay(addedOn)}. If you've already submitted them, mark them all at once.
          </p>
          <button
            type="button"
            disabled={busyId === 'past'}
            onClick={() => run('past', () => submitPastAwardEvents(award.id), 'Earlier deadlines marked submitted')}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 shrink-0"
          >
            {busyId === 'past' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Mark them all submitted
          </button>
        </div>
      )}

      {adding && (
        <AddDeadlineForm
          busy={busyId === 'new'}
          onCancel={() => setAdding(false)}
          onAdd={async (title, dueDate) => {
            const ok = await run('new', () => addAwardEvent(award.id, { title, dueDate }), 'Deadline added');
            if (ok) setAdding(false);
          }}
        />
      )}

      {award.events.length === 0 ? (
        <p className="text-sm text-brand-600">No deadlines yet. Check the project's start and end dates.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <Group title="Overdue" count={overdue.length}>{overdue.map(row)}</Group>
          <Group title="Next 30 days" count={soon.length}>{soon.map(row)}</Group>
          {later.length > 0 && (
            <div>
              <GroupHeading title="Later" count={later.length} />
              {byYear(laterShown).map(([year, events]) => (
                <div key={year} className="mt-2 first-of-type:mt-0">
                  <h4 className="text-[11px] font-semibold text-brand-400 tabular-nums">Due in {year}</h4>
                  <ul className="flex flex-col divide-y divide-brand-100">{events.map(row)}</ul>
                </div>
              ))}
              {later.length > LATER_SHOWN && (
                <button
                  type="button"
                  onClick={() => setShowAllLater((v) => !v)}
                  aria-expanded={showAllLater}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllLater ? 'rotate-180' : ''}`} />
                  {showAllLater ? 'Show fewer' : `Show ${later.length - LATER_SHOWN} more`}
                </button>
              )}
            </div>
          )}
          {pending.length === 0 && (
            <p className="text-sm text-brand-600">Nothing pending. Every deadline is submitted or not applicable.</p>
          )}
          {done.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-900"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDone ? 'rotate-180' : ''}`} />
                Done or not applicable ({done.length})
              </button>
              {showDone && <ul className="mt-2 flex flex-col divide-y divide-brand-100">{done.map(row)}</ul>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function GroupHeading({ title, count }: { title: string; count: number }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-500 mb-1">
      {title} <span className="tabular-nums">({count})</span>
    </h3>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div>
      <GroupHeading title={title} count={count} />
      <ul className="flex flex-col divide-y divide-brand-100">{children}</ul>
    </div>
  );
}

function EventRow({
  event,
  portalUrl,
  busy,
  highlighted,
  today,
  onChange,
  onDelete,
  onDraft,
}: {
  event: ComplianceEvent;
  portalUrl: string | null;
  busy: boolean;
  /** Briefly lit after a timeline dot jumps here. */
  highlighted: boolean;
  today: string;
  onChange: (changes: ComplianceEventChanges, success?: string) => Promise<boolean>;
  onDelete: () => void;
  /** Set on report deadlines: open the draft dialog for this report. */
  onDraft?: () => void;
}) {
  const formId = useId();
  const [mode, setMode] = useState<'idle' | 'submit' | 'move' | 'why'>('idle');
  const [date, setDate] = useState(today);
  const pending = event.status === 'PENDING';
  const status = deadlineStatus(event.dueDate, today);
  const tone = DEADLINE_TONE_CLASS[status.tone];
  const showPeriod = event.periodStart && event.periodEnd && (event.type === 'UC_SE' || event.type === 'PROGRESS_REPORT');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const ok = mode === 'submit'
      ? await onChange({ status: 'SUBMITTED', submittedOn: date }, 'Marked submitted')
      : await onChange({ dueDate: date }, 'Date moved');
    if (ok) setMode('idle');
  };

  return (
    <li
      id={`deadline-${event.id}`}
      className={`scroll-mt-28 -mx-2 px-2 py-2.5 rounded-lg transition-colors duration-500 ${highlighted ? 'bg-primary-50' : ''} ${
        pending ? '' : 'opacity-70'
      }`}
    >
      {/* Text on the left, actions on the right; on a narrow screen the actions wrap underneath. */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className="mt-1 shrink-0" aria-hidden="true">
          {event.status === 'SUBMITTED' ? (
            <Check className="w-4 h-4 text-primary-600" />
          ) : event.status === 'NOT_APPLICABLE' ? (
            <Minus className="w-4 h-4 text-brand-400" />
          ) : (
            <span className={`block w-2.5 h-2.5 mt-0.5 rounded-full ${tone.dot}`} />
          )}
        </span>
        <div className="flex-1 min-w-[12rem]">
          <p className={`text-sm font-medium text-brand-900 ${event.status === 'NOT_APPLICABLE' ? 'line-through' : ''}`}>
            {event.title}
            {showPeriod && (
              <span className="font-normal text-brand-500"> · {formatDay(event.periodStart!)} – {formatDay(event.periodEnd!)}</span>
            )}
          </p>
          <p className="text-xs mt-0.5">
            {pending ? (
              <>
                <span className="text-brand-700">Due {formatDay(event.dueDate)}</span>
                <span className={`font-semibold ${tone.text}`}> · {status.label}</span>
                {event.dueDateEdited && <span className="text-brand-500"> · date moved by you</span>}
                {event.type === 'UC_SE' && <span className="text-brand-500"> · the next instalment usually waits on this</span>}
              </>
            ) : event.status === 'SUBMITTED' ? (
              <span className="text-brand-600">
                {event.submittedOn ? `Submitted ${formatDay(event.submittedOn)}` : 'Marked submitted (date not recorded)'}
                {' · '}was due {formatDay(event.dueDate)}
              </span>
            ) : (
              <span className="text-brand-600">Not applicable · was due {formatDay(event.dueDate)}</span>
            )}
          </p>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" aria-label="Saving" />}
          {pending && onDraft && (
            <button type="button" className={ROW_ACTION.primary} onClick={onDraft}>
              <Sparkles className="w-3.5 h-3.5" />
              Draft this report
            </button>
          )}
          {pending ? (
            <button type="button" className={ROW_ACTION.emphasis} disabled={busy} onClick={() => { setDate(today); setMode('submit'); }}>
              <Check className="w-3.5 h-3.5" />
              Mark submitted
            </button>
          ) : (
            <button type="button" className={ROW_ACTION.secondary} disabled={busy} onClick={() => onChange({ status: 'PENDING' }, 'Back to pending')}>
              <RotateCcw className="w-3.5 h-3.5" />
              Undo
            </button>
          )}
          {/* The less common actions, including "Why this date?" and the portal link. */}
          <MoreActions
            label={`More actions for ${event.title}`}
            disabled={busy}
            items={[
              ...(event.basis
                ? [{ label: mode === 'why' ? 'Hide why this date' : 'Why this date?', onSelect: () => setMode(mode === 'why' ? 'idle' : 'why') }]
                : []),
              ...(pending && portalUrl
                ? [{ label: 'Open portal (new tab)', onSelect: () => void window.open(portalUrl, '_blank', 'noopener,noreferrer') }]
                : []),
              ...(pending
                ? [
                    { label: 'Change date', onSelect: () => { setDate(event.dueDate); setMode('move'); } },
                    ...(event.dueDateEdited
                      ? [{ label: 'Put date back', onSelect: () => void onChange({ resetDueDate: true }, 'Date put back') }]
                      : []),
                    { label: 'Not applicable', onSelect: () => void onChange({ status: 'NOT_APPLICABLE' }, 'Marked not applicable') },
                  ]
                : []),
              ...(event.origin === 'MANUAL'
                ? [{
                    label: 'Remove',
                    danger: true,
                    onSelect: () => {
                      if (window.confirm(`Remove "${event.title}"?`)) onDelete();
                    },
                  }]
                : []),
            ]}
          />
        </div>
      </div>

      {/* Under the text, lined up with it past the status dot. */}
      {(mode !== 'idle') && (
        <div className="pl-7">
          {mode === 'why' && event.basis && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-brand-700 bg-brand-50 border border-brand-200 rounded-md px-2.5 py-2">
              <Info className="w-3.5 h-3.5 mt-px shrink-0 text-brand-400" aria-hidden="true" />
              {event.basis}
            </p>
          )}
          {(mode === 'submit' || mode === 'move') && (
            <form onSubmit={save} className="mt-2 flex flex-wrap items-center gap-2">
              <label htmlFor={`${formId}-date`} className="text-xs font-semibold text-brand-700">
                {mode === 'submit' ? 'Submitted on' : 'New due date'}
              </label>
              <input
                id={`${formId}-date`}
                type="date"
                className={INPUT}
                value={date}
                max={mode === 'submit' ? today : undefined}
                onChange={(e) => setDate(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={busy || !date}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
              >
                Save
              </button>
              <button type="button" onClick={() => setMode('idle')} className="px-2 py-1.5 text-xs font-medium text-brand-600 hover:text-brand-900">
                Cancel
              </button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}


function AddDeadlineForm({
  busy,
  onAdd,
  onCancel,
}: {
  busy: boolean;
  onAdd: (title: string, dueDate: string) => void;
  onCancel: () => void;
}) {
  const formId = useId();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) {
      toast.error('Give the deadline a name and a date');
      return;
    }
    onAdd(title.trim(), dueDate);
  };

  return (
    <form onSubmit={submit} className="mb-4 rounded-lg border border-brand-200 bg-brand-50 p-3 flex flex-col sm:flex-row sm:items-end gap-3">
      <div className="flex-1">
        <label htmlFor={`${formId}-title`} className="block text-xs font-semibold text-brand-700 mb-1">What's due</label>
        <input
          id={`${formId}-title`}
          className={`${INPUT} w-full`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Mid-term review presentation, Milestone 2 report"
          maxLength={300}
          autoFocus
        />
      </div>
      <div>
        <label htmlFor={`${formId}-date`} className="block text-xs font-semibold text-brand-700 mb-1">Due date</label>
        <input id={`${formId}-date`} type="date" className={INPUT} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Add
        </button>
        <button type="button" onClick={onCancel} className="px-2 py-1.5 text-xs font-medium text-brand-600 hover:text-brand-900">
          Cancel
        </button>
      </div>
    </form>
  );
}
