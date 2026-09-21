import { useState } from 'react';
import { ShieldAlert, ShieldCheck, TrendingUp, Calendar, ChevronRight, Sparkles, Bookmark, BookmarkCheck } from 'lucide-react';
import GrantDetailsModal from './GrantDetailsModal.tsx';
import FreshnessBadge from '../common/FreshnessBadge';
import ProviderUpdatedInfo from '../common/ProviderUpdatedInfo';
import type { DiscoveryGrant } from '../../services/discoveryService';
import type { ResearcherResponse } from '../../services/researcherService';
import { useSavedGrants } from '../../hooks/useSavedGrants';
import { DEADLINE_TONE_CLASSES, formatRelativeDeadline } from '../../utils/formatDeadline';
import WhatsAppShareButton from '../common/WhatsAppShareButton';

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
      title={saved ? 'Remove from saved' : 'Save grant'}
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

function cleanTags(tags: string[]): string[] {
  if (!tags || tags.length === 0) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const trimmed = tag.trim();
    const lower = trimmed.toLowerCase();
    if (!lower || seen.has(lower)) continue;
    seen.add(lower);
    result.push(trimmed);
  }
  return result;
}

function renderAiCard(
  grant: DiscoveryGrant,
  openDetails: (g: DiscoveryGrant) => void,
  isSaved: (id: number) => boolean,
  toggleSave: (grant: DiscoveryGrant) => void,
) {
  const isAmountSpecified =
    !!grant.amount &&
    !grant.amount.toLowerCase().includes('not specified') &&
    !grant.amount.toLowerCase().includes('tbd');
  const tags = cleanTags(grant.tags).slice(0, 5);

  return (
    <article
      key={grant.id}
      className="relative bg-white border border-brand-200/80 rounded-2xl p-5 md:p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_6px_20px_rgba(15,23,42,0.03)] hover:shadow-[0_8px_30px_rgba(13,148,136,0.12)] hover:border-primary-300/80 hover:-translate-y-0.5 focus-within:ring-2 focus-within:ring-primary-400/40 transition-all duration-200 group cursor-pointer transform-gpu"
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
      {/* Top Header Row: Funder / Agency + Match Pill + Share/Bookmark */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-brand-100/90 text-brand-800 tracking-wide uppercase truncate max-w-[280px] sm:max-w-md">
            {grant.funder}
          </span>
          {grant.grantType && grant.grantType.trim().toUpperCase() !== 'OTHER' && grant.grantType.trim().toUpperCase() !== 'UNSPECIFIED' && (
            <span className="hidden sm:inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 border border-primary-200/80 uppercase tracking-wider">
              {grant.grantType}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold shadow-xs tabular-nums ${
            grant.matchScore > 85
              ? 'bg-gradient-to-r from-primary-50 to-primary-100/80 text-primary-700 border border-primary-200'
              : 'bg-brand-50 text-brand-700 border border-brand-200'
          }`}>
            {grant.matchScore > 85 ? <Sparkles className="w-3.5 h-3.5 text-primary-500" /> : <TrendingUp className="w-3.5 h-3.5 text-brand-500" />}
            <span>{grant.matchScore}% Match</span>
            <div className="w-10 h-1.5 bg-white/90 rounded-full ml-1 overflow-hidden border border-brand-200/60 hidden sm:block">
              <div
                className={`h-full rounded-full ${grant.matchScore > 85 ? 'bg-gradient-to-r from-primary-400 to-primary-600' : 'bg-brand-400'}`}
                style={{ width: `${grant.matchScore}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-0.5 pl-1 border-l border-brand-100">
            <WhatsAppShareButton grant={grant} size="sm" />
            <BookmarkButton grant={grant} isSaved={isSaved} toggleSave={toggleSave} size="sm" />
          </div>
        </div>
      </div>

      {/* Grant Title */}
      <h3 className="text-xl font-bold text-brand-900 group-hover:text-primary-700 transition-colors line-clamp-2 wrap-break-word tracking-tight leading-snug mb-2.5">
        {grant.title}
      </h3>

      {/* Sub-metadata Line: Eligibility + Freshness & Updates */}
      <div className="flex flex-wrap items-center gap-2.5 mb-3 text-xs">
        {grant.eligibility === 'Eligible' ? (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
            <ShieldCheck className="w-3 h-3 text-emerald-600" /> Eligible
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
            <ShieldAlert className="w-3 h-3 text-amber-600" /> Check Eligibility
          </span>
        )}

        <span className="text-brand-300 hidden sm:inline">•</span>

        <div className="flex items-center gap-2">
          <FreshnessBadge timestamp={grant.lastVerifiedAt ?? grant.lastScrapedAt ?? grant.updatedAt} />
          <ProviderUpdatedInfo timestamp={grant.lastScrapedAt ?? grant.updatedAt} />
        </div>
      </div>

      {/* Tags Chips */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {tags.map((tag) => (
            <span key={tag} className="text-xs px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-600 border border-brand-200/70 font-medium">
              {tag}
            </span>
          ))}
          {grant.tags.length > tags.length && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50/50 text-brand-400 font-medium">
              +{grant.tags.length - tags.length} more
            </span>
          )}
        </div>
      )}

      {/* AI Reasoning Block */}
      <div className="mb-4 relative overflow-hidden bg-gradient-to-br from-primary-50/70 via-primary-50/30 to-white border border-primary-100/80 rounded-xl p-3.5 text-xs sm:text-sm text-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary-400 to-primary-600"></div>
        <p className="flex items-start gap-2 pl-0.5 leading-relaxed">
          <Sparkles className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
          <span>
            <strong className="font-semibold text-primary-900 mr-1.5">AI Reasoning:</strong>
            {grant.rationale}
          </span>
        </p>
      </div>

      {/* Footer Row: Deadline + Amount + View Details Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-brand-100">
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {(() => {
            const d = formatRelativeDeadline(grant.deadlineRaw);
            return (
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-xs font-medium ${DEADLINE_TONE_CLASSES[d.tone]}`}
                title={d.tooltip || undefined}
              >
                <Calendar className="w-3.5 h-3.5 opacity-80" />
                <span className="whitespace-nowrap">{d.label}</span>
              </div>
            );
          })()}

          <div
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs tabular-nums border ${
              isAmountSpecified
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70 font-bold'
                : 'bg-brand-50 text-brand-500 border-brand-200/70 font-medium'
            }`}
          >
            <span className="whitespace-nowrap">{grant.amount}</span>
          </div>
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary-50 text-primary-700 font-semibold text-xs border border-primary-200/70 hover:bg-primary-600 hover:text-white transition-all shadow-xs group-hover:bg-primary-600 group-hover:text-white shrink-0"
          onClick={(e) => { e.stopPropagation(); openDetails(grant); }}
          aria-label={`View details for ${grant.title}`}
        >
          <span>View Details</span>
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </button>
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
  const isAmountSpecified =
    !!grant.amount &&
    !grant.amount.toLowerCase().includes('not specified') &&
    !grant.amount.toLowerCase().includes('tbd');
  const tags = cleanTags(grant.tags).slice(0, 4);

  return (
    <article
      key={grant.id}
      className="bg-white border border-brand-200/70 rounded-2xl p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_6px_20px_rgba(15,23,42,0.03)] hover:shadow-[0_8px_30px_rgba(13,148,136,0.12)] hover:border-primary-300/80 hover:-translate-y-0.5 focus-within:ring-2 focus-within:ring-primary-400/40 transition-all duration-200 group cursor-pointer transform-gpu"
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
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-brand-100/90 text-brand-800 tracking-wide uppercase truncate max-w-[280px] sm:max-w-md">
            {grant.funder}
          </span>
          {grant.grantType && grant.grantType.trim().toUpperCase() !== 'OTHER' && grant.grantType.trim().toUpperCase() !== 'UNSPECIFIED' && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 border border-primary-200/70 uppercase tracking-wider">
              {grant.grantType}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <WhatsAppShareButton grant={grant} size="sm" />
          <BookmarkButton grant={grant} isSaved={isSaved} toggleSave={toggleSave} size="sm" />
        </div>
      </div>

      <h3 className="text-lg font-bold text-brand-900 group-hover:text-primary-700 transition-colors line-clamp-2 wrap-break-word mb-2 tracking-tight leading-snug">
        {grant.title}
      </h3>

      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <FreshnessBadge timestamp={grant.lastVerifiedAt ?? grant.lastScrapedAt ?? grant.updatedAt} />
        <ProviderUpdatedInfo timestamp={grant.lastScrapedAt ?? grant.updatedAt} />
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {tags.map((tag) => (
            <span key={tag} className="text-xs px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-600 border border-brand-200/60 font-medium">
              {tag}
            </span>
          ))}
          {grant.tags.length > tags.length && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50/50 text-brand-400 font-medium">
              +{grant.tags.length - tags.length} more
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-brand-100 text-sm">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-brand-600">
          {(() => {
            const d = formatRelativeDeadline(grant.deadlineRaw);
            return (
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-lg text-xs font-medium ${DEADLINE_TONE_CLASSES[d.tone]}`}
                title={d.tooltip || undefined}
              >
                <Calendar className="w-3.5 h-3.5 opacity-70" />
                <span>{d.label}</span>
              </div>
            );
          })()}

          <div
            className={`flex items-center px-2.5 py-1 rounded-lg text-xs tabular-nums border ${
              isAmountSpecified
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70 font-bold'
                : 'bg-brand-50 text-brand-500 border-brand-200/70 font-medium'
            }`}
          >
            <span>{grant.amount}</span>
          </div>
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-600 hover:text-white font-semibold text-xs border border-primary-200/60 transition-all cursor-pointer shrink-0 group-hover:bg-primary-600 group-hover:text-white"
          onClick={(e) => { e.stopPropagation(); openDetails(grant); }}
          aria-label={`View details for ${grant.title}`}
        >
          <span>View Details</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  );
}
