import { useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Award, ComplianceEvent } from '../../services/awardsService';
import { daysUntil, formatDay, todayIso, toIso } from '../../utils/applicationDates';
import { formatInr } from '../../utils/formatFunding';
import { PanelCard, PanelNote } from '../common/PageLayout';
import { DEADLINE_TONE_CLASS, deadlineStatus, timeUsed } from './awardMeta';

/** My grants' side panel: the deadline calendar and the funding held. */
export default function AwardsPanel({ awards, onOpen, onSync }: {
  awards: Award[];
  onOpen: (awardId: number) => void;
  onSync: () => void;
}) {
  return (
    <>
      <Deadlines awards={awards} onOpen={onOpen} onSync={onSync} />
      <FundingHeld awards={awards} onOpen={onOpen} />
    </>
  );
}

// ----------------------------------------------------------------------
// Deadlines: a month calendar over a list of what's due
// ----------------------------------------------------------------------

const DUE_SOON_DAYS = 30;
const LIST_SHOWN = 6;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface Due {
  award: Award;
  event: ComplianceEvent;
}

/**
 * Pending reporting deadlines (4.2) on a month calendar. Under it, the
 * deadlines overdue or due in the next 30 days; another month or a picked
 * day lists that month's or day's deadlines instead.
 */
function Deadlines({ awards, onOpen, onSync }: { awards: Award[]; onOpen: (awardId: number) => void; onSync: () => void }) {
  const today = todayIso();
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [day, setDay] = useState<string | null>(null);

  const pending: Due[] = awards
    .flatMap((award) => award.events.filter((event) => event.status === 'PENDING').map((event) => ({ award, event })))
    .sort((a, b) => a.event.dueDate.localeCompare(b.event.dueDate));
  const inMonth = pending.filter(({ event }) => event.dueDate.startsWith(month));
  const byDay = new Map<string, Due[]>();
  for (const due of inMonth) byDay.set(due.event.dueDate, [...(byDay.get(due.event.dueDate) ?? []), due]);

  const [y, m] = month.split('-').map(Number);
  const showMonth = (iso: string) => {
    setMonth(iso.slice(0, 7));
    setDay(null);
  };
  const shift = (delta: number) => showMonth(toIso(new Date(y, m - 1 + delta, 1)));

  // Monday-first weeks: blanks before the 1st, then the month's days.
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];

  const list = day !== null
    ? { heading: `Due on ${formatDay(day)}`, rows: byDay.get(day) ?? [] }
    : month === thisMonth
      ? { heading: `Due in the next ${DUE_SOON_DAYS} days`, rows: pending.filter(({ event }) => daysUntil(event.dueDate, today) <= DUE_SOON_DAYS) }
      : { heading: `Due in ${MONTH_NAMES[m - 1]}`, rows: inMonth };
  const overdue = list.rows.filter(({ event }) => event.dueDate < today).length;
  const next = pending.find(({ event }) => event.dueDate >= today) ?? null;

  return (
    <PanelCard
      title="Deadlines"
      detail={overdue > 0 ? <span className="font-semibold text-red-700">{overdue} overdue</span> : undefined}
      footer={
        <button type="button" onClick={onSync} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700">
          <CalendarPlus className="w-3.5 h-3.5" />
          Put these in Google Calendar
        </button>
      }
    >
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="p-1 rounded-md text-brand-500 hover:bg-brand-100 hover:text-brand-900">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-brand-900" aria-live="polite">{MONTH_NAMES[m - 1]} {y}</span>
        <button type="button" onClick={() => shift(1)} aria-label="Next month" className="p-1 rounded-md text-brand-500 hover:bg-brand-100 hover:text-brand-900">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-brand-400 mb-1" aria-hidden="true">
        {WEEKDAYS.map((w, i) => <span key={i}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((iso, i) => {
          if (iso === null) return <span key={`blank-${i}`} />;
          const dues = byDay.get(iso);
          const isToday = iso === today;
          const base = `h-9 flex flex-col items-center justify-center gap-0.5 rounded-md text-xs tabular-nums ${
            isToday ? 'ring-1 ring-inset ring-primary-500 font-bold text-primary-700' : iso < today ? 'text-brand-400' : 'text-brand-700'
          }`;
          const dayNo = Number(iso.slice(8));
          if (!dues) return <span key={iso} className={base}>{dayNo}</span>;
          const tone = DEADLINE_TONE_CLASS[deadlineStatus(iso, today).tone];
          const selected = iso === day;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => setDay(selected ? null : iso)}
              aria-pressed={selected}
              aria-label={`${formatDay(iso)}: ${dues.map(({ event }) => event.title).join(', ')}`}
              title={dues.map(({ award, event }) => `${event.title} (${award.projectTitle})`).join('\n')}
              className={`${base} font-semibold ${selected ? 'bg-brand-900 text-white' : 'bg-brand-50 hover:bg-primary-50'}`}
            >
              {dayNo}
              <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-brand-100">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <h3 className="text-xs font-semibold text-brand-700">{list.heading}</h3>
          {(day !== null || month !== thisMonth) && (
            <button type="button" onClick={() => showMonth(today)} className="text-xs font-semibold text-primary-600 hover:text-primary-700">
              Back to today
            </button>
          )}
        </div>
        {list.rows.length === 0 ? (
          <PanelNote>
            Nothing due.
            {next && day === null && (
              <>
                {' '}Next:{' '}
                <button type="button" onClick={() => showMonth(next.event.dueDate)} className="font-semibold text-primary-600 hover:text-primary-700">
                  {next.event.title}, {formatDay(next.event.dueDate)}
                </button>
              </>
            )}
          </PanelNote>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {list.rows.slice(0, LIST_SHOWN).map(({ award, event }) => {
              const status = deadlineStatus(event.dueDate, today);
              const tone = DEADLINE_TONE_CLASS[status.tone];
              return (
                <li key={event.id}>
                  <button type="button" onClick={() => onOpen(award.id)} className="w-full text-left px-2 py-2 rounded-md hover:bg-brand-50 flex items-start gap-2.5 group">
                    <span className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${tone.dot}`} aria-hidden="true" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-brand-900 group-hover:text-primary-700">{event.title}</span>
                      <span className="block text-xs text-brand-500 truncate">{award.projectTitle}</span>
                      <span className="block text-xs mt-0.5">
                        <span className="text-brand-600">{formatDay(event.dueDate)}</span>
                        <span className={`font-semibold ${tone.text}`}> · {status.label}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {list.rows.length > LIST_SHOWN && (
          <p className="text-xs text-brand-500 mt-1">And {list.rows.length - LIST_SHOWN} more. Open a grant to see all of its deadlines.</p>
        )}
      </div>
    </PanelCard>
  );
}

// ----------------------------------------------------------------------
// Funding held: the active grants' amounts and how far each project is
// ----------------------------------------------------------------------

const amountOf = (award: Award) => award.totalSanctioned ?? (award.allocatedTotal > 0 ? award.allocatedTotal : null);

function FundingHeld({ awards, onOpen }: { awards: Award[]; onOpen: (awardId: number) => void }) {
  const today = todayIso();
  const active = awards.filter((a) => a.status === 'ACTIVE');
  if (active.length === 0) return null;
  const amounts = active.map(amountOf).filter((n): n is number => n !== null);
  const total = amounts.reduce((sum, n) => sum + n, 0);

  return (
    <PanelCard title="Funding held" detail={`${active.length} active`}>
      <p className="text-2xl font-semibold tabular-nums leading-none text-brand-900">{amounts.length > 0 ? formatInr(total) : '–'}</p>
      <p className="mt-1.5 text-xs text-brand-500">
        {amounts.length === 0
          ? 'Add the sanctioned amounts to see a total'
          : amounts.length < active.length
            ? `Sanctioned for ${amounts.length} of your ${active.length} active grants`
            : 'Sanctioned across your active grants'}
      </p>
      <ul className="-mx-2 mt-3 flex flex-col">
        {active.map((award) => {
          const amount = amountOf(award);
          const time = timeUsed(award, today);
          return (
            <li key={award.id}>
              <button type="button" onClick={() => onOpen(award.id)} className="w-full text-left px-2 py-2 rounded-md hover:bg-brand-50 group">
                <span className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-medium text-brand-900 truncate group-hover:text-primary-700">{award.projectTitle}</span>
                  {amount !== null && <span className="shrink-0 font-semibold tabular-nums text-brand-700">{formatInr(amount, true)}</span>}
                </span>
                <span className="mt-1.5 block h-1.5 rounded-full bg-brand-100 overflow-hidden" aria-hidden="true">
                  <span className="block h-full rounded-full bg-primary-500" style={{ width: `${time.percent}%` }} />
                </span>
                <span className="mt-1 block text-[11px] text-brand-500 tabular-nums">{time.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </PanelCard>
  );
}
