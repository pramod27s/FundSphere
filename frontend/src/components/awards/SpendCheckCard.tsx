import { useEffect, useId, useState } from 'react';
import { CircleAlert, Info, Loader2, TriangleAlert } from 'lucide-react';
import { fetchSpending, type Award, type SpendCheck, type SpendHead } from '../../services/awardsService';
import { formatDay } from '../../utils/applicationDates';
import { formatInr } from '../../utils/formatFunding';
import { HEAD_LABEL } from './awardMeta';
import SpendUpdateModal from './SpendUpdateModal';

/** How far a head may trail the year before its bar turns amber; the server warns at the same gap. */
const SLOW_GAP = 15;

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

  return (
    <section className="bg-white border border-brand-200 rounded-xl p-5 sm:p-6 shadow-xs mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
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
            <button
              type="button"
              onClick={() => setUpdating(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700"
            >
              Update spending
            </button>
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
        <div className="text-sm text-brand-600">
          No budget heads yet.{' '}
          <button type="button" onClick={onEdit} className="font-semibold text-primary-700 hover:text-primary-800">
            Add them from your sanction order
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-brand-600 mb-3">
            {check.asOf
              ? `Spending copied from your statement of ${formatDay(check.asOf)}.`
              : 'No spending recorded for this year. Copy the totals per head from your institute\'s statement.'}
          </p>

          {money.length > 0 && (
            <ul className="mb-4 flex flex-col gap-2">
              {money.map((warning) => {
                const red = warning.kind === 'OVERSPENT';
                const Icon = red ? CircleAlert : TriangleAlert;
                return (
                  <li
                    key={warning.message}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                      red ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                    {warning.message}
                  </li>
                );
              })}
            </ul>
          )}

          <ul className="flex flex-col gap-4">
            {check.heads.map((head) => (
              <HeadRow key={head.head} head={head} check={check} />
            ))}
          </ul>

          <div className="flex items-baseline justify-between gap-3 text-sm pt-3 mt-4 border-t border-brand-100">
            <span className="font-semibold text-brand-900">This year</span>
            <span className="tabular-nums font-bold text-brand-900">
              {check.totalSpent !== null ? formatInr(check.totalSpent) : '—'}
              <span className="font-normal text-brand-500"> spent of {formatInr(check.totalBudget)}</span>
            </span>
          </div>
          {check.current && (
            <p className="text-[11px] text-brand-500 mt-1">
              The dark line on each bar marks how much of the year has gone ({check.yearGonePercent}%).
            </p>
          )}

          {notices.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1">
              {notices.map((notice) => (
                <li key={notice.message} className="flex items-start gap-1.5 text-xs text-brand-600">
                  <Info className="w-3.5 h-3.5 mt-px shrink-0 text-brand-400" aria-hidden="true" />
                  {notice.message}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {gap !== 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
          The heads add up to {formatInr(Math.abs(gap))} {gap > 0 ? 'less' : 'more'} than the total sanctioned.
          Check the figures against your sanction order.
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

function HeadRow({ head, check }: { head: SpendHead; check: SpendCheck }) {
  const overspent = head.spent !== null && head.spent > head.budget;
  const slow = check.current && head.usedPercent !== null && head.usedPercent < check.yearGonePercent - SLOW_GAP;
  const tone = overspent
    ? { bar: 'bg-red-500', text: 'text-red-700' }
    : slow
      ? { bar: 'bg-amber-500', text: 'text-amber-800' }
      : { bar: 'bg-primary-500', text: 'text-primary-700' };
  const width = head.usedPercent === null ? (overspent ? 100 : 0) : Math.min(head.usedPercent, 100);

  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm mb-1">
        <span className="font-medium text-brand-800">{HEAD_LABEL[head.head]}</span>
        <span className="tabular-nums text-brand-900 font-semibold text-right">
          {head.spent !== null ? formatInr(head.spent) : '—'}
          <span className="text-brand-500 font-normal"> of {formatInr(head.budget)}</span>
          {head.usedPercent !== null && <span className={`ml-2 ${tone.text}`}>{head.usedPercent}%</span>}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-brand-100" role="img" aria-label={
        head.usedPercent === null ? 'No spending entered' : `${head.usedPercent}% of this year's budget used`
      }>
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${width}%` }} />
        {check.current && (
          <div
            className="absolute -top-1 -bottom-1 w-0.5 rounded bg-brand-700"
            style={{ left: `calc(${check.yearGonePercent}% - 1px)` }}
            aria-hidden="true"
          />
        )}
      </div>
      <p className="text-[11px] text-brand-500 mt-1">
        {head.estimated ? 'Budget this year estimated' : 'Budget this year entered by you'}
        {head.allocated > 0 && ` · ${formatInr(head.allocated)} for the whole project`}
      </p>
    </li>
  );
}
