import { Trash2 } from 'lucide-react';
import type { Application, ApplicationStatus } from '../../services/applicationsService';
import type { SavedGrantEntry } from '../../services/savedGrantsService';
import { formatDay, toIso } from '../../utils/applicationDates';
import { DEADLINE_TEXT_CLASSES, formatRelativeDeadline, type DeadlineFormat } from '../../utils/formatDeadline';
import { DateLeaf, PanelCard, PanelNote } from '../common/PageLayout';
import { STATUS_META, STATUS_ORDER } from '../applications/applicationMeta';

const CLOSING_SHOWN = 5;

interface Row {
  entry: SavedGrantEntry;
  deadline: DeadlineFormat;
  /** The closing day (YYYY-MM-DD); null for rolling, call-based or undated grants. */
  day: string | null;
  application: Application | null;
}

/**
 * The Saved page's side panel, for choosing what to apply for next: what
 * closes soonest, how far the shortlist has got, and closed grants to clear.
 */
export default function SavedPanel({ entries, applicationByGrant, onOpen, onUnsave }: {
  entries: SavedGrantEntry[];
  applicationByGrant: Map<number, Application>;
  onOpen: (entry: SavedGrantEntry) => void;
  onUnsave: (entry: SavedGrantEntry) => void;
}) {
  const rows: Row[] = entries.map((entry) => ({
    entry,
    deadline: formatRelativeDeadline(entry.grant.deadlineRaw, entry.grant.deadlineType),
    day: deadlineDay(entry.grant.deadlineRaw),
    application: applicationByGrant.get(entry.grant.id) ?? null,
  }));
  return (
    <>
      <ClosingSoon rows={rows} onOpen={onOpen} />
      <WhereTheyStand rows={rows} />
      <Closed rows={rows.filter((r) => r.deadline.isClosed && r.application === null)} onOpen={onOpen} onUnsave={onUnsave} />
    </>
  );
}

/** The deadline's calendar day, or null when there's none or it can't be read. */
function deadlineDay(raw: string | undefined): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : toIso(parsed);
}

function ClosingSoon({ rows, onOpen }: { rows: Row[]; onOpen: (entry: SavedGrantEntry) => void }) {
  const dated = rows
    .flatMap((row) => (row.day !== null && !row.deadline.isClosed ? [{ ...row, day: row.day }] : []))
    .sort((a, b) => a.day.localeCompare(b.day));
  const openAllYear = rows.filter((r) => r.deadline.tone === 'open').length;
  const undated = rows.filter((r) => r.day === null && r.deadline.tone !== 'open').length;
  const others = [
    openAllYear > 0 && `${openAllYear} open all year`,
    undated > 0 && `${undated} with no date yet`,
  ].filter(Boolean).join(' · ');

  return (
    <PanelCard title="Closing soon" detail={dated.length > 0 ? String(dated.length) : undefined}>
      {dated.length === 0 ? (
        <PanelNote>None of your saved grants has a closing date ahead.</PanelNote>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {dated.slice(0, CLOSING_SHOWN).map(({ entry, deadline, day, application }) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onOpen(entry)}
                className="w-full text-left flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-brand-50 group"
              >
                <DateLeaf iso={day} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-brand-900 truncate group-hover:text-primary-700">{entry.grant.title}</span>
                  <span className="flex items-center gap-1.5 text-xs min-w-0">
                    <span className={`truncate ${DEADLINE_TEXT_CLASSES[deadline.tone]}`}>{deadline.label}</span>
                    {application && (
                      <span className="inline-flex items-center gap-1 text-brand-600 shrink-0" title="Application status">
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[application.status].dot}`} aria-hidden="true" />
                        {STATUS_META[application.status].label}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {dated.length > CLOSING_SHOWN && <p className="text-xs text-brand-500 mt-2">And {dated.length - CLOSING_SHOWN} more.</p>}
      {others && <p className="mt-3 pt-3 border-t border-brand-100 text-xs text-brand-500">Also saved: {others}.</p>}
    </PanelCard>
  );
}

/** How many saved grants have an application, and where those applications are. */
function WhereTheyStand({ rows }: { rows: Row[] }) {
  const notStarted = rows.filter((r) => r.application === null).length;
  const segments: { key: 'NONE' | ApplicationStatus; label: string; dot: string; n: number }[] = [
    { key: 'NONE', label: 'Not started', dot: 'bg-brand-300', n: notStarted },
    ...STATUS_ORDER.map((status) => ({
      key: status,
      label: STATUS_META[status].label,
      dot: STATUS_META[status].dot,
      n: rows.filter((r) => r.application?.status === status).length,
    })),
  ];
  const started = rows.length - notStarted;

  return (
    <PanelCard title="Where they stand" detail={`${rows.length} saved`}>
      <div className="flex h-2 rounded-full overflow-hidden bg-brand-100 gap-px" aria-hidden="true">
        {segments.filter((s) => s.n > 0).map((s) => (
          <span key={s.key} className={s.dot} style={{ width: `${(s.n / rows.length) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-1.5 text-xs">
        {segments.filter((s) => s.n > 0).map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-brand-700">
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
            <span className="ml-auto font-semibold tabular-nums text-brand-900">{s.n}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-brand-600">
        {started === 0
          ? "You haven't started an application for any of them yet."
          : `${started} of ${rows.length} have an application.`}
      </p>
    </PanelCard>
  );
}

/** Saved grants whose deadline has passed and that have no application. Hidden when there are none. */
function Closed({ rows, onOpen, onUnsave }: {
  rows: Row[];
  onOpen: (entry: SavedGrantEntry) => void;
  onUnsave: (entry: SavedGrantEntry) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <PanelCard title="Closed" detail={String(rows.length)}>
      <PanelNote>Their deadlines have passed. Remove them to keep the list short, or keep them for the next call.</PanelNote>
      <ul className="mt-2 -mx-2 flex flex-col">
        {rows.map(({ entry, day }) => (
          <li key={entry.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-brand-50">
            <button type="button" onClick={() => onOpen(entry)} className="min-w-0 flex-1 text-left group">
              <span className="block text-sm font-medium text-brand-900 truncate group-hover:text-primary-700">{entry.grant.title}</span>
              {day && <span className="block text-xs text-brand-500">Closed {formatDay(day)}</span>}
            </button>
            <button
              type="button"
              onClick={() => onUnsave(entry)}
              aria-label={`Remove ${entry.grant.title} from saved`}
              title="Remove from saved"
              className="p-1.5 rounded-md text-brand-400 hover:text-red-600 hover:bg-red-50 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}
