import { useMemo, useState } from 'react';
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
import type { SavedGrantEntry, SavedGrantStatus } from '../../services/savedGrantsService';
import type { DiscoveryGrant } from '../../services/discoveryService';

interface SavedGrantsProps {
  onBack: () => void;
}

type StatusFilter = 'ALL' | SavedGrantStatus;
type SortKey = 'saved' | 'deadline' | 'amount' | 'updated';

const STATUS_META: Record<
  SavedGrantStatus,
  { label: string; chip: string; dot: string; icon: string }
> = {
  INTERESTED: {
    label: 'Interested',
    chip: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
    icon: '✦',
  },
  APPLYING: {
    label: 'Applying',
    chip: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
    icon: '✎',
  },
  SUBMITTED: {
    label: 'Submitted',
    chip: 'bg-primary-50 text-primary-700 border-primary-200',
    dot: 'bg-primary-500',
    icon: '✓',
  },
  REJECTED: {
    label: 'Rejected',
    chip: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500',
    icon: '×',
  },
};

const STATUS_ORDER: SavedGrantStatus[] = ['INTERESTED', 'APPLYING', 'SUBMITTED', 'REJECTED'];

export default function SavedGrants({ onBack }: SavedGrantsProps) {
  const { savedGrants, isSaved, toggleSave, updateSaved, isLoading } = useSavedGrants();
  const [selectedGrant, setSelectedGrant] = useState<DiscoveryGrant | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('saved');

  // Per-status counts for the filter chips
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      ALL: savedGrants.length,
      INTERESTED: 0,
      APPLYING: 0,
      SUBMITTED: 0,
      REJECTED: 0,
    };
    for (const e of savedGrants) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [savedGrants]);

  // Filtered + sorted view
  const visible = useMemo(() => {
    const filtered =
      statusFilter === 'ALL'
        ? savedGrants
        : savedGrants.filter((e) => e.status === statusFilter);
    const sorted = [...filtered];
    switch (sortKey) {
      case 'deadline':
        sorted.sort((a, b) => deadlineMs(a) - deadlineMs(b));
        break;
      case 'amount':
        sorted.sort((a, b) => amountValue(b) - amountValue(a));
        break;
      case 'updated':
        sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        break;
      case 'saved':
      default:
        sorted.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
        break;
    }
    return sorted;
  }, [savedGrants, statusFilter, sortKey]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-brand-100/80 px-4 sm:px-6 py-4 flex items-center gap-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sticky top-0 z-30">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-900 transition-colors px-2 py-1.5 -ml-2 rounded-lg hover:bg-brand-100"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </button>
        <div className="h-5 w-px bg-brand-200" />
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-md shadow-primary-500/20 shrink-0">
            <Bookmark className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-brand-900 tracking-tight leading-none">
              Saved Grants
            </h1>
            <p className="text-[11px] text-brand-500 mt-1 leading-none tabular-nums">
              {counts.ALL === 0
                ? 'No grants saved yet'
                : `${counts.ALL} ${counts.ALL === 1 ? 'grant' : 'grants'} bookmarked`}
            </p>
          </div>
        </div>
        {counts.ALL > 0 && (
          <SortDropdown sortKey={sortKey} onChange={setSortKey} />
        )}
      </div>

      {/* Status filter chips */}
      {counts.ALL > 0 && (
        <div className="bg-white/60 backdrop-blur-sm border-b border-brand-100/60 px-4 sm:px-6 py-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          <FilterChip
            label="All"
            count={counts.ALL}
            active={statusFilter === 'ALL'}
            onClick={() => setStatusFilter('ALL')}
            tone="neutral"
          />
          {STATUS_ORDER.map((s) => (
            <FilterChip
              key={s}
              label={STATUS_META[s].label}
              count={counts[s]}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              tone={s}
            />
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        {isLoading && counts.ALL === 0 ? (
          <div className="flex items-center justify-center py-24 text-brand-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading your saved grants…
          </div>
        ) : counts.ALL === 0 ? (
          <EmptyState onBack={onBack} />
        ) : visible.length === 0 ? (
          <FilteredEmptyState onClear={() => setStatusFilter('ALL')} statusFilter={statusFilter} />
        ) : (
          <div className="flex flex-col gap-4">
            {visible.map((entry) => (
              <SavedGrantCard
                key={entry.id}
                entry={entry}
                onOpenDetails={() => setSelectedGrant(entry.grant)}
                onUnsave={() => toggleSave(entry.grant)}
                onChangeStatus={(status) => updateSaved(entry.grant.id, { status })}
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
  onOpenDetails: () => void;
  onUnsave: () => void;
  onChangeStatus: (status: SavedGrantStatus) => Promise<void> | void;
  onSaveNotes: (notes: string) => Promise<void> | void;
}

function SavedGrantCard({ entry, onOpenDetails, onUnsave, onChangeStatus, onSaveNotes }: CardProps) {
  const { grant, status, notes, updatedAt } = entry;
  const [statusOpen, setStatusOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [draftNotes, setDraftNotes] = useState(notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const meta = STATUS_META[status];

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await onSaveNotes(draftNotes.trim());
      setNotesOpen(false);
    } finally {
      setSavingNotes(false);
    }
  };

  // Lift this card above its siblings while the status dropdown is open so
  // the menu doesn't get hidden behind the next card's stacking context
  // (each card creates one via backdrop-blur).
  const elevation = statusOpen ? 'relative z-30' : 'relative z-0';

  return (
    <article className={`${elevation} bg-white/90 backdrop-blur-sm border border-brand-200/60 rounded-xl p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_4px_8px_rgba(15,23,42,0.04),0_12px_28px_rgba(15,23,42,0.06)] hover:border-primary-300/70 focus-within:ring-2 focus-within:ring-primary-300/40 transition-all duration-200 group`}>
      {/* Top row: funder + actions */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-brand-100 text-brand-700 uppercase tracking-widest">
            {grant.funder}
          </span>
          <FreshnessBadge timestamp={grant.lastVerifiedAt ?? grant.lastScrapedAt} />
          <ProviderUpdatedInfo timestamp={grant.lastScrapedAt} />
        </div>
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

      {/* Status + notes row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setStatusOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${meta.chip} hover:brightness-95 transition`}
            aria-haspopup="listbox"
            aria-expanded={statusOpen}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
          {statusOpen && (
            <>
              <button
                type="button"
                aria-label="Close status menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setStatusOpen(false)}
              />
              <ul
                role="listbox"
                className="absolute z-20 left-0 mt-1 w-44 bg-white border border-brand-200 rounded-lg shadow-lg overflow-hidden"
              >
                {STATUS_ORDER.map((s) => {
                  const sm = STATUS_META[s];
                  const selected = s === status;
                  return (
                    <li key={s}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={async () => {
                          setStatusOpen(false);
                          if (!selected) await onChangeStatus(s);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left hover:bg-brand-50 transition ${
                          selected ? 'bg-brand-50' : ''
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />
                        <span className="flex-1 text-brand-800">{sm.label}</span>
                        {selected && <span className="text-primary-600 text-[10px]">●</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

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
        <div className="mb-3 rounded-lg border border-brand-200 bg-brand-50/30 p-3">
          <textarea
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            placeholder="e.g. Ask Dr. X about co-authorship; deadline conflicts with conference travel."
            rows={4}
            maxLength={4000}
            className="w-full bg-white border border-brand-200 rounded-md p-2 text-sm text-brand-800 placeholder:text-brand-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200 resize-y"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-brand-400 tabular-nums">
              {draftNotes.length}/4000
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
        <div className="mb-3 text-xs text-brand-600 bg-brand-50/50 border-l-2 border-brand-300 pl-3 py-1.5 italic line-clamp-2">
          {notes}
        </div>
      )}

      {/* Bottom row: deadline / amount / details link */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-brand-100/80 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-brand-600">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-brand-400" />
            Due {grant.deadline}
          </span>
          <span className="font-semibold text-green-700 whitespace-nowrap tabular-nums">
            {grant.amount}
          </span>
          {updatedAt && (
            <span className="text-[11px] text-brand-400 hidden sm:inline">
              Updated {formatRelative(updatedAt)}
            </span>
          )}
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
    updated: 'Recently updated',
    deadline: 'Deadline (soonest)',
    amount: 'Funding (highest)',
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-700 bg-white border border-brand-200 hover:bg-brand-50 transition shadow-sm"
      >
        Sort: <span className="font-semibold">{labels[sortKey]}</span>
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
// Filter chip
// =============================================================================

function FilterChip({
  label,
  count,
  active,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone: 'neutral' | SavedGrantStatus;
}) {
  const activeTone =
    tone === 'neutral'
      ? 'bg-brand-900 text-white border-brand-900'
      : `${STATUS_META[tone].chip} ring-2 ring-offset-0 ring-current/30`;

  const idleTone =
    tone === 'neutral'
      ? 'bg-white text-brand-700 border-brand-200 hover:bg-brand-50'
      : 'bg-white text-brand-700 border-brand-200 hover:bg-brand-50';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
        active ? activeTone : idleTone
      }`}
      aria-pressed={active}
    >
      {tone !== 'neutral' && (
        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[tone].dot}`} />
      )}
      {label}
      <span
        className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] tabular-nums ${
          active ? 'bg-white/20' : 'bg-brand-100 text-brand-600'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

// =============================================================================
// Empty states
// =============================================================================

function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <div className="rounded-2xl border border-brand-200/60 bg-white/60 backdrop-blur-sm p-12 flex flex-col items-center justify-center text-center mt-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100/60 flex items-center justify-center mb-5 shadow-inner border border-primary-100">
        <Bookmark className="w-9 h-9 text-primary-400" />
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary-400 rounded-full animate-pulse" />
      </div>
      <h2 className="text-xl font-bold text-brand-900 tracking-tight mb-2">No saved grants yet</h2>
      <p className="text-brand-500 text-sm text-center max-w-xs mb-6">
        Bookmark grants from the discovery page and they'll appear here for easy access.
      </p>
      <button
        onClick={onBack}
        className="px-6 py-2.5 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white text-sm font-semibold shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 active:scale-[0.98] transition-all"
      >
        Browse Grants
      </button>
    </div>
  );
}

function FilteredEmptyState({
  onClear,
  statusFilter,
}: {
  onClear: () => void;
  statusFilter: StatusFilter;
}) {
  const label = statusFilter === 'ALL' ? '' : STATUS_META[statusFilter as SavedGrantStatus].label;
  return (
    <div className="rounded-2xl border border-brand-200/60 bg-white/40 p-10 flex flex-col items-center justify-center text-center mt-8">
      <p className="text-brand-600 text-sm mb-3">
        No grants match the <span className="font-semibold">{label}</span> filter.
      </p>
      <button
        onClick={onClear}
        className="px-4 py-1.5 rounded-md text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 transition"
      >
        Show all
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

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const ms = Date.now() - t;
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
