import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bookmark,
  ArrowLeft,
  Calendar,
  ChevronRight,
  BookmarkCheck,
  StickyNote,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { useSavedGrants } from '../../hooks/useSavedGrants';
import GrantDetailsModal from '../discovery/GrantDetailsModal';
import FreshnessBadge from '../common/FreshnessBadge';
import ProviderUpdatedInfo from '../common/ProviderUpdatedInfo';
import type { SavedGrantEntry } from '../../services/savedGrantsService';
import type { DiscoveryGrant } from '../../services/discoveryService';
import { fetchApplications, type Application } from '../../services/applicationsService';
import { formatRelativeDeadline } from '../../utils/formatDeadline';
import WhatsAppShareButton from '../common/WhatsAppShareButton';
import StartApplicationButton from '../applications/StartApplicationButton';
import { STATUS_META } from '../applications/applicationMeta';

interface SavedGrantsProps {
  onBack: () => void;
}

type SortKey = 'saved' | 'deadline' | 'amount';

/**
 * Bookmarked grants. Progress on a grant lives on its application, so each
 * card links to that application (with its status) or offers to start one.
 */
export default function SavedGrants({ onBack }: SavedGrantsProps) {
  const { savedGrants, isSaved, toggleSave, updateSaved, isLoading } = useSavedGrants();
  const [selectedGrant, setSelectedGrant] = useState<DiscoveryGrant | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('saved');
  const [applications, setApplications] = useState<Application[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchApplications()
      .then((rows) => !cancelled && setApplications(rows))
      .catch(() => !cancelled && setApplications([]));
    return () => {
      cancelled = true;
    };
  }, []);

  // The application for each grant; the list is newest first, so keep the first one seen.
  const applicationByGrant = useMemo(() => {
    const map = new Map<number, Application>();
    for (const application of applications) {
      if (application.grantId !== null && !map.has(application.grantId)) {
        map.set(application.grantId, application);
      }
    }
    return map;
  }, [applications]);

  const sorted = useMemo(() => {
    const rows = [...savedGrants];
    switch (sortKey) {
      case 'deadline':
        rows.sort((a, b) => deadlineMs(a) - deadlineMs(b));
        break;
      case 'amount':
        rows.sort((a, b) => amountValue(b) - amountValue(a));
        break;
      case 'saved':
      default:
        rows.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
        break;
    }
    return rows;
  }, [savedGrants, sortKey]);

  const total = savedGrants.length;
  const withApplication = savedGrants.filter((e) => applicationByGrant.has(e.grant.id)).length;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-brand-200 px-4 sm:px-6 h-16 flex items-center gap-4 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-900 transition-colors px-2 py-1.5 -ml-2 rounded-lg hover:bg-brand-100"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <div className="h-5 w-px bg-brand-200" />
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center shadow-xs shrink-0">
            <Bookmark className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-brand-900 tracking-tight leading-none truncate">
              Saved Grants
            </h1>
            <p className="text-xs text-brand-600 mt-1 leading-none tabular-nums truncate">
              {total === 0
                ? 'No grants saved yet'
                : `${total} ${total === 1 ? 'grant' : 'grants'} saved${withApplication > 0 ? ` · ${withApplication} with an application` : ''}`}
            </p>
          </div>
        </div>
        {total > 0 && (
          <SortDropdown sortKey={sortKey} onChange={setSortKey} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        {isLoading && total === 0 ? (
          <div className="flex items-center justify-center py-24 text-brand-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading your saved grants…
          </div>
        ) : total === 0 ? (
          <EmptyState onBack={onBack} />
        ) : (
          <div className="flex flex-col gap-4">
            {sorted.map((entry) => (
              <SavedGrantCard
                key={entry.id}
                entry={entry}
                application={applicationByGrant.get(entry.grant.id) ?? null}
                onOpenDetails={() => setSelectedGrant(entry.grant)}
                onUnsave={() => toggleSave(entry.grant)}
                onSaveNotes={(notes) => updateSaved(entry.grant.id, { notes })}
              />
            ))}
          </div>
        )}
      </div>

      {selectedGrant && (
        <GrantDetailsModal
          grant={selectedGrant}
          onClose={() => setSelectedGrant(null)}
          source={null}
          isSaved={isSaved(selectedGrant.id)}
          onToggleSave={toggleSave}
        />
      )}
    </div>
  );
}

