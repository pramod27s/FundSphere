import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, ChevronRight, ClipboardCheck, Compass, Loader2, Plus, TriangleAlert } from 'lucide-react';
import { fetchApplications, type Application, type ApplicationStatus } from '../../services/applicationsService';
import { deadlineCountdown, formatDay, TONE_TEXT } from '../../utils/applicationDates';
import ApplicationFormModal from './ApplicationFormModal';
import { STATUS_META, STATUS_ORDER } from './applicationMeta';

type StatusFilter = 'ALL' | ApplicationStatus;

/**
 * Objective 3 home: every application the user is preparing or has sent,
 * with its readiness and deadline at a glance.
 */
export default function Applications() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchApplications()
      .then((rows) => !cancelled && setApplications(rows))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load your applications'));
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { ALL: 0, PREPARING: 0, SUBMITTED: 0, AWARDED: 0, NOT_FUNDED: 0 };
    for (const a of applications ?? []) {
      c.ALL += 1;
      c[a.status] += 1;
    }
    return c;
  }, [applications]);

  // Applications in preparation first, soonest deadline on top; the rest by last change.
  const visible = useMemo(() => {
    const rows = (applications ?? []).filter((a) => filter === 'ALL' || a.status === filter);
    return [...rows].sort((a, b) => {
      const aPrep = a.status === 'PREPARING' ? 0 : 1;
      const bPrep = b.status === 'PREPARING' ? 0 : 1;
      if (aPrep !== bPrep) return aPrep - bPrep;
      if (aPrep === 0) return (a.deadline ?? '9999-12-31').localeCompare(b.deadline ?? '9999-12-31');
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [applications, filter]);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-white border-b border-brand-200 px-4 sm:px-6 h-16 flex items-center gap-4 sticky top-0 z-30">
        <button
          onClick={() => navigate('/discovery')}
          className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-900 transition-colors px-2 py-1.5 -ml-2 rounded-lg hover:bg-brand-100"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <div className="h-5 w-px bg-brand-200" />
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center shadow-xs shrink-0">
            <ClipboardCheck className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-brand-900 tracking-tight leading-none truncate">Applications</h1>
            <p className="text-xs text-brand-600 mt-1 leading-none tabular-nums truncate">
              {applications === null
                ? 'Loading…'
                : counts.PREPARING === 0
                  ? `${counts.ALL} ${counts.ALL === 1 ? 'application' : 'applications'}`
                  : `${counts.PREPARING} in preparation`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 shadow-xs shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Add a call not in FundSphere</span>
          <span className="sm:hidden">Add call</span>
        </button>
      </div>

      {counts.ALL > 0 && (
        <div className="bg-white border-b border-brand-100 px-4 sm:px-6 py-3 flex items-center gap-2 overflow-x-auto">
          {(['ALL', ...STATUS_ORDER] as StatusFilter[]).map((s) => {
            const active = filter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                aria-pressed={active}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  active
                    ? s === 'ALL' ? 'bg-brand-900 text-white border-brand-900' : STATUS_META[s].chip
                    : 'bg-white text-brand-700 border-brand-200 hover:bg-brand-50'
                }`}
              >
                {s !== 'ALL' && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[s].dot}`} />}
                {s === 'ALL' ? 'All' : STATUS_META[s].label}
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[11px] tabular-nums ${active ? 'bg-white/20' : 'bg-brand-100 text-brand-600'}`}>
                  {counts[s]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">{error}</div>
        ) : applications === null ? (
          <div className="flex items-center justify-center py-24 text-brand-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading your applications…
          </div>
        ) : applications.length === 0 ? (
          <EmptyState onDiscover={() => navigate('/discovery')} onAdd={() => setAdding(true)} />
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-brand-200 bg-white p-10 text-center text-sm text-brand-600">
            No applications are {filter === 'ALL' ? '' : STATUS_META[filter].label.toLowerCase()} right now.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {visible.map((a) => (
              <ApplicationCard key={a.id} application={a} onOpen={() => navigate(`/applications/${a.id}`)} />
            ))}
          </div>
        )}
      </div>

      {adding && (
        <ApplicationFormModal
          onClose={() => setAdding(false)}
          onSaved={(created) => navigate(`/applications/${created.id}`)}
        />
      )}
    </div>
  );
}

function ApplicationCard({ application, onOpen }: { application: Application; onOpen: () => void }) {
  const { readiness, status } = application;
  const meta = STATUS_META[status];
  const countdown = deadlineCountdown(application.deadline);
  const preparing = status === 'PREPARING';

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left w-full bg-white border border-brand-200 rounded-lg p-5 shadow-xs hover:shadow-elevated hover:border-primary-300 transition-all group"
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {application.agency && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-brand-100 text-brand-700">
            {application.agency}
          </span>
        )}
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${meta.chip}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        {preparing && readiness.overdue > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
            <TriangleAlert className="w-3 h-3" />
            {readiness.overdue} overdue
          </span>
        )}
      </div>

      <h3 className="text-lg font-semibold text-brand-900 group-hover:text-primary-700 transition-colors line-clamp-2 mb-3 tracking-tight">
        {application.title}
      </h3>

      {preparing && (
        <div className="mb-3">
          <div className="flex items-baseline justify-between text-xs mb-1.5">
            <span className="font-semibold text-brand-700">
              {readiness.percent === null ? 'No checklist yet' : `${readiness.percent}% ready`}
            </span>
            {readiness.percent !== null && (
              <span className="text-brand-500 tabular-nums">
                {readiness.mandatoryDone} of {readiness.mandatoryTotal} required items
              </span>
            )}
          </div>
          <div className="h-2 rounded-full bg-brand-100 overflow-hidden" aria-hidden="true">
            <div
              className={`h-full rounded-full ${readiness.percent === 100 ? 'bg-primary-500' : 'bg-primary-600'}`}
              style={{ width: `${readiness.percent ?? 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-brand-100 text-sm">
        <span className={`inline-flex items-center gap-1.5 ${preparing ? TONE_TEXT[countdown.tone] : 'text-brand-600'} font-medium`}>
          <Calendar className="w-3.5 h-3.5 opacity-70" />
          {application.deadline ? formatDay(application.deadline) : 'No deadline set'}
          {preparing && application.deadline && <span className="font-normal">· {countdown.label}</span>}
        </span>
        <span className="inline-flex items-center gap-1 text-primary-600 font-semibold text-xs">
          Open
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </button>
  );
}

function EmptyState({ onDiscover, onAdd }: { onDiscover: () => void; onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-brand-200 bg-white p-10 sm:p-12 flex flex-col items-center text-center mt-8 shadow-medium">
      <div className="w-20 h-20 rounded-xl bg-primary-50 flex items-center justify-center mb-5 border border-primary-200">
        <ClipboardCheck className="w-9 h-9 text-primary-400" />
      </div>
      <h2 className="text-xl font-bold text-brand-900 tracking-tight mb-2">Don't get rejected for a missing annexure</h2>
      <p className="text-brand-500 text-sm max-w-md mb-6">
        Start an application from any grant, upload its guidelines, and FundSphere lists every document,
        limit and sign-off the agency wants, with the line it came from. Then track who's doing what.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onDiscover}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold shadow-xs"
        >
          <Compass className="w-4 h-4" />
          Find a grant
        </button>
        <button
          onClick={onAdd}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-brand-300 hover:bg-brand-50 text-brand-900 text-sm font-semibold"
        >
          <Plus className="w-4 h-4" />
          Add a call not in FundSphere
        </button>
      </div>
    </div>
  );
}
