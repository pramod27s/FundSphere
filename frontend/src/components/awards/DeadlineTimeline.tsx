import { Check, Minus } from 'lucide-react';
import type { Award, ComplianceEvent } from '../../services/awardsService';
import { daysUntil, formatDay, toIso } from '../../utils/applicationDates';
import { deadlineStatus } from './awardMeta';

/** Dots closer than this (a share of the bar, in %) stack into a lane above the bar. */
const MIN_GAP = 2.4;
const MAX_LANES = 4;
const LANE_HEIGHT = 18;
/** Room above the lanes for the "Today" label, in px. */
const TODAY_ROW = 18;

type DotKind = 'overdue' | 'soon' | 'later' | 'submitted' | 'na';

/** Status colours, each named in the legend so no dot relies on colour alone. */
const DOT: Record<DotKind, { className: string; label: string }> = {
  overdue: { className: 'bg-red-500', label: 'Overdue or due within 7 days' },
  soon: { className: 'bg-amber-500', label: 'Due within 30 days' },
  later: { className: 'bg-white border-2 border-primary-500', label: 'Later' },
  submitted: { className: 'bg-primary-600 text-white', label: 'Submitted' },
  na: { className: 'bg-brand-200 text-brand-500', label: 'Not applicable' },
};
const KIND_ORDER: DotKind[] = ['overdue', 'soon', 'later', 'submitted', 'na'];

function kindOf(event: ComplianceEvent, today: string): DotKind {
  if (event.status === 'SUBMITTED') return 'submitted';
  if (event.status === 'NOT_APPLICABLE') return 'na';
  const tone = deadlineStatus(event.dueDate, today).tone;
  return tone === 'red' ? 'overdue' : tone === 'amber' ? 'soon' : 'later';
}

function statusText(event: ComplianceEvent, today: string): string {
  if (event.status === 'SUBMITTED') {
    return event.submittedOn ? `Submitted ${formatDay(event.submittedOn)}` : 'Submitted';
  }
  if (event.status === 'NOT_APPLICABLE') return `Not applicable · was due ${formatDay(event.dueDate)}`;
  return `Due ${formatDay(event.dueDate)} · ${deadlineStatus(event.dueDate, today).label}`;
}

function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toIso(new Date(y + years, m - 1, d));
}

/** A label pinned at x% that stays inside the strip near either end. */
function edgeShift(x: number): string {
  return x < 12 ? '0' : x > 88 ? '-100%' : '-50%';
}

/**
 * The whole project on one bar: start to end with its years marked, how much
 * time has gone, today, and a dot for every reporting deadline in its status
 * colour. A dot jumps to its row in the list below, which stays the full,
 * readable record of the same dates.
 */
