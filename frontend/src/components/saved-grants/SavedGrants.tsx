import { useState } from 'react';
import { Bookmark, ArrowLeft, Calendar, ChevronRight, BookmarkCheck } from 'lucide-react';
import { useSavedGrants } from '../../hooks/useSavedGrants';
import GrantDetailsModal from '../discovery/GrantDetailsModal';
import type { DiscoveryGrant } from '../../services/discoveryService';

interface SavedGrantsProps {
  onBack: () => void;
}

export default function SavedGrants({ onBack }: SavedGrantsProps) {
  const { savedGrants, isSaved, toggleSave } = useSavedGrants();
  const [selectedGrant, setSelectedGrant] = useState<DiscoveryGrant | null>(null);

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
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-md shadow-primary-500/20">
            <Bookmark className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-brand-900 tracking-tight leading-none">Saved Grants</h1>
            <p className="text-[11px] text-brand-500 mt-1 leading-none tabular-nums">
              {savedGrants.length === 0 ? 'No grants saved yet' : `${savedGrants.length} ${savedGrants.length === 1 ? 'grant' : 'grants'} bookmarked`}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        {savedGrants.length === 0 ? (
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
        ) : (
          <div className="flex flex-col gap-4">
            {savedGrants.map((grant) => (
              <article
                key={grant.id}
                className="bg-white/90 backdrop-blur-sm border border-brand-200/60 rounded-xl p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_4px_8px_rgba(15,23,42,0.04),0_12px_28px_rgba(15,23,42,0.06)] hover:border-primary-300/70 hover:-translate-y-0.5 focus-within:ring-2 focus-within:ring-primary-300/40 transition-all duration-200 group cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => setSelectedGrant(grant)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedGrant(grant);
                  }
                }}
                aria-label={`Open details for ${grant.title}`}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-brand-100 text-brand-700 uppercase tracking-widest">
                    {grant.funder}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleSave(grant); }}
                    aria-label={`Unsave ${grant.title}`}
                    aria-pressed={true}
                    className="p-1.5 rounded-lg text-primary-600 bg-primary-50 hover:bg-primary-100 transition-colors shrink-0"
                  >
                    <BookmarkCheck className="w-3.5 h-3.5" />
                  </button>
                </div>

                <h3 className="text-lg font-semibold text-brand-900 group-hover:text-primary-700 transition-colors line-clamp-2 mb-2 tracking-tight">
                  {grant.title}
                </h3>

                {grant.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {grant.tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-500 border border-brand-100">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-brand-100/80 text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-brand-600">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-brand-400" />
                      Due {grant.deadline}
                    </span>
                    <span className="font-semibold text-green-700 whitespace-nowrap tabular-nums">{grant.amount}</span>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-semibold text-xs transition-colors shrink-0"
                    onClick={(e) => { e.stopPropagation(); setSelectedGrant(grant); }}
                    aria-label={`View details for ${grant.title}`}
                  >
                    View Details
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>
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
