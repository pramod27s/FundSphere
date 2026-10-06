import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ClipboardCheck,
  Download,
  ExternalLink,
  Loader2,
  Pencil,
  TriangleAlert,
} from 'lucide-react';
import {
  addChecklistItem,
  computeReadiness,
  deleteChecklistItem,
  downloadCalendarFile,
  fetchApplication,
  updateApplication,
  updateChecklistItem,
  type Application,
  type ApplicationStatus,
  type ChecklistItemChanges,
} from '../../services/applicationsService';
import { deadlineCountdown, formatDay, formatTimestampDay, todayIso, TONE_TEXT } from '../../utils/applicationDates';
import { googleCalendarDeadlineUrl, sendPendingListToWhatsApp } from '../../utils/shareApplication';
import { WhatsAppGlyph } from '../common/WhatsAppShareButton';
import ApplicationFormModal from './ApplicationFormModal';
import ChecklistTab from './ChecklistTab';
import ReadinessTab from './ReadinessTab';
import ProposalTab from '../proposal-review/ProposalTab';
import { STATUS_META, STATUS_ORDER } from './applicationMeta';

type Tab = 'checklist' | 'readiness' | 'proposal';

/** One application's workspace: checklist (3.2), readiness tracker (3.3), share and remind (3.4). */
export default function ApplicationDetail() {
  const { id } = useParams();
  const applicationId = Number(id);
  const validId = Number.isInteger(applicationId) && applicationId > 0;
  const navigate = useNavigate();
  const [application, setApplication] = useState<Application | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('checklist');
  const [editing, setEditing] = useState(false);
  // Only the newest item mutation's response is applied, so quick taps
  // can't be undone by an older response arriving late.
  const mutationSeq = useRef(0);

  const load = useCallback(async () => {
    try {
      setApplication(await fetchApplication(applicationId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this application');
    }
  }, [applicationId]);

  useEffect(() => {
    if (!validId) return;
    let cancelled = false;
    fetchApplication(applicationId)
      .then((loaded) => !cancelled && setApplication(loaded))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load this application'));
    return () => {
      cancelled = true;
    };
  }, [validId, applicationId]);

  const items = application?.items ?? [];

  const patchItem = useCallback(
    async (itemId: number, changes: ChecklistItemChanges) => {
      const seq = ++mutationSeq.current;
      // Optimistic for status and owner, so readiness moves instantly.
      if (changes.status !== undefined || changes.ownerName !== undefined) {
        setApplication((prev) => {
          if (!prev?.items) return prev;
          const nextItems = prev.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  ...(changes.status !== undefined ? { status: changes.status } : {}),
                  ...(changes.ownerName !== undefined ? { ownerName: changes.ownerName || null } : {}),
                }
              : item,
          );
          return { ...prev, items: nextItems, readiness: computeReadiness(nextItems, todayIso()) };
        });
      }
      try {
        const updated = await updateChecklistItem(applicationId, itemId, changes);
        if (seq === mutationSeq.current) setApplication(updated);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not save the item');
        void load();
      }
    },
    [applicationId, load],
  );

  const deleteItem = useCallback(
    async (itemId: number) => {
      const seq = ++mutationSeq.current;
      try {
        const updated = await deleteChecklistItem(applicationId, itemId);
        if (seq === mutationSeq.current) setApplication(updated);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not delete the item');
        void load();
      }
    },
    [applicationId, load],
  );

  const addItem = useCallback(
    async (item: ChecklistItemChanges & { text: string }) => {
      const seq = ++mutationSeq.current;
      try {
        const updated = await addChecklistItem(applicationId, item);
        if (seq === mutationSeq.current) setApplication(updated);
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not add the item');
        return false;
      }
    },
    [applicationId],
  );

  const changeStatus = async (status: ApplicationStatus) => {
    if (!application || status === application.status) return;
    try {
      setApplication(await updateApplication(application.id, { status }));
      toast.success(`Marked as ${STATUS_META[status].label.toLowerCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change the status');
    }
  };

  if (!validId || error) {
    return (
      <PageFrame onBack={() => navigate('/applications')} title="Application">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {validId ? error : 'Application not found'}
        </div>
      </PageFrame>
    );
  }
  if (!application) {
    return (
      <PageFrame onBack={() => navigate('/applications')} title="Application">
        <div className="flex items-center justify-center py-24 text-brand-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading…
        </div>
      </PageFrame>
    );
  }

  const pendingCount = items.filter((i) => i.status === 'TODO').length;

  return (
    <PageFrame
      onBack={() => navigate('/applications')}
      title={application.title}
      subtitle={application.agency ?? undefined}
      actions={<StatusMenu status={application.status} onChange={changeStatus} />}
    >
      <Summary application={application} onEdit={() => setEditing(true)} />

      <div className="flex items-center gap-1 border-b border-brand-200 mt-6 mb-5 overflow-x-auto" role="tablist">
        <TabButton active={tab === 'checklist'} onClick={() => setTab('checklist')} label="Checklist" count={items.length} />
        <TabButton active={tab === 'readiness'} onClick={() => setTab('readiness')} label="Readiness tracker" shortLabel="Tracker" count={pendingCount} countLabel="to do" />
        <TabButton active={tab === 'proposal'} onClick={() => setTab('proposal')} label="Proposal" />
      </div>

      {tab === 'checklist' ? (
        <ChecklistTab
          application={application}
          items={items}
          onApplication={(updated) => {
            mutationSeq.current += 1;
            setApplication(updated);
            toast.success(`${updated.items?.filter((i) => i.origin === 'AI').length ?? 0} requirements found`);
          }}
          onPatchItem={patchItem}
          onDeleteItem={deleteItem}
          onAddItem={addItem}
        />
      ) : tab === 'readiness' ? (
        <ReadinessTab application={application} items={items} onPatchItem={patchItem} onEditDetails={() => setEditing(true)} />
      ) : (
        <ProposalTab application={application} onOpenChecklist={() => setTab('checklist')} />
      )}

      {editing && (
        <ApplicationFormModal
          application={application}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            mutationSeq.current += 1;
            setApplication(saved);
            setEditing(false);
            toast.success('Saved');
          }}
          onDeleted={() => navigate('/applications', { replace: true })}
        />
      )}
    </PageFrame>
  );
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
          <span className="hidden sm:inline">Applications</span>
        </button>
        <div className="h-5 w-px bg-brand-200" />
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary-600 hidden sm:flex items-center justify-center shadow-xs shrink-0">
            <ClipboardCheck className="w-4 h-4 text-white" />
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

function Summary({ application, onEdit }: { application: Application; onEdit: () => void }) {
  const { readiness } = application;
  const countdown = deadlineCountdown(application.deadline);
  const preparing = application.status === 'PREPARING';
  const items = application.items ?? [];
  const gcalUrl = googleCalendarDeadlineUrl(application);
  const history = application.statusHistory ?? [];

  return (
    <section className="bg-white border border-brand-200 rounded-xl p-5 sm:p-6 shadow-xs">
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center">
        <ReadinessRing percent={readiness.percent} />

        <div className="flex flex-col gap-3 min-w-0">
          <div>
            <p className="text-sm font-semibold text-brand-900">
              {readiness.percent === null
                ? 'No required items yet'
                : `${readiness.mandatoryDone} of ${readiness.mandatoryTotal} required items done`}
            </p>
            {readiness.overdue > 0 && (
              <p className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-red-700">
                <TriangleAlert className="w-3.5 h-3.5" />
                {readiness.overdue} {readiness.overdue === 1 ? 'item is' : 'items are'} overdue
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <CalendarDays className="w-4 h-4 text-brand-400" />
            {application.deadline ? (
              <>
                <span className="font-semibold text-brand-900">Deadline {formatDay(application.deadline)}</span>
                {preparing && <span className={`font-semibold ${TONE_TEXT[countdown.tone]}`}>{countdown.label}</span>}
              </>
            ) : (
              <span className="text-brand-600">No deadline set</span>
            )}
            <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-800">
              <Pencil className="w-3 h-3" />
              {application.deadline ? 'Edit details' : 'Add deadline'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => sendPendingListToWhatsApp(application, items)}
              disabled={items.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-[#1fa855] hover:bg-[#1a9049] disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              title={items.length === 0 ? 'Build the checklist first' : 'Pending items grouped by owner, ready to send to your lab group'}
            >
              <WhatsAppGlyph className="w-4 h-4" />
              Send pending list
            </button>
            <CalendarMenu
              onDownload={() => downloadCalendarFile(application.id).then(
                () => toast.success('Calendar file downloaded. Import it into Google Calendar.'),
                (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not create the calendar file'),
              )}
              googleUrl={gcalUrl}
            />
            {application.callUrl && (
              <a
                href={application.callUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-brand-700 hover:bg-brand-100"
              >
                Call page
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {history.length > 1 && (
            <p className="text-xs text-brand-500">
              {history
                .map((h) => `${h.fromStatus === null ? 'Started' : STATUS_META[h.toStatus].label} ${formatTimestampDay(h.changedAt)}`)
                .join(' · ')}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ReadinessRing({ percent }: { percent: number | null }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const value = percent ?? 0;
  return (
    <div className="relative w-24 h-24 shrink-0 mx-auto md:mx-0" role="img" aria-label={percent === null ? 'Readiness not available yet' : `${percent}% ready`}>
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="var(--color-brand-100)" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="var(--color-primary-600)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          style={{ transition: 'stroke-dashoffset 300ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-brand-900 tabular-nums leading-none">{percent === null ? '–' : `${percent}%`}</span>
        <span className="text-[10px] font-semibold text-brand-500 uppercase tracking-wide mt-1">ready</span>
      </div>
    </div>
  );
}

function CalendarMenu({ onDownload, googleUrl }: { onDownload: () => void; googleUrl: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold text-brand-900 bg-white border border-brand-300 hover:bg-brand-50 shadow-xs"
      >
        <CalendarPlus className="w-4 h-4" />
        Add to calendar
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute z-20 left-0 mt-1 w-72 bg-white border border-brand-200 rounded-lg shadow-lg overflow-hidden">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDownload();
              }}
              className="w-full text-left px-4 py-3 hover:bg-brand-50 flex gap-3"
            >
              <Download className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
              <span>
                <span className="block text-sm font-semibold text-brand-900">Deadline + all due dates (.ics)</span>
                <span className="block text-xs text-brand-500 mt-0.5">
                  On a computer: Google Calendar → Settings → Import, then choose this file.
                </span>
              </span>
            </button>
            {googleUrl && (
              <a
                role="menuitem"
                href={googleUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="w-full text-left px-4 py-3 hover:bg-brand-50 flex gap-3 border-t border-brand-100"
              >
                <CalendarPlus className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
                <span>
                  <span className="block text-sm font-semibold text-brand-900">Just the deadline in Google Calendar</span>
                  <span className="block text-xs text-brand-500 mt-0.5">One tap, works on your phone.</span>
                </span>
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatusMenu({ status, onChange }: { status: ApplicationStatus; onChange: (s: ApplicationStatus) => void }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[status];
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold border ${meta.chip}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close status menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <ul role="listbox" className="absolute z-20 right-0 mt-1 w-44 bg-white border border-brand-200 rounded-lg shadow-lg overflow-hidden">
            {STATUS_ORDER.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  role="option"
                  aria-selected={s === status}
                  onClick={() => {
                    setOpen(false);
                    onChange(s);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left hover:bg-brand-50 ${s === status ? 'bg-brand-50' : ''}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[s].dot}`} />
                  <span className="flex-1 text-brand-800">{STATUS_META[s].label}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  shortLabel,
  count,
  countLabel,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  /** Shown instead of `label` on phones, so all tabs fit. */
  shortLabel?: string;
  count?: number;
  countLabel?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px px-3 sm:px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap shrink-0 ${
        active ? 'border-primary-600 text-primary-800' : 'border-transparent text-brand-500 hover:text-brand-800'
      }`}
    >
      {shortLabel ? (
        <>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : label}
      {count !== undefined && (
        <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[11px] tabular-nums ${active ? 'bg-primary-100 text-primary-800' : 'bg-brand-100 text-brand-600'}`}>
          {count}
          {countLabel && <span className="hidden sm:inline"> {countLabel}</span>}
        </span>
      )}
    </button>
  );
}
