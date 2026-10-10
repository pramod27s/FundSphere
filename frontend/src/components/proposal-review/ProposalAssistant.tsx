import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Compass,
  FileText,
  Loader2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { fetchApplications, type Application } from '../../services/applicationsService';
import {
  fetchAllApplicationReviews,
  fetchStandaloneReviews,
  reviewStandalone,
  runFullReview,
  type ProposalReview,
} from '../../services/proposalReviewService';
import { daysUntil, deadlineCountdown, TONE_TEXT } from '../../utils/applicationDates';
import { STATUS_META } from '../applications/applicationMeta';
import DraftUpload from './DraftUpload';
import ReviewStatusView from './ReviewStatusView';
import { useReview } from './useReview';

type StepTone = 'critical' | 'warning' | 'good' | 'neutral';
type WorkspaceTab = 'checklist' | 'readiness' | 'proposal';

interface NextStep {
  text: string;
  tone: StepTone;
  /** The application tab the row opens. */
  tab: WorkspaceTab;
}

interface ProposalRow {
  application: Application;
  /** Oldest version first. */
  reviews: ProposalReview[];
  latest: ProposalReview | null;
  latestFinished: ProposalReview | null;
  /** Finished versions that have a quality score, oldest first. */
  scores: { versionNo: number; score: number }[];
  next: NextStep;
}

const STEP_META: Record<StepTone, { text: string; icon: LucideIcon }> = {
  critical: { text: 'text-red-700', icon: TriangleAlert },
  warning: { text: 'text-amber-800', icon: Clock },
  good: { text: 'text-primary-700', icon: CheckCircle2 },
  neutral: { text: 'text-brand-700', icon: ArrowRight },
};

const TAB_LABEL: Record<WorkspaceTab, string> = {
  proposal: 'Open proposal',
  checklist: 'Open checklist',
  readiness: 'Open tracker',
};

/**
 * The Proposals overview: how the drafts in every application are doing
 * (latest score, trend across versions, rules met, checklist readiness)
 * and what to do next. Each row opens that application's workspace.
 * A one-off check without an application stays available at the bottom.
 */
export default function ProposalAssistant() {
  const navigate = useNavigate();
  const [data, setData] = useState<{ applications: Application[]; reviews: ProposalReview[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchApplications(), fetchAllApplicationReviews()])
      .then(([applications, reviews]) => !cancelled && setData({ applications, reviews }))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load your proposals'));
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => (data ? buildRows(data.applications, data.reviews) : []), [data]);
  const stats = useMemo(() => summarize(rows), [rows]);
  const preparing = rows.filter((r) => r.application.status === 'PREPARING');
  const decided = rows.filter((r) => r.application.status !== 'PREPARING');

  const open = (row: ProposalRow) => navigate(`/applications/${row.application.id}?tab=${row.next.tab}`);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-white border-b border-brand-200 px-4 sm:px-6 h-16 flex items-center gap-4 sticky top-0 z-30">
        <button onClick={() => navigate('/discovery')}
          className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-900 px-2 py-1.5 -ml-2 rounded-lg hover:bg-brand-100">
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <div className="h-5 w-px bg-brand-200" />
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center shadow-xs shrink-0">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-brand-900 tracking-tight leading-none truncate">Proposals</h1>
            <p className="text-xs text-brand-600 mt-1 leading-none truncate">Scores across your applications</p>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:py-8 flex flex-col gap-6">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">{error}</div>
        ) : data === null ? (
          <div className="flex items-center justify-center py-24 text-brand-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading your proposals…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState onDiscover={() => navigate('/discovery')} onApplications={() => navigate('/applications')} />
        ) : (
          <>
            <section aria-label="Proposal stats" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile
                label="Drafts checked"
                value={String(stats.draftsChecked)}
                detail={stats.draftsChecked === 0
                  ? 'None yet'
                  : `Across ${stats.appsWithDrafts} ${stats.appsWithDrafts === 1 ? 'application' : 'applications'}`}
              />
              <StatTile
                label="Average score"
                value={stats.averageScore === null ? '–' : String(stats.averageScore)}
                suffix={stats.averageScore === null ? undefined : '/100'}
                detail={stats.scoredApps === 0
                  ? 'Run an AI review for a score'
                  : `Latest draft of ${stats.scoredApps} ${stats.scoredApps === 1 ? 'application' : 'applications'}`}
              />
              <StatTile
                label="Improvement"
                value={stats.averageGain === null ? '–' : `${stats.averageGain > 0 ? '+' : ''}${stats.averageGain}`}
                valueClass={stats.averageGain === null ? undefined : stats.averageGain > 0 ? 'text-primary-700' : stats.averageGain < 0 ? 'text-red-700' : undefined}
                detail={stats.averageGain === null
                  ? 'Check a revised draft to see it'
                  : 'Points from first to latest draft, on average'}
              />
              <StatTile
                label="Critical problems"
                icon={stats.criticalTotal > 0 ? <TriangleAlert className="w-3.5 h-3.5 text-red-700" /> : undefined}
                value={String(stats.criticalTotal)}
                valueClass={stats.criticalTotal > 0 ? 'text-red-700' : undefined}
                detail={stats.criticalTotal > 0
                  ? `In ${stats.criticalApps} ${stats.criticalApps === 1 ? 'application' : 'applications'}. Fix before submitting`
                  : 'None in your latest drafts'}
              />
            </section>

            {preparing.length > 0 && (
              <RowGroup title="In preparation" count={preparing.length}>
                {preparing.map((row) => <ProposalRowCard key={row.application.id} row={row} onOpen={() => open(row)} />)}
              </RowGroup>
            )}
            {decided.length > 0 && (
              <RowGroup title="Submitted and decided" count={decided.length}>
                {decided.map((row) => <ProposalRowCard key={row.application.id} row={row} onOpen={() => open(row)} />)}
              </RowGroup>
            )}
          </>
        )}

        <QuickCheck />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Data
