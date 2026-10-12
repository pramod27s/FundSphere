import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'react-hot-toast';
import { Check, ChevronDown, ExternalLink, Info, Loader2, Minus, Plus, RotateCcw, Sparkles } from 'lucide-react';
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
import { DEADLINE_TONE_CLASS, deadlineStatus, PROFILE_RULES_NAME } from './awardMeta';

interface ComplianceCalendarProps {
  award: Award;
  onAward: (award: Award) => void;
  /** Opens the progress-report draft dialog for a report deadline (4.4). */
  onDraftReport?: (eventId: number) => void;
}

const INPUT =
  'bg-white border border-brand-200 rounded-lg px-2.5 py-1.5 text-sm text-brand-900 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200';
const LINK = 'text-xs font-semibold text-primary-700 hover:text-primary-800 disabled:opacity-50';

/**
 * 4.2: the grant's reporting deadlines, worked out from its dates and its
 * agency's rules, with what to do about each. Overdue first, then the next
 * 30 days, then later; submitted and not-applicable ones fold away.
 */
export default function ComplianceCalendar({ award, onAward, onDraftReport }: ComplianceCalendarProps) {
  const [busyId, setBusyId] = useState<number | 'past' | 'new' | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);

  const today = todayIso();
  const addedOn = award.createdAt.slice(0, 10);
  const pending = award.events.filter((e) => e.status === 'PENDING');
  const done = award.events.filter((e) => e.status !== 'PENDING');
  const overdue = pending.filter((e) => e.dueDate < today);
  const soon = pending.filter((e) => e.dueDate >= today && deadlineStatus(e.dueDate, today).tone !== 'green');
  const later = pending.filter((e) => deadlineStatus(e.dueDate, today).tone === 'green');
  const fromBeforeAdding = pending.filter((e) => e.dueDate < addedOn);

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
          <Group title="Later" count={later.length}>{later.map(row)}</Group>
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

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-500 mb-1">
        {title} <span className="tabular-nums">({count})</span>
      </h3>
      <ul className="flex flex-col divide-y divide-brand-100">{children}</ul>
    </div>
  );
}

function EventRow({
  event,
  portalUrl,
  busy,
  today,
  onChange,
  onDelete,
  onDraft,
}: {
  event: ComplianceEvent;
  portalUrl: string | null;
  busy: boolean;
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
    <li className={`py-3 ${pending ? '' : 'opacity-70'}`}>
      <div className="flex items-start gap-3">
        <span className="mt-1 shrink-0" aria-hidden="true">
          {event.status === 'SUBMITTED' ? (
            <Check className="w-4 h-4 text-primary-600" />
          ) : event.status === 'NOT_APPLICABLE' ? (
            <Minus className="w-4 h-4 text-brand-400" />
          ) : (
            <span className={`block w-2.5 h-2.5 mt-0.5 rounded-full ${tone.dot}`} />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium text-brand-900 ${event.status === 'NOT_APPLICABLE' ? 'line-through' : ''}`}>
            {event.title}
          </p>
          {showPeriod && (
            <p className="text-xs text-brand-500">
              For {formatDay(event.periodStart!)} – {formatDay(event.periodEnd!)}
            </p>
          )}
          <p className="text-xs mt-0.5">
            {pending ? (
              <>
                <span className="text-brand-700">Due {formatDay(event.dueDate)}</span>
                <span className={`font-semibold ${tone.text}`}> · {status.label}</span>
                {event.dueDateEdited && <span className="text-brand-500"> · date moved by you</span>}
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
          {pending && event.type === 'UC_SE' && (
            <p className="text-xs text-brand-500 mt-0.5">The next instalment usually waits on this.</p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
            {pending && onDraft && (
              <button type="button" className={`${LINK} inline-flex items-center gap-1`} onClick={onDraft}>
                <Sparkles className="w-3 h-3" />
                Draft this report
              </button>
            )}
            {pending ? (
              <>
                <button type="button" className={LINK} disabled={busy} onClick={() => { setDate(today); setMode('submit'); }}>
                  Mark submitted
                </button>
                <button type="button" className={LINK} disabled={busy} onClick={() => { setDate(event.dueDate); setMode('move'); }}>
                  Change date
                </button>
                {event.dueDateEdited && (
                  <button
                    type="button"
                    className={`${LINK} inline-flex items-center gap-1`}
                    disabled={busy}
                    onClick={() => onChange({ resetDueDate: true }, 'Date put back')}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Put date back
                  </button>
                )}
                <button
                  type="button"
                  className={LINK}
                  disabled={busy}
                  onClick={() => onChange({ status: 'NOT_APPLICABLE' }, 'Marked not applicable')}
                >
                  Not applicable
                </button>
              </>
            ) : (
              <button type="button" className={LINK} disabled={busy} onClick={() => onChange({ status: 'PENDING' }, 'Back to pending')}>
                Undo
              </button>
            )}
            {event.basis && (
              <button
                type="button"
                className={`${LINK} inline-flex items-center gap-1`}
                aria-expanded={mode === 'why'}
                onClick={() => setMode(mode === 'why' ? 'idle' : 'why')}
              >
                <Info className="w-3 h-3" />
                Why this date?
              </button>
            )}
            {event.origin === 'MANUAL' && (
              <button
                type="button"
                className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Remove "${event.title}"?`)) onDelete();
                }}
              >
                Remove
              </button>
            )}
            {pending && portalUrl && (
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${LINK} inline-flex items-center gap-1`}
              >
                Open portal
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" aria-label="Saving" />}
          </div>

          {mode === 'why' && event.basis && (
            <p className="mt-2 text-xs text-brand-700 bg-brand-50 border border-brand-200 rounded-md px-2.5 py-2">{event.basis}</p>
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
      </div>
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
