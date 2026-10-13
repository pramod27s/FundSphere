import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CalendarPlus, ChevronRight, Landmark, Loader2, Plus, TriangleAlert } from 'lucide-react';
import { fetchAwards, type Award, type ComplianceEvent } from '../../services/awardsService';
import { formatDay } from '../../utils/applicationDates';
import { formatInr } from '../../utils/formatFunding';
import { ListLayout } from '../common/PageLayout';
import AwardFormModal from './AwardFormModal';
import AwardsPanel from './AwardsPanel';
import CalendarSyncModal from './CalendarSyncModal';
import { AWARD_STATUS_META, DEADLINE_TONE_CLASS, deadlineStatus, projectLength } from './awardMeta';
import { buttonClasses } from '../common/buttonStyles';

/**
 * Objective 4 home ("My grants"): every grant the user holds, active ones
 * first, ending soonest on top.
 */
export default function Awards() {
  const navigate = useNavigate();
  const [awards, setAwards] = useState<Award[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAwards()
      .then((rows) => !cancelled && setAwards(rows))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load your grants'));
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(
    () =>
      [...(awards ?? [])].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'ACTIVE' ? -1 : 1;
        return a.endDate.localeCompare(b.endDate);
      }),
    [awards],
  );
  const activeCount = (awards ?? []).filter((a) => a.status === 'ACTIVE').length;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-white border-b border-brand-200 px-4 sm:px-6 h-16 flex items-center gap-4 sticky top-0 z-30">
        <button
          onClick={() => navigate('/discovery')}
          className="hidden md:flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-900 transition-colors px-2 py-1.5 -ml-2 rounded-lg hover:bg-brand-100"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <div className="hidden md:block h-5 w-px bg-brand-200" />
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center shadow-xs shrink-0">
            <Landmark className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-brand-900 tracking-tight leading-none truncate">My grants</h1>
            <p className="text-xs text-brand-600 mt-1 leading-none tabular-nums truncate">
              {awards === null ? 'Loading…' : `${activeCount} active`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSyncing(true)}
          className={buttonClasses('secondary', 'sm', 'shrink-0')}
          title="Put your deadlines in Google Calendar"
        >
          <CalendarPlus className="w-4 h-4" />
          <span className="hidden sm:inline">Calendar</span>
        </button>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={buttonClasses('primary', 'sm', 'shrink-0')}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add a grant you hold</span>
          <span className="sm:hidden">Add grant</span>
        </button>
      </div>

      <ListLayout
        panel={awards && awards.length > 0 && (
          <AwardsPanel awards={awards} onOpen={(id) => navigate(`/my-grants/${id}`)} onSync={() => setSyncing(true)} />
        )}
      >
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">{error}</div>
        ) : awards === null ? (
          <div className="flex items-center justify-center py-24 text-brand-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading your grants…
          </div>
        ) : awards.length === 0 ? (
          <EmptyState onAdd={() => setAdding(true)} onApplications={() => navigate('/applications')} />
        ) : (
          <div className="flex flex-col gap-4">
            {sorted.map((award) => (
              <AwardCard key={award.id} award={award} onOpen={() => navigate(`/my-grants/${award.id}`)} />
            ))}
          </div>
        )}
      </ListLayout>

      {adding && (
        <AwardFormModal
          onClose={() => setAdding(false)}
          onSaved={(saved) => navigate(`/my-grants/${saved.id}`)}
        />
      )}
      {syncing && <CalendarSyncModal onClose={() => setSyncing(false)} />}
    </div>
  );
}

function AwardCard({ award, onOpen }: { award: Award; onOpen: () => void }) {
  const meta = AWARD_STATUS_META[award.status];
  const amount = award.totalSanctioned ?? (award.allocatedTotal > 0 ? award.allocatedTotal : null);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left w-full bg-white border border-brand-200 rounded-lg p-5 shadow-xs hover:shadow-elevated hover:border-primary-300 transition-all group"
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {award.agency && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-brand-100 text-brand-700">{award.agency}</span>
        )}
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${meta.chip}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        {award.overdueCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
            <TriangleAlert className="w-3 h-3" />
            {award.overdueCount} overdue
          </span>
        )}
        {award.spendWarnings.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <TriangleAlert className="w-3 h-3" />
            {award.spendWarnings.length} spending {award.spendWarnings.length === 1 ? 'warning' : 'warnings'}
          </span>
        )}
      </div>

      <h3 className="text-lg font-semibold text-brand-900 group-hover:text-primary-700 transition-colors line-clamp-2 tracking-tight">
        {award.projectTitle}
      </h3>
      {award.scheme && <p className="text-sm text-brand-600 mt-0.5 line-clamp-1">{award.scheme}</p>}
      {award.nextEvent && <NextDeadline event={award.nextEvent} />}
      {award.spendWarnings.length > 0 && (
        <p className="mt-2 text-xs text-amber-800 line-clamp-2">{award.spendWarnings[0]}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-3 border-t border-brand-100 text-sm">
        <span className="inline-flex items-center gap-1.5 text-brand-600 font-medium">
          <CalendarDays className="w-3.5 h-3.5 opacity-70" />
          {formatDay(award.startDate)} – {formatDay(award.endDate)}
          <span className="font-normal">· {projectLength(award.startDate, award.endDate)}</span>
        </span>
        <span className="inline-flex items-center gap-3">
          {amount !== null && <span className="font-semibold text-brand-900 tabular-nums">{formatInr(amount)}</span>}
          <span className="inline-flex items-center gap-1 text-primary-600 font-semibold text-xs">
            Open
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </span>
      </div>
    </button>
  );
}

function NextDeadline({ event }: { event: ComplianceEvent }) {
  const status = deadlineStatus(event.dueDate);
  const tone = DEADLINE_TONE_CLASS[status.tone];
  return (
    <p className="mt-3 flex items-start gap-2 text-sm">
      <span className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${tone.dot}`} aria-hidden="true" />
      <span className="min-w-0">
        <span className="text-brand-500">Next: </span>
        <span className="font-medium text-brand-900">{event.title}</span>
        <span className="text-brand-600"> · due {formatDay(event.dueDate)}</span>
        <span className={`font-semibold ${tone.text}`}> · {status.label}</span>
      </span>
    </p>
  );
}

function EmptyState({ onAdd, onApplications }: { onAdd: () => void; onApplications: () => void }) {
  return (
    <div className="rounded-xl border border-brand-200 bg-white p-10 sm:p-12 flex flex-col items-center text-center mt-8 shadow-medium">
      <div className="w-20 h-20 rounded-xl bg-primary-50 flex items-center justify-center mb-5 border border-primary-200">
        <Landmark className="w-9 h-9 text-primary-400" />
      </div>
      <h2 className="text-xl font-bold text-brand-900 tracking-tight mb-2">Never miss a UC or report deadline</h2>
      <p className="text-brand-500 text-sm max-w-md mb-6">
        Add a grant you hold, copying the details from its sanction order. It takes about three minutes.
        FundSphere keeps the grant's dates, budget heads and reporting portal in one place.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onAdd}
          className={buttonClasses('primary', 'md')}
        >
          <Plus className="w-4 h-4" />
          Add a grant you hold
        </button>
        <button
          onClick={onApplications}
          className={buttonClasses('secondary', 'md')}
        >
          Go to your applications
        </button>
      </div>
    </div>
  );
}