// ----------------------------------------------------------------------

const isFinished = (r: ProposalReview) => r.status === 'DONE' || r.status === 'PARTIAL';

function buildRows(applications: Application[], reviews: ProposalReview[]): ProposalRow[] {
  const byApplication = new Map<number, ProposalReview[]>();
  for (const review of reviews) {
    if (review.applicationId === null) continue;
    const list = byApplication.get(review.applicationId) ?? [];
    list.push(review);
    byApplication.set(review.applicationId, list);
  }

  const rows = applications.map((application) => {
    const list = (byApplication.get(application.id) ?? []).sort((a, b) => a.versionNo - b.versionNo);
    const finished = list.filter(isFinished);
    const partial = {
      application,
      reviews: list,
      latest: list.at(-1) ?? null,
      latestFinished: finished.at(-1) ?? null,
      scores: finished
        .filter((r) => r.overallScore !== null)
        .map((r) => ({ versionNo: r.versionNo, score: r.overallScore as number })),
    };
    return { ...partial, next: nextStep(partial) };
  });

  // In preparation: soonest deadline first. The rest: most recently changed first.
  return rows.sort((a, b) => {
    const aPrep = a.application.status === 'PREPARING' ? 0 : 1;
    const bPrep = b.application.status === 'PREPARING' ? 0 : 1;
    if (aPrep !== bPrep) return aPrep - bPrep;
    if (aPrep === 0) return (a.application.deadline ?? '9999-12-31').localeCompare(b.application.deadline ?? '9999-12-31');
    return b.application.updatedAt.localeCompare(a.application.updatedAt);
  });
}

