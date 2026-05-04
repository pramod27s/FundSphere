import { useState } from 'react';
import { ShieldAlert, ShieldCheck, Users, TrendingUp, Calendar, ChevronRight, Sparkles, Bookmark, BookmarkCheck } from 'lucide-react';
import GrantDetailsModal from './GrantDetailsModal.tsx';
import FreshnessBadge from '../common/FreshnessBadge';
import ProviderUpdatedInfo from '../common/ProviderUpdatedInfo';
import type { DiscoveryGrant } from '../../services/discoveryService';
import type { ResearcherResponse } from '../../services/researcherService';
import { useSavedGrants } from '../../hooks/useSavedGrants';

interface GrantListProps {
  grants: DiscoveryGrant[];
  isLoading?: boolean;
  source?: 'ai' | 'core' | null;
  profile?: ResearcherResponse | null;
}

export function GrantSkeleton() {
  return (
    <div aria-hidden="true" className="bg-white/80 backdrop-blur-sm border border-brand-200/60 rounded-2xl p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.04)]">
      <div className="flex justify-between items-start gap-4 mb-4">
        <div className="w-full">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-6 w-24 skeleton-shimmer rounded-md"></div>
            <div className="h-6 w-20 skeleton-shimmer rounded-md"></div>
            <div className="h-6 w-24 skeleton-shimmer rounded-md"></div>
          </div>
          <div className="h-7 w-3/4 skeleton-shimmer rounded-md mb-2"></div>
          <div className="h-7 w-1/2 skeleton-shimmer rounded-md"></div>
          <div className="flex gap-2 mt-4">
            <div className="h-5 w-16 skeleton-shimmer rounded-full"></div>
            <div className="h-5 w-20 skeleton-shimmer rounded-full"></div>
            <div className="h-5 w-24 skeleton-shimmer rounded-full"></div>
          </div>
        </div>
      </div>
      <div className="mb-5 h-12 w-full skeleton-shimmer rounded-lg"></div>
      <div className="flex items-center justify-between mt-auto">
        <div className="flex gap-6">
          <div className="h-5 w-32 skeleton-shimmer rounded-md"></div>
          <div className="h-5 w-24 skeleton-shimmer rounded-md"></div>
        </div>
        <div className="h-5 w-24 skeleton-shimmer rounded-md"></div>
      </div>
    </div>
  );
}

export default function GrantList({ grants, isLoading, source, profile }: GrantListProps) {
  const [selectedGrant, setSelectedGrant] = useState<DiscoveryGrant | null>(null);
  const { isSaved, toggleSave } = useSavedGrants();
  const isAi = source === 'ai';

  const openDetails = (grant: DiscoveryGrant) => setSelectedGrant(grant);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
        <GrantSkeleton />
        <GrantSkeleton />
        <GrantSkeleton />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4" aria-live="polite">
        {grants.map((grant) => (
          isAi
            ? renderAiCard(grant, openDetails, isSaved, toggleSave)
            : renderBrowseCard(grant, openDetails, isSaved, toggleSave)
        ))}
      </div>

      {selectedGrant && (
        <GrantDetailsModal
          grant={selectedGrant}
          onClose={() => setSelectedGrant(null)}
          source={source}
          isSaved={isSaved(selectedGrant.id)}
          onToggleSave={toggleSave}
          profile={profile}
        />
      )}
    </>
  );
}

function BookmarkButton({
  grant,
  isSaved,
  toggleSave,
  size = 'md',
}: {
  grant: DiscoveryGrant;
  isSaved: (id: number) => boolean;
  toggleSave: (grant: DiscoveryGrant) => void;
  size?: 'sm' | 'md';
}) {
  const saved = isSaved(grant.id);
  const iconCls = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggleSave(grant); }}
      aria-label={saved ? `Unsave ${grant.title}` : `Save ${grant.title}`}
      aria-pressed={saved}
      className={`p-1.5 rounded-lg transition-colors shrink-0 ${
        saved
          ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
          : 'text-brand-300 hover:text-primary-500 hover:bg-primary-50'
      }`}
    >
      {saved
        ? <BookmarkCheck className={iconCls} />
        : <Bookmark className={iconCls} />
      }
    </button>
  );
}