export default function DeadlineTimeline({
  award,
  today,
  onJump,
}: {
  award: Award;
  today: string;
  onJump: (eventId: number) => void;
}) {
  const { startDate, endDate, events } = award;
  const dates = events.map((e) => e.dueDate);
  const first = [startDate, ...dates].sort()[0];
  const last = [endDate, ...dates].sort().at(-1) ?? endDate;
  const span = Math.max(1, daysUntil(last, first));
  const pct = (iso: string) => Math.min(100, Math.max(0, (daysUntil(iso, first) / span) * 100));

  // Dots that would touch stack upward, each lane one step higher.
  const laneEnds: number[] = [];
  const dots = [...events]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((event) => {
      const x = pct(event.dueDate);
      let lane = laneEnds.findIndex((end) => x - end >= MIN_GAP);
      if (lane === -1) {
        lane = Math.min(laneEnds.length, MAX_LANES - 1);
        if (laneEnds.length < MAX_LANES) laneEnds.push(x);
      }
      laneEnds[lane] = x;
      return { event, x, lane, kind: kindOf(event, today) };
    });
  const lanes = Math.max(1, laneEnds.length);

  // Project years: a tick at each anniversary, "Year n" centred in each.
  const anniversaries: string[] = [];
  for (let k = 1; k < 50; k += 1) {
    const iso = addYears(startDate, k);
    if (iso >= endDate) break;
    anniversaries.push(iso);
  }
  const bounds = [startDate, ...anniversaries, endDate];
  const years = bounds.slice(0, -1).map((from, i) => ({ n: i + 1, mid: (pct(from) + pct(bounds[i + 1])) / 2 }));

  const startX = pct(startDate);
  const endX = pct(endDate);
  const todayX = pct(today);
  const showToday = today >= first && today <= last;
  const elapsedTo = Math.min(Math.max(todayX, startX), endX);

  const barY = TODAY_ROW + (lanes - 1) * LANE_HEIGHT + 12;
  const height = barY + 46;
  const submitted = events.filter((e) => e.status === 'SUBMITTED').length;
  const kinds = KIND_ORDER.filter((kind) => dots.some((dot) => dot.kind === kind));

  return (
    <div className="mb-5 rounded-xl border border-brand-200 bg-brand-50 px-4 pt-3.5 pb-3 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-brand-700">Project timeline</h3>
        {events.length > 0 && (
          <p className="text-xs text-brand-500">
            {submitted} of {events.length} deadlines submitted
          </p>
        )}
      </div>

      <div className="relative mt-2" style={{ height }} role="group" aria-label="Project timeline. Each deadline opens its row in the list below.">
        {/* The project, then a thin line on to any deadlines after it ends (or before it starts). */}
        {startX > 0 && <span className="absolute h-px bg-brand-300" style={{ left: 0, width: `${startX}%`, top: barY }} aria-hidden="true" />}
        {endX < 100 && <span className="absolute h-px bg-brand-300" style={{ left: `${endX}%`, right: 0, top: barY }} aria-hidden="true" />}
        <span className="absolute h-1.5 rounded-full bg-brand-200" style={{ left: `${startX}%`, width: `${endX - startX}%`, top: barY - 3 }} aria-hidden="true" />
        {elapsedTo > startX && (
          <span className="absolute h-1.5 rounded-full bg-primary-300" style={{ left: `${startX}%`, width: `${elapsedTo - startX}%`, top: barY - 3 }} aria-hidden="true" />
        )}
        {anniversaries.map((iso) => (
          <span key={iso} className="absolute h-3 w-px bg-brand-400" style={{ left: `${pct(iso)}%`, top: barY - 6 }} aria-hidden="true" />
        ))}

        {showToday && (
          <>
            <span
              className="absolute w-0.5 rounded-full bg-brand-800 ring-2 ring-brand-50"
              style={{ left: `calc(${todayX}% - 1px)`, top: TODAY_ROW - 2, height: barY + 9 - TODAY_ROW }}
              aria-hidden="true"
            />
            <span
              className="absolute top-0 whitespace-nowrap text-[11px] font-semibold text-brand-700"
              style={{ left: `${todayX}%`, transform: `translateX(${edgeShift(todayX)})` }}
              aria-hidden="true"
            >
              Today
            </span>
          </>
        )}

        {/* Stems tie raised dots to their date on the bar. */}
        {dots.filter((dot) => dot.lane > 0).map(({ event, x, lane }) => (
          <span
            key={`stem-${event.id}`}
            className="absolute w-px bg-brand-300"
            style={{ left: `${x}%`, top: barY - lane * LANE_HEIGHT, height: lane * LANE_HEIGHT }}
            aria-hidden="true"
          />
        ))}

        {dots.map(({ event, x, lane, kind }) => {
          const text = statusText(event, today);
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => onJump(event.id)}
              aria-label={`${event.title}. ${text}. Show in the list`}
              className="group absolute z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              style={{ left: `${x}%`, top: barY - lane * LANE_HEIGHT }}
            >
              <span
                className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 ring-brand-50 transition-transform duration-150 group-hover:scale-125 group-focus-visible:scale-125 ${DOT[kind].className}`}
                aria-hidden="true"
              >
                {kind === 'submitted' && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                {kind === 'na' && <Minus className="h-2.5 w-2.5" strokeWidth={3.5} />}
              </span>
              <span
                className="pointer-events-none absolute bottom-full z-20 mb-1.5 whitespace-nowrap rounded-md bg-brand-900 px-2 py-1 text-left text-[11px] font-medium text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                style={{ left: '50%', transform: `translateX(${edgeShift(x)})` }}
                aria-hidden="true"
              >
                {event.title}
                <span className="block font-normal text-brand-300">{text}</span>
              </span>
            </button>
          );
        })}

        {years.length > 1 && years.map(({ n, mid }) => (
          <span
            key={n}
            className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-brand-500"
            style={{ left: `${mid}%`, top: barY + 9 }}
            aria-hidden="true"
          >
            Year {n}
          </span>
        ))}
        <span className="absolute whitespace-nowrap text-[11px] text-brand-500" style={{ left: `${startX}%`, top: barY + 26, transform: `translateX(${startX > 12 ? '-50%' : '0'})` }}>
          Starts {formatDay(startDate)}
        </span>
        <span className="absolute whitespace-nowrap text-[11px] text-brand-500" style={{ left: `${endX}%`, top: barY + 26, transform: `translateX(${endX < 88 ? '-50%' : '-100%'})` }}>
          Ends {formatDay(endDate)}
        </span>
      </div>

      {kinds.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-brand-600" aria-label="Key">
          {kinds.map((kind) => (
            <li key={kind} className="inline-flex items-center gap-1.5">
              <span className={`flex h-2.5 w-2.5 items-center justify-center rounded-full ${DOT[kind].className}`} aria-hidden="true" />
              {DOT[kind].label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
