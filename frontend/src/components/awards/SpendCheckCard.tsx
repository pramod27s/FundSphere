import { useEffect, useId, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Building2,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  FlaskConical,
  Info,
  Loader2,
  Microscope,
  Package,
  Plane,
  TriangleAlert,
  Umbrella,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { fetchSpending, type Award, type BudgetHead, type SpendCheck, type SpendHead } from '../../services/awardsService';
import { formatDay, todayIso } from '../../utils/applicationDates';
import { formatInr } from '../../utils/formatFunding';
import { buttonClasses } from '../common/buttonStyles';
import { HEAD_LABEL } from './awardMeta';
import SpendUpdateModal from './SpendUpdateModal';

/** How far a head may trail the year before it counts as slow; the server warns at the same gap. */
const SLOW_GAP = 15;

const EASE = [0.22, 1, 0.36, 1] as const;

const HEAD_ICON: Record<BudgetHead, LucideIcon> = {
  EQUIPMENT: Microscope,
  MANPOWER: Users,
  CONSUMABLES: FlaskConical,
  TRAVEL: Plane,
  CONTINGENCY: Umbrella,
  OVERHEAD: Building2,
  OTHERS: Package,
};

/**
 * Where a head (or the whole year) stands. `used` is a year that isn't the
 * current one, so there's no pace to judge, only how much went.
 */
type Pace = 'over' | 'slow' | 'onTrack' | 'used' | 'notEntered';

/** Status colours ship with an icon and a label, never colour alone. Each meter's track is a lighter step of its fill. */
const PACE_META: Record<Pace, { label: string | null; icon: LucideIcon | null; pill: string; fill: string; track: string }> = {
  over: { label: 'Over budget', icon: CircleAlert, pill: 'bg-red-50 text-red-700 ring-red-200', fill: 'bg-red-500', track: 'bg-red-100' },
  slow: { label: 'Slow to spend', icon: TriangleAlert, pill: 'bg-amber-50 text-amber-800 ring-amber-200', fill: 'bg-amber-500', track: 'bg-amber-100' },
  onTrack: { label: 'On track', icon: CircleCheck, pill: 'bg-primary-50 text-primary-700 ring-primary-200', fill: 'bg-primary-500', track: 'bg-primary-100' },
  used: { label: null, icon: null, pill: '', fill: 'bg-primary-500', track: 'bg-primary-100' },
  notEntered: { label: 'Not entered', icon: CircleDashed, pill: 'bg-brand-100 text-brand-600 ring-brand-200', fill: 'bg-brand-300', track: 'bg-brand-100' },
};

function paceOf(spent: number | null, budget: number, usedPercent: number | null, check: SpendCheck): Pace {
  if (spent === null) return 'notEntered';
  if (spent > budget) return 'over';
  if (!check.current) return 'used';
  if (usedPercent !== null && usedPercent < check.yearGonePercent - SLOW_GAP) return 'slow';
  return 'onTrack';
}

/**
 * 4.3: the grant's budget heads for one financial year, each with how much
 * of its budget is used against how much of the year has gone, and the
 * spend check's warnings. A light check: the PI copies the totals from the
 * institute's statement now and then.
 */
export default function SpendCheckCard({ award, onEdit }: { award: Award; onEdit: () => void }) {
  const yearSelectId = useId();
  const [fy, setFy] = useState<number | undefined>(undefined);
  const [check, setCheck] = useState<SpendCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSpending(award.id, fy)
      .then((loaded) => !cancelled && setCheck(loaded))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load the spending'));
    return () => {
      cancelled = true;
    };
    // The grant's dates and heads feed the check, so reload when the grant is saved.
  }, [award.id, award.updatedAt, fy]);

  const gap = award.totalSanctioned !== null && award.allocatedTotal > 0 ? award.totalSanctioned - award.allocatedTotal : 0;
  const money = check?.warnings.filter((w) => !w.notice) ?? [];
  const notices = check?.warnings.filter((w) => w.notice) ?? [];
  // Until a statement is copied in, bars would all be empty: show the budget and one clear next step instead.
  const nothingRecorded = check !== null && check.heads.every((head) => head.spent === null);

  return (
    <section className="bg-white border border-brand-200 rounded-xl p-5 sm:p-6 shadow-card mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-base font-bold text-brand-900 tracking-tight">Budget and spending</h2>
          {check && (
            <p className="text-xs text-brand-500 mt-0.5">
              {check.label}: {formatDay(check.yearStart)} – {formatDay(check.yearEnd)}
              {check.current && ` · ${check.yearGonePercent}% of the year gone`}
            </p>
          )}
        </div>
        {check && check.heads.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {check.years.length > 1 && (
              <>
                <label htmlFor={yearSelectId} className="sr-only">Financial year</label>
                <select
                  id={yearSelectId}
                  value={check.fyStartYear}
                  onChange={(e) => setFy(Number(e.target.value))}
                  className="bg-white border border-brand-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-800 focus:outline-none focus:border-primary-400"
                >
                  {check.years.map((year) => (
                    <option key={year.fyStartYear} value={year.fyStartYear}>{year.label}</option>
                  ))}
                </select>
              </>
            )}
            {/* With nothing recorded, the prompt below carries this action instead. */}
            {!nothingRecorded && (
              <button type="button" onClick={() => setUpdating(true)} className={buttonClasses('primary', 'sm')}>
                Update spending
              </button>
            )}
          </div>
        )}
      </div>

      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : !check ? (
        <p className="flex items-center gap-2 text-sm text-brand-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </p>
      ) : check.heads.length === 0 ? (
        <NoHeads onEdit={onEdit} />
      ) : nothingRecorded ? (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-primary-200 bg-primary-50 p-4 sm:p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-primary-700 ring-1 ring-primary-200" aria-hidden="true">
              <Wallet className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-brand-900">No spending recorded for {check.label} yet</p>
              <p className="text-xs text-brand-700 mt-0.5 leading-relaxed">
                Copy the totals per head from your institute's statement. FundSphere then shows which heads are slow to
                spend before 31 March, when unspent money can lapse.
              </p>
            </div>
            <button type="button" onClick={() => setUpdating(true)} className={buttonClasses('primary', 'sm', 'shrink-0 self-start sm:self-auto')}>
              Record spending
            </button>
          </div>

          <BudgetSplit check={check} />

          {/* The prompt above already says nothing is recorded, so that notice isn't repeated. */}
          <Notices notices={notices.filter((notice) => notice.kind !== 'NO_SPENDING')} />
        </>
      ) : (
        <>
          <Overview check={check} />

          {money.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {money.map((warning) => {
                const red = warning.kind === 'OVERSPENT';
                const Icon = red ? CircleAlert : TriangleAlert;
                return (
                  <li
                    key={warning.message}
                    className={`flex items-start gap-2.5 rounded-lg border border-l-4 px-3 py-2.5 text-sm ${
                      red ? 'bg-red-50 border-red-200 border-l-red-500 text-red-900' : 'bg-amber-50 border-amber-200 border-l-amber-500 text-amber-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                    {warning.message}
                  </li>
                );
              })}
            </ul>
          )}

          <h3 className="mt-6 mb-3 text-xs font-semibold uppercase tracking-wide text-brand-500">By budget head</h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {check.heads.map((head, index) => (
              <HeadTile key={head.head} head={head} check={check} index={index} />
            ))}
          </ul>
          {check.current && (
            <p className="text-[11px] text-brand-500 mt-3">
              The dark line on each bar marks how much of the year has gone ({check.yearGonePercent}%).
            </p>
          )}

          <Notices notices={notices} />
        </>
      )}

      {gap !== 0 && (
        <p className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-4">
          <TriangleAlert className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
          <span>
            The heads add up to {formatInr(Math.abs(gap))} {gap > 0 ? 'less' : 'more'} than the total sanctioned.
            Check the figures against your sanction order.
          </span>
        </p>
      )}

      {updating && check && (
        <SpendUpdateModal
          award={award}
          check={check}
          onClose={() => setUpdating(false)}
          onSaved={(saved) => {
            setCheck(saved);
            setUpdating(false);
          }}
        />
      )}
    </section>
  );
}

// ----------------------------------------------------------------------
// The year at a glance: three figures and one meter of budget against time
// ----------------------------------------------------------------------

function Overview({ check }: { check: SpendCheck }) {
  const today = todayIso();
  const spent = check.totalSpent;
  const used = spent !== null && check.totalBudget > 0 ? Math.round((spent / check.totalBudget) * 100) : null;
  const pace = paceOf(spent, check.totalBudget, used, check);
  const left = spent !== null ? check.totalBudget - spent : null;
  const past = !check.current && check.yearEnd < today;

  const leftStat =
    left === null
      ? { label: 'Left to spend', value: '—', detail: '' }
      : left < 0
        ? { label: 'Over budget by', value: formatInr(-left), detail: 'across all heads' }
        : past
          ? { label: 'Left unspent', value: formatInr(left), detail: `at ${formatDay(check.yearEnd)}` }
          : { label: 'Left to spend', value: formatInr(left), detail: `by ${formatDay(check.yearEnd)}` };

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-brand-600">
          {check.asOf
            ? `From your statement of ${formatDay(check.asOf)}`
            : "No statement date recorded. Copy the totals per head from your institute's statement."}
        </p>
        <PacePill pace={pace} />
      </div>

      <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
        <Stat
          label={check.current ? 'Spent so far' : 'Spent'}
          value={spent !== null ? formatInr(spent) : '—'}
          detail={`of ${formatInr(check.totalBudget)} budgeted`}
        />
        <Stat {...leftStat} />
        <Stat
          label="Budget used"
          value={used !== null ? `${used}%` : '—'}
          detail={check.current ? `${check.yearGonePercent}% of the year gone` : `in ${check.label}`}
        />
      </dl>

      <div className="mt-5">
        {check.current && <TodayLabel percent={check.yearGonePercent} />}
        <Meter
          size="lg"
          pace={pace}
          percent={used === null ? 0 : Math.min(used, 100)}
          yearGone={check.current ? check.yearGonePercent : null}
          surface="ring-brand-50"
          label={
            used === null
              ? 'No spending entered'
              : `${used}% of this year's budget used${check.current ? `, ${check.yearGonePercent}% of the year gone` : ''}`
          }
        />
      </div>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-brand-500">{label}</dt>
      <dd className="mt-1 text-xl sm:text-2xl font-semibold leading-none tracking-tight text-brand-900">{value}</dd>
      {detail && <dd className="mt-1.5 text-xs text-brand-500">{detail}</dd>}
    </div>
  );
}

/** "Today" over the overview meter, at the share of the year gone; kept inside the bar's ends. */
function TodayLabel({ percent }: { percent: number }) {
  const shift = percent < 20 ? '-1px' : percent > 80 ? 'calc(-100% + 1px)' : '-50%';
  return (
    <div className="relative h-4 mb-1.5" aria-hidden="true">
      <span
        className="absolute bottom-0 whitespace-nowrap text-[11px] font-semibold text-brand-700"
        style={{ left: `${percent}%`, transform: `translateX(${shift})` }}
      >
        Today · {percent}% of the year
      </span>
    </div>
  );
}

// ----------------------------------------------------------------------
// One budget head
// ----------------------------------------------------------------------

function HeadTile({ head, check, index }: { head: SpendHead; check: SpendCheck; index: number }) {
  const Icon = HEAD_ICON[head.head];
  const pace = paceOf(head.spent, head.budget, head.usedPercent, check);
  const width = head.usedPercent === null ? (pace === 'over' ? 100 : 0) : Math.min(head.usedPercent, 100);
  const left = head.spent !== null ? head.budget - head.spent : null;

  return (
    <li className="rounded-xl border border-brand-200 bg-white p-4 transition-[border-color,box-shadow] duration-200 hover:border-brand-300 hover:shadow-xs">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-200" aria-hidden="true">
          <Icon className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-900">{HEAD_LABEL[head.head]}</p>
        <PacePill pace={pace} />
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-sm text-brand-500">
          <span className="text-base font-semibold text-brand-900">{head.spent !== null ? formatInr(head.spent) : '—'}</span>
          {' '}of {formatInr(head.budget)}
        </p>
        {head.usedPercent !== null && <span className="shrink-0 text-sm font-semibold text-brand-900">{head.usedPercent}%</span>}
      </div>

      <Meter
        pace={pace}
        percent={width}
        yearGone={check.current ? check.yearGonePercent : null}
        surface="ring-white"
        delay={0.05 * index}
        label={head.usedPercent === null ? 'No spending entered' : `${head.usedPercent}% of this year's budget used`}
      />

      <p className="mt-2.5 text-[11px] leading-relaxed text-brand-500">
        {left !== null && (left < 0 ? `${formatInr(-left)} over · ` : `${formatInr(left)} left · `)}
        {head.estimated ? 'Budget this year estimated' : 'Budget this year entered by you'}
        {head.allocated > 0 && ` · ${formatInr(head.allocated)} for the whole project`}
      </p>
    </li>
  );
}

/**
 * Spending against budget. The fill and its lighter track carry the pace;
 * the dark line marks how much of the year has gone, ringed in the surface
 * colour so it reads where it crosses the fill.
 */
function Meter({
  pace,
  percent,
  yearGone,
  label,
  surface,
  size = 'sm',
  delay = 0,
}: {
  pace: Pace;
  percent: number;
  yearGone: number | null;
  label: string;
  surface: string;
  size?: 'sm' | 'lg';
  delay?: number;
}) {
  const meta = PACE_META[pace];
  return (
    <div role="img" aria-label={label} className={`relative mt-2 rounded-full ${size === 'lg' ? 'h-3' : 'h-2'} ${meta.track}`}>
      <motion.div
        className={`h-full rounded-full ${meta.fill}`}
        initial={{ width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={{ duration: 0.9, delay, ease: EASE }}
      />
      {yearGone !== null && (
        <span
          className={`absolute -top-1 -bottom-1 w-0.5 rounded-full bg-brand-800 ring-2 ${surface}`}
          style={{ left: `calc(${yearGone}% - 1px)` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

function PacePill({ pace }: { pace: Pace }) {
  const meta = PACE_META[pace];
  if (!meta.label) return null;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${meta.pill}`}>
      {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
      {meta.label}
    </span>
  );
}

// ----------------------------------------------------------------------
// Before any spending: how the year's budget splits across heads
// ----------------------------------------------------------------------

/**
 * The year's planned budget per head as ranked bars, largest first. These are
 * amounts to spend, not spending, so the bars are neutral grey with no track
 * behind them: a coloured bar in a track reads as progress. Each row also
 * gives the head's allocation for the whole project, so an estimate can be
 * traced back to the sanction order.
 */
function BudgetSplit({ check }: { check: SpendCheck }) {
  const ranked = [...check.heads].sort((a, b) => b.budget - a.budget);
  const largest = ranked[0]?.budget ?? 0;
  const projectTotal = check.heads.reduce((sum, head) => sum + head.allocated, 0);
  const estimatedCount = check.heads.filter((head) => head.estimated).length;
  const allEstimated = estimatedCount === check.heads.length;
  const badge = allEstimated ? 'Estimated' : estimatedCount > 0 ? 'Partly estimated' : null;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-500">Planned budget for {check.label}</h3>
        {badge && (
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-600 ring-1 ring-inset ring-brand-200">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1 mb-4 text-xs text-brand-500">
        {allEstimated
          ? "What each head is expected to spend this year, worked out from the project's allocation. Nothing is recorded as spent yet."
          : 'What each head can spend this year. Nothing is recorded as spent yet.'}
      </p>
      <ul className="flex flex-col gap-4">
        {ranked.map((head, index) => {
          const Icon = HEAD_ICON[head.head];
          const share = check.totalBudget > 0 ? Math.round((head.budget / check.totalBudget) * 100) : 0;
          // Bars scale to the largest head, so the ranking reads clearly; the share is printed below.
          const width = largest > 0 ? (head.budget / largest) * 100 : 0;
          return (
            <li key={head.head} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-200" aria-hidden="true">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-brand-800">{HEAD_LABEL[head.head]}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-brand-900">{formatInr(head.budget)}</span>
                </div>
                <div className="mt-1.5 h-2" aria-hidden="true">
                  <motion.div
                    className="h-full rounded-full bg-brand-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${width}%` }}
                    transition={{ duration: 0.9, delay: 0.05 * index, ease: EASE }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-brand-500">
                  {share}% of this year's budget
                  {head.allocated > 0 && ` · ${formatInr(head.allocated)} for the whole project`}
                  {!allEstimated && head.estimated && ' · estimated'}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-brand-100 pt-3 text-sm">
        <span className="font-semibold text-brand-900">Planned this year</span>
        <span className="tabular-nums">
          <span className="font-bold text-brand-900">{formatInr(check.totalBudget)}</span>
          {projectTotal > 0 && <span className="text-brand-500"> of {formatInr(projectTotal)} for the whole project</span>}
        </span>
      </div>
    </div>
  );
}

function NoHeads({ onEdit }: { onEdit: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-brand-300 bg-brand-50/60 px-6 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-primary-700 ring-1 ring-brand-200" aria-hidden="true">
        <Wallet className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-brand-900">No budget heads yet</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-brand-600">
        Add the heads from your sanction order, such as equipment, manpower and travel, to check this year's spending
        against them.
      </p>
      <button type="button" onClick={onEdit} className={buttonClasses('secondary', 'sm', 'mt-4')}>
        Add them from your sanction order
      </button>
    </div>
  );
}

function Notices({ notices }: { notices: SpendCheck['warnings'] }) {
  if (notices.length === 0) return null;
  return (
    <ul className="mt-4 flex flex-col gap-1">
      {notices.map((notice) => (
        <li key={notice.message} className="flex items-start gap-1.5 text-xs text-brand-600">
          <Info className="w-3.5 h-3.5 mt-px shrink-0 text-brand-400" aria-hidden="true" />
          {notice.message}
        </li>
      ))}
    </ul>
  );
}
