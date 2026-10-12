import { ArrowRight, CheckCircle2, ChevronRight, Clock, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { Application } from '../../services/applicationsService';
import type { SavedGrantEntry } from '../../services/savedGrantsService';
import { daysUntil, deadlineCountdown, todayIso, TONE_TEXT } from '../../utils/applicationDates';
import { DEADLINE_TEXT_CLASSES, deadlineTime, formatRelativeDeadline } from '../../utils/formatDeadline';
import { DateLeaf, PanelCard, PanelNote } from '../common/PageLayout';
import { STATUS_META, STATUS_ORDER } from './applicationMeta';

const COMING_UP_SHOWN = 5;
const ATTENTION_SHOWN = 5;
const SAVED_SHOWN = 4;

/**
 * The Applications page's side panel: deadlines coming up, what needs
 * attention, saved grants not started yet, and results so far.
 */
export default function ApplicationsPanel({ applications, saved, onOpen, onSaved }: {
  applications: Application[];
  /** null while loading or when it couldn't be loaded; that card is left out then. */
  saved: SavedGrantEntry[] | null;
  onOpen: (applicationId: number) => void;
  onSaved: () => void;
}) {
  const preparing = applications.filter((a) => a.status === 'PREPARING');
  return (
    <>
      <ComingUp preparing={preparing} onOpen={onOpen} />
      {preparing.length > 0 && <NeedsAttention preparing={preparing} onOpen={onOpen} />}
      {saved && <SavedNotStarted saved={saved} applications={applications} onSaved={onSaved} />}
      <Results applications={applications} />
    </>
  );
}

function ComingUp({ preparing, onOpen }: { preparing: Application[]; onOpen: (id: number) => void }) {
  const today = todayIso();
  const upcoming = preparing
    .flatMap((a) => (a.deadline !== null && a.deadline >= today ? [{ application: a, deadline: a.deadline }] : []))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));

  return (
    <PanelCard
      title="Coming up"
      detail={upcoming.length > 0 ? `${upcoming.length} ${upcoming.length === 1 ? 'deadline' : 'deadlines'}` : undefined}
    >
      {upcoming.length === 0 ? (
        <PanelNote>
          {preparing.length === 0 ? 'Nothing in preparation right now.' : 'None of your applications in preparation has a deadline ahead.'}
        </PanelNote>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {upcoming.slice(0, COMING_UP_SHOWN).map(({ application, deadline }) => {
            const countdown = deadlineCountdown(deadline);
            return (
              <li key={application.id}>
                <button
                  type="button"
                  onClick={() => onOpen(application.id)}
                  className="w-full text-left flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-brand-50 group"
                >
                  <DateLeaf iso={deadline} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-brand-900 truncate group-hover:text-primary-700">{application.title}</span>
                    <span className={`block text-xs font-semibold ${TONE_TEXT[countdown.tone]}`}>{countdown.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {upcoming.length > COMING_UP_SHOWN && (
        <p className="text-xs text-brand-500 mt-2">And {upcoming.length - COMING_UP_SHOWN} more.</p>
      )}
    </PanelCard>
  );
}

type AttentionTone = 'critical' | 'warning' | 'neutral';

const ATTENTION_META: Record<AttentionTone, { icon: LucideIcon; text: string; rank: number }> = {
  critical: { icon: TriangleAlert, text: 'text-red-700', rank: 0 },
  warning: { icon: Clock, text: 'text-amber-800', rank: 1 },
  neutral: { icon: ArrowRight, text: 'text-brand-600', rank: 2 },
};

/** The most urgent thing about an application in preparation; null when it's on track. */
function attentionFor(application: Application, today: string): { text: string; tone: AttentionTone } | null {
  const { percent, overdue, mandatoryDone, mandatoryTotal } = application.readiness;
  const days = application.deadline ? daysUntil(application.deadline, today) : null;
  if (days !== null && days < 0) return { text: 'Deadline passed. Update its status', tone: 'critical' };
  if (overdue > 0) return { text: `${overdue} checklist ${overdue === 1 ? 'item' : 'items'} overdue`, tone: 'critical' };
  if (percent === null) return { text: "No checklist yet. Upload the call's guidelines", tone: 'neutral' };
  if (days !== null && days <= 14 && percent < 100) {
    return { text: `${percent}% ready, ${days === 0 ? 'due today' : `${days} ${days === 1 ? 'day' : 'days'} left`}`, tone: 'warning' };
  }
  if (mandatoryDone === 0) return { text: `Not started: 0 of ${mandatoryTotal} required items done`, tone: 'neutral' };
  return null;
}

function NeedsAttention({ preparing, onOpen }: { preparing: Application[]; onOpen: (id: number) => void }) {
  const today = todayIso();
  const rows = preparing
    .flatMap((application) => {
      const issue = attentionFor(application, today);
      return issue ? [{ application, ...issue }] : [];
    })
    .sort((a, b) =>
      ATTENTION_META[a.tone].rank - ATTENTION_META[b.tone].rank
      || (a.application.deadline ?? '9999-12-31').localeCompare(b.application.deadline ?? '9999-12-31'));

  return (
    <PanelCard title="Needs attention" detail={rows.length > 0 ? String(rows.length) : undefined}>
      {rows.length === 0 ? (
        <p className="flex items-start gap-2 text-xs text-primary-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Nothing needs attention. Your applications are on track.</span>
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {rows.slice(0, ATTENTION_SHOWN).map(({ application, text, tone }) => {
            const meta = ATTENTION_META[tone];
            const Icon = meta.icon;
            return (
              <li key={application.id}>
                <button
                  type="button"
                  onClick={() => onOpen(application.id)}
                  className="w-full text-left flex items-start gap-2.5 px-2 py-2 rounded-md hover:bg-brand-50 group"
                >
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.text}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-medium ${meta.text}`}>{text}</span>
                    <span className="block text-xs text-brand-500 truncate group-hover:text-primary-700">{application.title}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </PanelCard>
  );
}

/** Saved grants with no application yet that are still open, closing soonest first. */
function SavedNotStarted({ saved, applications, onSaved }: {
  saved: SavedGrantEntry[];
  applications: Application[];
  onSaved: () => void;
}) {
  const started = new Set(applications.flatMap((a) => (a.grantId === null ? [] : [a.grantId])));
  const rows = saved
    .filter((entry) => !started.has(entry.grant.id))
    .map((entry) => {
      const closes = deadlineTime(entry.grant.deadlineRaw);
      return {
        entry,
        deadline: formatRelativeDeadline(entry.grant.deadlineRaw, entry.grant.deadlineType),
        closes: Number.isNaN(closes) ? Infinity : closes,
      };
    })
    .filter((row) => !row.deadline.isClosed)
    .sort((a, b) => a.closes - b.closes);
  if (rows.length === 0) return null;

  return (
    <PanelCard
      title="Saved, not started"
      detail={String(rows.length)}
      footer={
        <button type="button" onClick={onSaved} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
          Start one from Saved
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      }
    >
      <ul className="flex flex-col gap-3">
        {rows.slice(0, SAVED_SHOWN).map(({ entry, deadline }) => (
          <li key={entry.id} className="min-w-0">
            <p className="text-sm font-medium text-brand-900 line-clamp-2">{entry.grant.title}</p>
            <p className="mt-0.5 text-xs text-brand-500 truncate">
              {entry.grant.funder}
              {' · '}
              <span className={DEADLINE_TEXT_CLASSES[deadline.tone]} title={deadline.tooltip || undefined}>{deadline.label}</span>
            </p>
          </li>
        ))}
      </ul>
      {rows.length > SAVED_SHOWN && <p className="text-xs text-brand-500 mt-2">And {rows.length - SAVED_SHOWN} more.</p>}
    </PanelCard>
  );
}

/** How the applications sent so far turned out. Hidden until one is sent. */
function Results({ applications }: { applications: Application[] }) {
  const counts = STATUS_ORDER.map((status) => ({ status, n: applications.filter((a) => a.status === status).length }));
  const count = (status: Application['status']) => counts.find((c) => c.status === status)?.n ?? 0;
  if (applications.length === count('PREPARING')) return null;
  const awarded = count('AWARDED');
  const decided = awarded + count('NOT_FUNDED');

  return (
    <PanelCard title="Results so far" detail={`${applications.length} in total`}>
      <div className="flex h-2 rounded-full overflow-hidden bg-brand-100 gap-px" aria-hidden="true">
        {counts.filter((c) => c.n > 0).map((c) => (
          <span key={c.status} className={STATUS_META[c.status].dot} style={{ width: `${(c.n / applications.length) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {counts.map((c) => (
          <li key={c.status} className="flex items-center gap-1.5 text-brand-700">
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[c.status].dot}`} />
            {STATUS_META[c.status].label}
            <span className="ml-auto font-semibold tabular-nums text-brand-900">{c.n}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-brand-600">
        {decided === 0
          ? 'No decisions yet.'
          : `${awarded} of ${decided} decided ${decided === 1 ? 'application' : 'applications'} funded (${Math.round((awarded / decided) * 100)}%).`}
      </p>
    </PanelCard>
  );
}
