import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ArrowLeft, CalendarDays, ExternalLink, FileText, Landmark, Loader2, Pencil } from 'lucide-react';
import { fetchAward, type Award } from '../../services/awardsService';
import { formatDay } from '../../utils/applicationDates';
import { formatInr } from '../../utils/formatFunding';
import AwardFormModal from './AwardFormModal';
import ComplianceCalendar from './ComplianceCalendar';
import { AWARD_STATUS_META, HEAD_LABEL, PORTAL_LABEL, projectLength, UNSPENT_LABEL } from './awardMeta';

/** One grant: its sanction details, reporting portal and budget heads (4.1). */
export default function AwardDetail() {
  const { id } = useParams();
  const awardId = Number(id);
  const validId = Number.isInteger(awardId) && awardId > 0;
  const navigate = useNavigate();
  const [award, setAward] = useState<Award | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!validId) return;
    let cancelled = false;
    fetchAward(awardId)
      .then((loaded) => !cancelled && setAward(loaded))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load this grant'));
    return () => {
      cancelled = true;
    };
  }, [validId, awardId]);

  const back = () => navigate('/my-grants');

  if (!validId || error) {
    return (
      <PageFrame onBack={back} title="Grant">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {validId ? error : 'Grant not found'}
        </div>
      </PageFrame>
    );
  }
  if (!award) {
    return (
      <PageFrame onBack={back} title="Grant">
        <div className="flex items-center justify-center py-24 text-brand-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading…
        </div>
      </PageFrame>
    );
  }

  const meta = AWARD_STATUS_META[award.status];

  return (
    <PageFrame
      onBack={back}
      title={award.projectTitle}
      subtitle={[award.agency, award.scheme].filter(Boolean).join(' · ') || undefined}
      actions={
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-800 bg-white border border-brand-300 hover:bg-brand-50 shrink-0"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
      }
    >
      <section className="bg-white border border-brand-200 rounded-xl p-5 sm:p-6 shadow-xs flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${meta.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          {award.applicationId && (
            <Link
              to={`/applications/${award.applicationId}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-800"
            >
              <FileText className="w-3.5 h-3.5" />
              From your application
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <CalendarDays className="w-4 h-4 text-brand-400" />
          <span className="font-semibold text-brand-900">
            {formatDay(award.startDate)} – {formatDay(award.endDate)}
          </span>
          <span className="text-brand-600">{projectLength(award.startDate, award.endDate)}</span>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Detail label="Sanction order">
            {award.sanctionNo || award.sanctionDate
              ? [award.sanctionNo, award.sanctionDate && `dated ${formatDay(award.sanctionDate)}`].filter(Boolean).join(', ')
              : <Missing />}
          </Detail>
          <Detail label="Total sanctioned">
            {award.totalSanctioned !== null ? <span className="tabular-nums">{formatInr(award.totalSanctioned)}</span> : <Missing />}
          </Detail>
          <Detail label="UCs and reports go to">
            {award.portalUrl ? (
              <a
                href={award.portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary-700 hover:text-primary-800"
              >
                {award.submissionPortal === 'OTHER' ? linkHost(award.portalUrl) : PORTAL_LABEL[award.submissionPortal]}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : (
              <Missing />
            )}
          </Detail>
          <Detail label="Money unspent on 31 March">
            {award.unspentPolicy === 'UNKNOWN' ? (
              <span className="text-amber-800">Not sure yet. Check your sanction order.</span>
            ) : (
              UNSPENT_LABEL[award.unspentPolicy]
            )}
          </Detail>
        </dl>
      </section>

      <ComplianceCalendar award={award} onAward={setAward} />

      <BudgetCard award={award} onEdit={() => setEditing(true)} />

      {editing && (
        <AwardFormModal
          award={award}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setAward(saved);
            setEditing(false);
            toast.success('Saved');
          }}
          onDeleted={() => navigate('/my-grants', { replace: true })}
        />
      )}
    </PageFrame>
  );
}

function BudgetCard({ award, onEdit }: { award: Award; onEdit: () => void }) {
  const lines = award.budgetLines;
  const base = award.totalSanctioned ?? award.allocatedTotal;
  const gap = award.totalSanctioned !== null && award.allocatedTotal > 0 ? award.totalSanctioned - award.allocatedTotal : 0;

  return (
    <section className="bg-white border border-brand-200 rounded-xl p-5 sm:p-6 shadow-xs mt-6">
      <h2 className="text-base font-bold text-brand-900 tracking-tight mb-4">Budget heads</h2>
      {lines.length === 0 ? (
        <div className="text-sm text-brand-600">
          No budget heads yet.{' '}
          <button type="button" onClick={onEdit} className="font-semibold text-primary-700 hover:text-primary-800">
            Add them from your sanction order
          </button>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {lines.map((line) => {
              const share = base > 0 ? Math.round((line.allocated * 100) / base) : 0;
              return (
                <li key={line.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm mb-1">
                    <span className="font-medium text-brand-800">{HEAD_LABEL[line.head]}</span>
                    <span className="tabular-nums text-brand-900 font-semibold">
                      {formatInr(line.allocated)}
                      <span className="text-brand-500 font-normal ml-2">{share}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-brand-100 overflow-hidden" aria-hidden="true">
                    <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.min(share, 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-baseline justify-between gap-3 text-sm pt-3 mt-4 border-t border-brand-100">
            <span className="font-semibold text-brand-900">Heads total</span>
            <span className="tabular-nums font-bold text-brand-900">{formatInr(award.allocatedTotal)}</span>
          </div>
          {gap !== 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              The heads are {formatInr(Math.abs(gap))} {gap > 0 ? 'less' : 'more'} than the total sanctioned.
              Check the figures against your sanction order.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-brand-500 mb-0.5">{label}</dt>
      <dd className="text-brand-900">{children}</dd>
    </div>
  );
}

function Missing() {
  return <span className="text-brand-400">Not added</span>;
}

/** "https://onlinedst.gov.in/projects" → "onlinedst.gov.in"; the link itself if it doesn't parse. */
function linkHost(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

function PageFrame({
  onBack,
  title,
  subtitle,
  actions,
  children,
}: {
  onBack: () => void;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-white border-b border-brand-200 px-4 sm:px-6 h-16 flex items-center gap-4 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-900 transition-colors px-2 py-1.5 -ml-2 rounded-lg hover:bg-brand-100"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">My grants</span>
        </button>
        <div className="h-5 w-px bg-brand-200" />
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary-600 hidden sm:flex items-center justify-center shadow-xs shrink-0">
            <Landmark className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-brand-900 tracking-tight leading-tight truncate" title={title}>
              {title}
            </h1>
            {subtitle && <p className="text-xs text-brand-600 leading-none mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        {actions}
      </div>
      <div className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:py-8">{children}</div>
    </div>
  );
}