/** The one thing to do next for this application's proposal, most urgent first. */
function nextStep({ application, latest, latestFinished, scores }: Omit<ProposalRow, 'next'>): NextStep {
  if (application.status !== 'PREPARING') {
    const label = STATUS_META[application.status].label;
    const last = scores.at(-1);
    return { text: last ? `${label} with a score of ${last.score}` : label, tone: 'neutral', tab: 'proposal' };
  }
  if (!application.guidelineExtractionId) {
    return { text: 'Read the call guidelines first', tone: 'neutral', tab: 'checklist' };
  }
  if (latest?.status === 'RUNNING') {
    return { text: 'Checking a draft now…', tone: 'neutral', tab: 'proposal' };
  }
  if (!latestFinished) {
    const days = application.deadline ? daysUntil(application.deadline) : null;
    if (days !== null && days >= 0 && days <= 14) {
      return { text: `Check your first draft: ${days === 0 ? 'due today' : `${days} ${days === 1 ? 'day' : 'days'} left`}`, tone: 'warning', tab: 'proposal' };
    }
    return { text: 'Check your first draft', tone: 'neutral', tab: 'proposal' };
  }
  const critical = latestFinished.criticalFailed ?? 0;
  if (critical > 0) {
    return {
      text: `Fix ${critical} critical ${critical === 1 ? 'problem' : 'problems'} in version ${latestFinished.versionNo}`,
      tone: 'critical',
      tab: 'proposal',
    };
  }
  if (latest?.status === 'FAILED') {
    return { text: `Version ${latest.versionNo} couldn't be checked. Run it again`, tone: 'warning', tab: 'proposal' };
  }
  const score = latestFinished.overallScore;
  if (score === null) return { text: 'Run the AI review to get a score', tone: 'neutral', tab: 'proposal' };
  if (score < 50) return { text: 'Below 50: start with the top fixes', tone: 'critical', tab: 'proposal' };
  if (score < 75) return { text: 'Strengthen the weakest criteria', tone: 'warning', tab: 'proposal' };
  const ready = application.readiness.percent;
  if (ready !== null && ready < 100) {
    return { text: `Strong draft. Finish the checklist (${ready}% ready)`, tone: 'good', tab: 'readiness' };
  }
  return { text: 'Strong draft, ready to submit', tone: 'good', tab: 'proposal' };
}

function summarize(rows: ProposalRow[]) {
  const latestScores = rows.flatMap((r) => (r.scores.length ? [r.scores[r.scores.length - 1].score] : []));
  const gains = rows.flatMap((r) => (r.scores.length >= 2 ? [r.scores[r.scores.length - 1].score - r.scores[0].score] : []));
  const withCritical = rows.filter((r) => r.application.status === 'PREPARING' && (r.latestFinished?.criticalFailed ?? 0) > 0);
  return {
    draftsChecked: rows.reduce((n, r) => n + r.reviews.filter(isFinished).length, 0),
    appsWithDrafts: rows.filter((r) => r.latestFinished !== null).length,
    averageScore: average(latestScores),
    scoredApps: latestScores.length,
    averageGain: average(gains),
    criticalTotal: withCritical.reduce((n, r) => n + (r.latestFinished?.criticalFailed ?? 0), 0),
    criticalApps: withCritical.length,
  };
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Same thresholds as the score in the review report. */
function scoreTone(score: number): string {
  return score >= 75 ? 'text-primary-700' : score >= 50 ? 'text-amber-700' : 'text-red-700';
}

// ----------------------------------------------------------------------
// Pieces
// ----------------------------------------------------------------------

function StatTile({ label, value, suffix, detail, valueClass, icon }: {
  label: string; value: string; suffix?: string; detail: string; valueClass?: string; icon?: ReactNode;
}) {
  return (
    <div className="bg-white border border-brand-200 rounded-lg p-4 shadow-xs min-w-0">
      <p className="flex items-center gap-1.5 text-xs font-medium text-brand-600">
        {icon}
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1.5 flex items-baseline gap-1">
        <span className={`text-2xl font-semibold tabular-nums leading-none ${valueClass ?? 'text-brand-900'}`}>{value}</span>
        {suffix && <span className="text-xs text-brand-500">{suffix}</span>}
      </p>
      <p className="mt-2 text-xs text-brand-500 leading-snug">{detail}</p>
    </div>
  );
}

function RowGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-brand-700">
        {title} <span className="font-normal text-brand-500 tabular-nums">({count})</span>
      </h2>
      {children}
    </section>
  );
}