function renderAiCard(
  grant: DiscoveryGrant,
  openDetails: (g: DiscoveryGrant) => void,
  isSaved: (id: number) => boolean,
  toggleSave: (grant: DiscoveryGrant) => void,
) {
  return (
    <article
      key={grant.id}
      className="relative bg-white/90 backdrop-blur-sm border border-brand-200/70 rounded-2xl p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.04)] hover:shadow-[0_4px_8px_rgba(13,148,136,0.06),0_16px_40px_rgba(13,148,136,0.10)] hover:border-primary-300/70 hover:-translate-y-0.5 focus-within:ring-2 focus-within:ring-primary-400/40 transition-all duration-200 group cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={() => openDetails(grant)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetails(grant);
        }
      }}
      aria-label={`Open details for ${grant.title}`}
    >
      <div className="flex justify-between items-start gap-4 mb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2.5">
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-brand-100 text-brand-700 uppercase tracking-widest">
              {grant.funder}
            </span>

            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold shadow-sm tabular-nums ${
              grant.matchScore > 85 ? 'bg-gradient-to-r from-primary-50 to-primary-100/70 text-primary-700 border border-primary-200' : 'bg-brand-50 text-brand-700 border border-brand-200'
            }`}>
              {grant.matchScore > 85 ? <Sparkles className="w-3.5 h-3.5 text-primary-500" /> : <TrendingUp className="w-3.5 h-3.5" />}
              <span>{grant.matchScore}% Match</span>
              <div className="w-12 h-1.5 bg-white/80 rounded-full ml-1 overflow-hidden border border-brand-100">
                <div
                  className={`h-full rounded-full ${grant.matchScore > 85 ? 'bg-gradient-to-r from-primary-400 to-primary-600' : 'bg-brand-400'}`}
                  style={{ width: `${grant.matchScore}%` }}
                />
              </div>
            </div>

            {grant.eligibility === 'Eligible' ? (
              <div className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-md">
                <ShieldCheck className="w-3.5 h-3.5" /> Eligible
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-200/50">
                <ShieldAlert className="w-3.5 h-3.5" /> Check Eligibility
              </div>
            )}
          </div>

          <h3 className="text-xl font-bold text-brand-900 group-hover:text-primary-700 transition-colors line-clamp-2 wrap-break-word tracking-tight">
            {grant.title}
          </h3>

          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {grant.tags.map((tag) => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 border border-brand-200/70">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <BookmarkButton grant={grant} isSaved={isSaved} toggleSave={toggleSave} />
      </div>

      <div className="mb-5 relative overflow-hidden bg-gradient-to-br from-primary-50/80 via-primary-50/40 to-white border border-primary-100/70 rounded-xl p-4 text-sm text-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-all">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary-400 to-primary-600"></div>
        <p className="flex items-start gap-2 pl-1">
          <Sparkles className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold text-primary-900 mr-1">AI Reasoning:</span>
            {grant.rationale}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mt-auto border-t border-brand-100 pt-4">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-50/80 border border-brand-100 rounded-lg text-brand-700">
            <Calendar className="w-4 h-4 text-brand-500" />
            <span className="text-sm font-medium whitespace-nowrap">Due {grant.deadline}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 rounded-lg text-green-700">
            <span className="text-sm font-bold text-green-700 whitespace-nowrap tabular-nums">{grant.amount}</span>
          </div>
          <div className="hidden md:flex items-center gap-2 whitespace-nowrap pl-1">
            <Users className="w-4 h-4 text-brand-400" />
            <span className="text-sm text-brand-500">Find Collaborator</span>
          </div>
        </div>

        <div className="flex items-center w-full sm:w-auto justify-between sm:justify-end gap-6 border-t sm:border-t-0 border-brand-50 pt-2 sm:pt-0 mt-2 sm:mt-0">
          <div className="flex flex-col items-start sm:items-end gap-0.5">
            <FreshnessBadge timestamp={grant.lastVerifiedAt ?? grant.lastScrapedAt ?? grant.updatedAt} />
            <ProviderUpdatedInfo timestamp={grant.lastScrapedAt ?? grant.updatedAt} />
          </div>
          <button
            type="button"
            className="flex items-center gap-1 text-primary-600 hover:text-primary-700 font-semibold text-sm transition-colors cursor-pointer group/btn shrink-0"
            onClick={(e) => { e.stopPropagation(); openDetails(grant); }}
            aria-label={`View details for ${grant.title}`}
          >
            View Details
            <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>
    </article>
  );
}

function renderBrowseCard(
  grant: DiscoveryGrant,
  openDetails: (g: DiscoveryGrant) => void,
  isSaved: (id: number) => boolean,
  toggleSave: (grant: DiscoveryGrant) => void,
) {
  return (
    <article
      key={grant.id}
      className="bg-white/90 backdrop-blur-sm border border-brand-200/60 rounded-xl p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_4px_8px_rgba(13,148,136,0.06),0_16px_40px_rgba(13,148,136,0.10)] hover:border-primary-300/70 hover:-translate-y-0.5 focus-within:ring-2 focus-within:ring-primary-400/40 transition-all duration-200 group cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={() => openDetails(grant)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetails(grant);
        }
      }}
      aria-label={`Open details for ${grant.title}`}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-brand-100 text-brand-700 uppercase tracking-widest">
            {grant.funder}
          </span>
          <FreshnessBadge timestamp={grant.lastVerifiedAt ?? grant.lastScrapedAt ?? grant.updatedAt} />
          <ProviderUpdatedInfo timestamp={grant.lastScrapedAt ?? grant.updatedAt} />
        </div>
        <BookmarkButton grant={grant} isSaved={isSaved} toggleSave={toggleSave} size="sm" />
      </div>

      <h3 className="text-lg font-semibold text-brand-900 group-hover:text-primary-700 transition-colors line-clamp-2 wrap-break-word mb-2 tracking-tight">
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
          className="inline-flex items-center gap-1 text-brand-500 hover:text-brand-700 font-medium text-xs transition-colors cursor-pointer shrink-0"
          onClick={(e) => { e.stopPropagation(); openDetails(grant); }}
          aria-label={`View details for ${grant.title}`}
        >
          View Details
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  );
}