// =============================================================================
// Card
// =============================================================================

interface CardProps {
  entry: SavedGrantEntry;
  application: Application | null;
  onOpenDetails: () => void;
  onUnsave: () => void;
  onSaveNotes: (notes: string) => Promise<void> | void;
}

function SavedGrantCard({ entry, application, onOpenDetails, onUnsave, onSaveNotes }: CardProps) {
  const { grant, notes } = entry;
  const navigate = useNavigate();
  const [notesOpen, setNotesOpen] = useState(false);
  const [draftNotes, setDraftNotes] = useState(notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await onSaveNotes(draftNotes.trim());
      setNotesOpen(false);
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <article className="relative bg-white border border-brand-200 rounded-lg p-5 shadow-xs hover:shadow-elevated hover:border-primary-300 focus-within:ring-2 focus-within:ring-primary-300/40 transition-all duration-200 group">
      {/* Top row: funder + actions */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-brand-100 text-brand-700">
            {grant.funder}
          </span>
          <FreshnessBadge timestamp={grant.lastVerifiedAt ?? grant.lastScrapedAt} />
          <ProviderUpdatedInfo timestamp={grant.lastScrapedAt} />
        </div>
        <div className="flex items-center gap-0.5">
          <WhatsAppShareButton grant={grant} size="sm" />
          <button
            type="button"
            onClick={onUnsave}
            aria-label={`Unsave ${grant.title}`}
            aria-pressed={true}
            className="p-1.5 rounded-lg text-primary-600 bg-primary-50 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0"
            title="Remove from saved"
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Title */}
      <button
        type="button"
        onClick={onOpenDetails}
        className="text-left w-full"
      >
        <h3 className="text-lg font-semibold text-brand-900 group-hover:text-primary-700 transition-colors line-clamp-2 mb-2 tracking-tight">
          {grant.title}
        </h3>
      </button>

      {/* Tags */}
      {grant.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {grant.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-500 border border-brand-100">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Application + notes row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {application ? (
          <button
            type="button"
            onClick={() => navigate(`/applications/${application.id}`)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${STATUS_META[application.status].chip} hover:brightness-95 transition`}
            title="Open the application"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[application.status].dot}`} />
            Application: {STATUS_META[application.status].label}
            <ChevronRight className="w-3 h-3 opacity-60" />
          </button>
        ) : (
          <StartApplicationButton grant={grant} size="sm" />
        )}

        <button
          type="button"
          onClick={() => {
            setDraftNotes(notes ?? '');
            setNotesOpen((v) => !v);
          }}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition ${
            notes
              ? 'bg-brand-50 text-brand-700 border-brand-200 hover:bg-brand-100'
              : 'bg-white text-brand-500 border-brand-200 hover:bg-brand-50'
          }`}
          title={notes ? 'Edit your notes' : 'Add notes'}
        >
          <StickyNote className="w-3 h-3" />
          {notes ? 'Notes' : 'Add notes'}
        </button>
      </div>

      {/* Notes editor (collapsible) */}
      {notesOpen && (
        <div className="mb-3 rounded-lg border border-brand-200 bg-brand-50 p-3">
          <textarea
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            placeholder="e.g. Ask Dr. X about co-authorship; deadline conflicts with conference travel."
            rows={4}
            maxLength={4000}
            className="w-full bg-white border border-brand-200 rounded-md p-2 text-sm text-brand-800 placeholder:text-brand-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200 resize-y"
          />
          <div className="flex items-center justify-between mt-2">
            <span
              className={`text-[11px] tabular-nums font-medium ${
                draftNotes.length >= 4000
                  ? 'text-red-600'
                  : draftNotes.length >= 3800
                    ? 'text-amber-600'
                    : 'text-brand-500'
              }`}
            >
              {draftNotes.length}/4000
              {draftNotes.length >= 3800 && draftNotes.length < 4000 && (
                <span className="ml-1 normal-case">· {4000 - draftNotes.length} chars left</span>
              )}
              {draftNotes.length >= 4000 && (
                <span className="ml-1 normal-case">· limit reached</span>
              )}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setNotesOpen(false);
                  setDraftNotes(notes ?? '');
                }}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-brand-600 hover:bg-brand-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={savingNotes || draftNotes === (notes ?? '')}
                className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition inline-flex items-center gap-1.5"
              >
                {savingNotes && <Loader2 className="w-3 h-3 animate-spin" />}
                Save notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline note preview when collapsed */}
      {!notesOpen && notes && (
        <div className="mb-3 text-xs text-brand-600 bg-brand-50 border-l-2 border-brand-300 pl-3 py-1.5 italic line-clamp-2">
          {notes}
        </div>
      )}

      {/* Bottom row: deadline / amount / details link */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-brand-100 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-brand-600">
          {(() => {
            const d = formatRelativeDeadline(grant.deadlineRaw, grant.deadlineType);
            const tone =
              d.tone === 'overdue' ? 'text-red-700 font-medium'
              : d.tone === 'urgent' ? 'text-amber-800 font-medium'
              : d.tone === 'open' ? 'text-primary-700 font-medium'
              : 'text-brand-600';
            return (
              <span className={`inline-flex items-center gap-1.5 ${tone}`} title={d.tooltip || undefined}>
                <Calendar className="w-3.5 h-3.5 opacity-70" />
                {d.label}
              </span>
            );
          })()}
          <span className="font-semibold text-green-700 whitespace-nowrap tabular-nums">
            {grant.amount}
          </span>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-semibold text-xs transition-colors shrink-0"
          onClick={onOpenDetails}
          aria-label={`View details for ${grant.title}`}
        >
          View Details
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  );
}

// =============================================================================
// Sort dropdown
// =============================================================================

function SortDropdown({ sortKey, onChange }: { sortKey: SortKey; onChange: (s: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const labels: Record<SortKey, string> = {
    saved: 'Recently saved',
    deadline: 'Deadline (soonest)',
    amount: 'Funding (highest)',
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-700 bg-white border border-brand-200 hover:bg-brand-50 transition shadow-sm shrink-0"
        aria-label={`Sort: ${labels[sortKey]}`}
      >
        <span className="hidden sm:inline">Sort:</span>
        <span className="font-semibold">{labels[sortKey]}</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close sort menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <ul className="absolute z-20 right-0 mt-1 w-52 bg-white border border-brand-200 rounded-lg shadow-lg overflow-hidden">
            {(Object.keys(labels) as SortKey[]).map((k) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(k);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-brand-50 transition ${
                    k === sortKey ? 'bg-brand-50 text-primary-700' : 'text-brand-800'
                  }`}
                >
                  {labels[k]}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Empty state
// =============================================================================

function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <div className="rounded-xl border border-brand-200 bg-white p-12 flex flex-col items-center justify-center text-center mt-8 shadow-medium">
      <div className="relative w-20 h-20 rounded-xl bg-primary-50 flex items-center justify-center mb-5 border border-primary-200">
        <Bookmark className="w-9 h-9 text-primary-400" />
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary-400 rounded-full animate-pulse" />
      </div>
      <h2 className="text-xl font-bold text-brand-900 tracking-tight mb-2">No saved grants yet</h2>
      <p className="text-brand-500 text-sm text-center max-w-xs mb-6">
        Bookmark grants from the discovery page and they'll appear here for easy access.
      </p>
      <button
        onClick={onBack}
        className="px-6 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold shadow-xs active:scale-[0.98] transition-all"
      >
        Browse Grants
      </button>
    </div>
  );
}

// =============================================================================
// Pure helpers used by sorting
// =============================================================================

function deadlineMs(entry: SavedGrantEntry): number {
  const raw = entry.grant.deadlineRaw || entry.grant.deadline;
  if (!raw) return Number.POSITIVE_INFINITY;
  const t = new Date(raw).getTime();
  // Push past-deadlines to the end of "soonest"
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  if (t < Date.now()) return t + 1e15; // bury past deadlines while preserving order
  return t;
}

function amountValue(entry: SavedGrantEntry): number {
  const max = entry.grant.fundingAmountMaxRaw;
  const min = entry.grant.fundingAmountMinRaw;
  return max ?? min ?? 0;
}