function ProposalRowCard({ row, onOpen }: { row: ProposalRow; onOpen: () => void }) {
  const { application, reviews, latestFinished, scores, next } = row;
  const preparing = application.status === 'PREPARING';
  const meta = STATUS_META[application.status];
  const countdown = deadlineCountdown(application.deadline);
  const latestScore = scores.at(-1)?.score ?? null;
  const gain = scores.length >= 2 ? scores[scores.length - 1].score - scores[0].score : null;
  const readiness = application.readiness;
  const step = STEP_META[next.tone];
  const StepIcon = step.icon;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="text-left w-full bg-white border border-brand-200 rounded-lg p-4 sm:p-5 shadow-xs hover:shadow-elevated hover:border-primary-300 transition-all group"
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {application.agency && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-brand-100 text-brand-700">{application.agency}</span>
        )}
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${meta.chip}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        {preparing && application.deadline && (
          <span className={`ml-auto text-xs font-medium tabular-nums ${TONE_TEXT[countdown.tone]}`}>{countdown.label}</span>
        )}
      </div>

      <h3 className="text-base sm:text-lg font-semibold text-brand-900 group-hover:text-primary-700 transition-colors line-clamp-2 tracking-tight">
        {application.title}
      </h3>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
        <Metric label="Latest score">
          {latestScore !== null ? (
            <span className="flex items-baseline gap-1">
              <span className={`text-xl font-bold tabular-nums leading-none ${scoreTone(latestScore)}`}>{latestScore}</span>
              <span className="text-xs text-brand-500">/100</span>
            </span>
          ) : (
            <span className="text-sm text-brand-500">{latestFinished ? 'Instant check only' : 'Not checked yet'}</span>
          )}
        </Metric>

        <Metric label="Score trend">
          {gain !== null ? (
            <span className="flex flex-col gap-1">
              <ScoreSparkline scores={scores} />
              <span className={`text-xs font-semibold tabular-nums ${gain > 0 ? 'text-primary-700' : gain < 0 ? 'text-red-700' : 'text-brand-600'}`}>
                {gain > 0 ? '+' : ''}{gain} since version {scores[0].versionNo}
              </span>
            </span>
          ) : (
            <span className="text-sm text-brand-500">
              {reviews.length === 0 ? 'No drafts yet' : `${reviews.length} ${reviews.length === 1 ? 'version' : 'versions'}`}
            </span>
          )}
        </Metric>

        <Metric label="Rules met">
          {latestFinished?.rulesTotal ? (
            <span className="text-sm font-semibold tabular-nums text-brand-900">
              {latestFinished.rulesMet ?? 0} of {latestFinished.rulesTotal}
            </span>
          ) : (
            <span className="text-sm text-brand-500">–</span>
          )}
        </Metric>

        <Metric label="Checklist">
          {readiness.percent !== null ? (
            <span className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold tabular-nums text-brand-900">{readiness.percent}% ready</span>
              <span className="block h-1.5 rounded-full bg-primary-100 overflow-hidden" aria-hidden="true">
                <span className="block h-full rounded-full bg-primary-600" style={{ width: `${readiness.percent}%` }} />
              </span>
            </span>
          ) : (
            <span className="text-sm text-brand-500">No checklist yet</span>
          )}
        </Metric>
      </div>

      <div className="mt-4 pt-3 border-t border-brand-100 flex items-center justify-between gap-3 text-sm">
        <span className={`inline-flex items-start gap-1.5 font-medium min-w-0 ${step.text}`}>
          <StepIcon className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{next.text}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-primary-600 font-semibold text-xs shrink-0">
          {TAB_LABEL[next.tab]}
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </button>
  );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[11px] font-medium uppercase tracking-wide text-brand-500">{label}</span>
      {children}
    </span>
  );
}

