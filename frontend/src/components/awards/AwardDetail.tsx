import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ArrowLeft, CalendarDays, ExternalLink, FileText, Landmark, Loader2, Pencil } from 'lucide-react';
import { fetchAward, type Award } from '../../services/awardsService';
import { formatDay, todayIso } from '../../utils/applicationDates';
import { formatInr } from '../../utils/formatFunding';
import { DetailLayout, PanelCard } from '../common/PageLayout';
import AwardFormModal from './AwardFormModal';
import ComplianceCalendar from './ComplianceCalendar';
import GenerateReportModal from './GenerateReportModal';
import ProgressReports from './ProgressReports';
import ProjectObjectives from './ProjectObjectives';
import ProjectOutputs from './ProjectOutputs';
import SpendCheckCard from './SpendCheckCard';
import { AWARD_STATUS_META, PORTAL_LABEL, projectLength, timeUsed, UNSPENT_LABEL } from './awardMeta';

const SECTIONS = [
  { id: 'deadlines', label: 'Reporting deadlines' },
  { id: 'objectives', label: 'Project objectives' },
  { id: 'outputs', label: 'Outputs' },
  { id: 'reports', label: 'Progress reports' },
  { id: 'spending', label: 'Budget and spending' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];
const SECTION_IDS: readonly SectionId[] = SECTIONS.map((section) => section.id);

/**
 * One grant: its sanction details and reporting portal (4.1), its deadlines
 * (4.2), the objectives, outputs and progress-report drafts of 4.4, and its
 * budget heads with this year's spending (4.3).
 */
export default function AwardDetail() {
  const { id } = useParams();
  const awardId = Number(id);
  const validId = Number.isInteger(awardId) && awardId > 0;
  const navigate = useNavigate();
  const [award, setAward] = useState<Award | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  /** Open while choosing what a progress-report draft covers; eventId preselects a report deadline. */
  const [drafting, setDrafting] = useState<{ eventId?: number } | null>(null);

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
      panel={
        <>
          <GrantFacts award={award} />
          <SectionNav award={award} />
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <Section id="deadlines">
          <ComplianceCalendar award={award} onAward={setAward} onDraftReport={(eventId) => setDrafting({ eventId })} />
        </Section>
        <Section id="objectives">
          <ProjectObjectives award={award} onAward={setAward} />
        </Section>
        <Section id="outputs">
          <ProjectOutputs award={award} />
        </Section>
        <Section id="reports">
          <ProgressReports award={award} onDraft={() => setDrafting({})} />
        </Section>
        <Section id="spending">
          <SpendCheckCard award={award} onEdit={() => setEditing(true)} />
        </Section>
      </div>

      {drafting && <GenerateReportModal award={award} eventId={drafting.eventId} onClose={() => setDrafting(null)} />}

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

/** The grant's dates and sanction details: the side panel from xl up, the page's first card below. */
function GrantFacts({ award }: { award: Award }) {
  const meta = AWARD_STATUS_META[award.status];
  const time = timeUsed(award);
  return (
    <section aria-label="Grant details" className="bg-white border border-brand-200 rounded-xl xl:rounded-lg p-5 sm:p-6 xl:p-4 shadow-xs flex flex-col gap-4">
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

      <div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <CalendarDays className="w-4 h-4 text-brand-400" />
          <span className="font-semibold text-brand-900">
            {formatDay(award.startDate)} – {formatDay(award.endDate)}
          </span>
          <span className="text-brand-600">{projectLength(award.startDate, award.endDate)}</span>
        </p>
        {award.status === 'ACTIVE' && (
          <div className="mt-2.5 max-w-md xl:max-w-none">
            <span className="block h-1.5 rounded-full bg-brand-100 overflow-hidden" aria-hidden="true">
              <span className="block h-full rounded-full bg-primary-500" style={{ width: `${time.percent}%` }} />
            </span>
            <span className="mt-1 block text-xs text-brand-500 tabular-nums">{time.label}</span>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-x-6 gap-y-3 text-sm">
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
              className="inline-flex items-center gap-1 font-medium text-primary-700 hover:text-primary-800 break-all"
            >
              {award.submissionPortal === 'OTHER' ? linkHost(award.portalUrl) : PORTAL_LABEL[award.submissionPortal]}
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
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
  );
}

/** "On this page": jumps to each section and marks the one being read. Only beside the page (xl up). */
function SectionNav({ award }: { award: Award }) {
  const active = useActiveSection(SECTION_IDS);
  const today = todayIso();
  const pending = award.events.filter((e) => e.status === 'PENDING');
  const overdue = pending.filter((e) => e.dueDate < today).length;
  const warnings = award.spendWarnings.length;
  const hints: Partial<Record<SectionId, ReactNode>> = {
    deadlines: overdue > 0 ? <span className="font-semibold text-red-700">{overdue} overdue</span> : `${pending.length} pending`,
    objectives: award.objectives.length > 0 ? String(award.objectives.length) : 'None yet',
    spending: warnings > 0
      ? <span className="font-semibold text-amber-800">{warnings} {warnings === 1 ? 'warning' : 'warnings'}</span>
      : undefined,
  };

  return (
    <PanelCard title="On this page" className="hidden xl:block">
      <nav>
        <ul className="-mx-2 flex flex-col">
          {SECTIONS.map(({ id, label }) => {
            const current = active === id;
            return (
              <li key={id}>
                <a
                  href={`#${id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection(id);
                  }}
                  aria-current={current ? 'location' : undefined}
                  className={`flex items-center justify-between gap-3 px-2 py-1.5 rounded-md text-sm ${
                    current ? 'bg-primary-50 text-primary-800 font-semibold' : 'text-brand-700 hover:bg-brand-50'
                  }`}
                >
                  <span>{label}</span>
                  {hints[id] && <span className="text-xs font-normal text-brand-500 tabular-nums">{hints[id]}</span>}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </PanelCard>
  );
}

/** A section's anchor. The page spaces its sections, so the card's own top margin is dropped. */
function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  return <div id={id} className="scroll-mt-22 *:mt-0">{children}</div>;
}

function scrollToSection(id: string) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

/** The last section whose top has scrolled past a line just under the header; the last one at the page's end. */
function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    const update = () => {
      let current = ids[0] ?? null;
      for (const id of ids) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= 120) current = id;
      }
      // Short sections at the end can't reach the line, so the page's end marks the last one.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = ids[ids.length - 1] ?? current;
      setActive(current);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ids]);
  return active;
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
  panel,
  children,
}: {
  onBack: () => void;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  panel?: ReactNode;
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
      <DetailLayout panel={panel}>{children}</DetailLayout>
    </div>
  );
}
