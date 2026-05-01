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
    <div className="min-h-screen bg-brand-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-brand-100 px-6 py-4 flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-brand-500 hover:text-brand-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="h-4 w-px bg-brand-200" />
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-primary-500" />
          <h1 className="text-base font-semibold text-brand-900">Saved Grants</h1>
          {savedGrants.length > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 border border-primary-100">
              {savedGrants.length}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        {savedGrants.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center">
              <Bookmark className="w-8 h-8 text-primary-300" />
            </div>
            <h2 className="text-xl font-semibold text-brand-800">No saved grants yet</h2>
            <p className="text-brand-400 text-sm text-center max-w-xs">
              Bookmark grants from the discovery page and they'll appear here.
            </p>
            <button
              onClick={onBack}
              className="mt-2 px-5 py-2 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              Browse Grants
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {savedGrants.map((grant) => (
              <article
                key={grant.id}
                className="bg-white border border-brand-100 rounded-xl p-5 hover:border-brand-300 hover:shadow-md focus-within:ring-2 focus-within:ring-brand-200 transition-all group cursor-pointer"
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
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-brand-50 text-brand-600 uppercase tracking-wider">
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

                <h3 className="text-lg font-semibold text-brand-900 group-hover:text-brand-700 transition-colors line-clamp-2 mb-2">
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

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-brand-50 text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-brand-600">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-brand-400" />
                      Due {grant.deadline}
                    </span>
                    <span className="font-medium text-green-700 whitespace-nowrap">{grant.amount}</span>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-brand-500 hover:text-brand-700 font-medium text-xs transition-colors shrink-0"
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