/** Score by version: earlier versions in a muted line, the latest as an accent dot. */
function ScoreSparkline({ scores }: { scores: { versionNo: number; score: number }[] }) {
  const W = 96;
  const H = 28;
  const PAD = 4;
  const values = scores.map((s) => s.score);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  // At least a 20-point window, so a 2-point wobble doesn't look like a cliff.
  if (hi - lo < 20) {
    const mid = (hi + lo) / 2;
    lo = mid - 10;
    hi = mid + 10;
  }
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (scores.length - 1);
  const y = (v: number) => H - PAD - ((v - lo) * (H - 2 * PAD)) / (hi - lo);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Score by version: ${values.join(', ')}`} className="overflow-visible">
      <polyline
        points={scores.map((s, i) => `${x(i)},${y(s.score)}`).join(' ')}
        fill="none"
        className="stroke-brand-300"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {scores.map((s, i) => {
        const last = i === scores.length - 1;
        return (
          <g key={s.versionNo}>
            <circle
              cx={x(i)}
              cy={y(s.score)}
              r={last ? 4 : 2.5}
              className={last ? 'fill-primary-600 stroke-white' : 'fill-brand-400'}
              strokeWidth={last ? 2 : 0}
            />
            {/* Larger invisible target for the hover tooltip. */}
            <circle cx={x(i)} cy={y(s.score)} r={8} fill="transparent">
              <title>{`Version ${s.versionNo}: ${s.score}/100`}</title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

function EmptyState({ onDiscover, onApplications }: { onDiscover: () => void; onApplications: () => void }) {
  return (
    <div className="rounded-xl border border-brand-200 bg-white p-8 sm:p-10 flex flex-col items-center text-center shadow-medium">
      <div className="w-16 h-16 rounded-xl bg-primary-50 flex items-center justify-center mb-4 border border-primary-200">
        <ClipboardCheck className="w-8 h-8 text-primary-400" />
      </div>
      <h2 className="text-lg font-bold text-brand-900 tracking-tight mb-2">Your proposal scores will show here</h2>
      <p className="text-brand-500 text-sm max-w-md mb-6">
        Start an application and read its guidelines once. Every draft you check in its Proposal tab is scored against
        the call's rules, and this page tracks how each proposal improves.
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
          onClick={onApplications}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-brand-300 hover:bg-brand-50 text-brand-900 text-sm font-semibold"
        >
          <ClipboardCheck className="w-4 h-4" />
          Go to Applications
        </button>
      </div>
    </div>
  );
}

/** A draft checked against any call's guidelines without an application (no version history). */
function QuickCheck() {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<ProposalReview[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [startingFull, setStartingFull] = useState(false);
  const { review, error, reload } = useReview(selectedId);

  useEffect(() => {
    if (!open) return;
    fetchStandaloneReviews().then(setRecent).catch(() => setRecent([]));
  }, [open, review?.status]);

  const start = async ({ proposal, guidelines, grantTitle, level }: {
    proposal: File; guidelines: File | null; grantTitle: string; level: 'INSTANT' | 'FULL';
  }) => {
    if (!guidelines) return;
    setStarting(true);
    try {
      const created = await reviewStandalone(proposal, guidelines, { grantTitle, level });
      setSelectedId(created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start the review');
    } finally {
      setStarting(false);
    }
  };

  const upgrade = async () => {
    if (!review) return;
    setStartingFull(true);
    try {
      await runFullReview(review.id);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start the AI review');
    } finally {
      setStartingFull(false);
    }
  };

  return (
    <section className="border-t border-brand-200 pt-5">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="w-full flex items-center justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-brand-900">One-off check without an application</span>
          <span className="block text-xs text-brand-500 mt-0.5">
            Upload a draft and the call's guidelines. It isn't linked to an application, so there's no version history.
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-brand-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-5">
          <DraftUpload withGuidelines busy={starting} onStart={start} />

          {recent.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="Recent one-off checks">
              {recent.map((r) => (
                <button key={r.id} type="button" onClick={() => setSelectedId(r.id)}
                  className={`shrink-0 max-w-[16rem] px-3 py-2 rounded-lg border text-left ${r.id === selectedId ? 'border-primary-400 bg-primary-50' : 'border-brand-200 bg-white hover:bg-brand-50'}`}>
                  <span className="block text-xs font-semibold text-brand-900 truncate">{r.grantTitle || r.proposalFileName || `Review ${r.id}`}</span>
                  <span className="block text-[11px] text-brand-500 tabular-nums">
                    {r.status === 'RUNNING' ? 'Running…' : r.status === 'FAILED' ? 'Failed'
                      : r.overallScore !== null ? `${r.overallScore}/100` : `${r.rulesMet ?? 0}/${r.rulesTotal ?? 0} rules`}
                  </span>
                </button>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-red-800">{error}</p>}
          {review && <ReviewStatusView review={review} onRunFull={upgrade} startingFull={startingFull} />}
        </div>
      )}
    </section>
  );
}
