import { useState } from 'react';
import { ShieldAlert, ShieldCheck, Calendar, Sparkles, Bookmark, BookmarkCheck } from 'lucide-react';
import GrantDetailsModal from './GrantDetailsModal.tsx';
import FreshnessBadge from '../common/FreshnessBadge';
import MatchScoreDial from '../common/MatchScoreDial';
import type { DiscoveryGrant } from '../../services/discoveryService';
import type { ResearcherResponse } from '../../services/researcherService';
import { useSavedGrants } from '../../hooks/useSavedGrants';
import { DEADLINE_TEXT_CLASSES, formatRelativeDeadline } from '../../utils/formatDeadline';
import WhatsAppShareButton from '../common/WhatsAppShareButton';

interface GrantListProps {
  grants: DiscoveryGrant[];
  isLoading?: boolean;
  source?: 'ai' | 'core' | null;
  profile?: ResearcherResponse | null;
}

export function GrantSkeleton() {
  return (
    <div aria-hidden="true" className="bg-white border border-brand-200 rounded-xl p-4 sm:p-5 shadow-soft">
      <div className="flex gap-4">
        <div className="flex-1">
          <div className="h-4 w-40 skeleton-shimmer rounded-md mb-3"></div>
          <div className="h-6 w-4/5 skeleton-shimmer rounded-md mb-2"></div>
          <div className="h-6 w-1/2 skeleton-shimmer rounded-md"></div>
        </div>
        <div className="w-14 h-14 skeleton-shimmer rounded-full shrink-0"></div>
      </div>
      <div className="flex gap-4 mt-4">
        <div className="h-4 w-20 skeleton-shimmer rounded-md"></div>
        <div className="h-4 w-28 skeleton-shimmer rounded-md"></div>
        <div className="h-4 w-24 skeleton-shimmer rounded-md"></div>
      </div>
      <div className="mt-4 h-11 w-full skeleton-shimmer rounded-lg"></div>
    </div>
  );
}

export default function GrantList({ grants, isLoading, source, profile }: GrantListProps) {
  const [selectedGrant, setSelectedGrant] = useState<DiscoveryGrant | null>(null);
  const { isSaved, toggleSave } = useSavedGrants();
  const isAi = source === 'ai';

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading grants…</span>
        <GrantSkeleton />
        <GrantSkeleton />
        <GrantSkeleton />
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3" aria-live="polite">
        {grants.map((grant) => (
          <li key={grant.id}>
            <GrantCard
              grant={grant}
              isAi={isAi}
              saved={isSaved(grant.id)}
              onToggleSave={toggleSave}
              onOpen={setSelectedGrant}
            />
          </li>
        ))}
      </ul>

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
  saved,
  onToggleSave,
}: {
  grant: DiscoveryGrant;
  saved: boolean;
  onToggleSave: (grant: DiscoveryGrant) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggleSave(grant); }}
      aria-label={saved ? `Unsave ${grant.title}` : `Save ${grant.title}`}
      aria-pressed={saved}
      title={saved ? 'Remove from saved' : 'Save grant'}
      className={`p-2 rounded-lg transition-colors shrink-0 ${
        saved
          ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
          : 'text-brand-500 hover:text-primary-600 hover:bg-primary-50'
      }`}
    >
      {saved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
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

/** "RESEARCH_GRANT" → "Research grant"; null for placeholder values. */
function formatGrantType(grantType?: string | null): string | null {
  if (!grantType) return null;
  const upper = grantType.trim().toUpperCase();
  if (upper === '' || upper === 'OTHER' || upper === 'UNSPECIFIED') return null;
  const words = grantType.trim().replace(/_/g, ' ');
  // Only re-case SHOUTED enum values; leave mixed-case labels like "R01" alone.
  if (words !== words.toUpperCase()) return words;
  const lower = words.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * One grant in the results list. Visual hierarchy, top to bottom:
 * title → match score → deadline / amount / eligibility → reasoning → tags.
 *
 * The title is the card's single interactive "link"; its ::after overlay
 * stretches over the whole card so the entire surface is clickable without
 * nesting the save/share buttons inside another button.
 */
function GrantCard({
  grant,
  isAi,
  saved,
  onToggleSave,
  onOpen,
}: {
  grant: DiscoveryGrant;
  isAi: boolean;
  saved: boolean;
  onToggleSave: (grant: DiscoveryGrant) => void;
  onOpen: (grant: DiscoveryGrant) => void;
}) {
  const isAmountSpecified =
    !!grant.amount &&
    !grant.amount.toLowerCase().includes('not specified') &&
    !grant.amount.toLowerCase().includes('tbd');
  const allTags = cleanTags(grant.tags);
  const tags = allTags.slice(0, 3);
  const deadline = formatRelativeDeadline(grant.deadlineRaw, grant.deadlineType);
  const grantType = formatGrantType(grant.grantType);

  return (
    <article className="group relative bg-white border border-brand-200 rounded-xl p-4 sm:p-5 shadow-soft hover:shadow-hover hover:border-primary-300 has-[.card-link:focus-visible]:ring-2 has-[.card-link:focus-visible]:ring-primary-500 transition-[box-shadow,border-color] duration-200">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-brand-600 truncate">
            <span className="font-semibold text-brand-700">{grant.funder}</span>
            {grantType && (
              <>
                <span aria-hidden="true"> · </span>
                {grantType}
              </>
            )}
          </p>
          <h3 className="mt-0.5 text-lg font-bold text-brand-900 tracking-tight leading-snug line-clamp-2 wrap-break-word text-pretty">
            <button
              type="button"
              onClick={() => onOpen(grant)}
              className="card-link text-left group-hover:text-primary-700 transition-colors focus-visible:outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
            >
              {grant.title}
            </button>
          </h3>
        </div>

        <div className="relative z-10 flex items-start gap-1 shrink-0">
          {isAi && <MatchScoreDial score={grant.matchScore} />}
          <div className="flex flex-col sm:flex-row items-center">
            <BookmarkButton grant={grant} saved={saved} onToggleSave={onToggleSave} />
            <WhatsAppShareButton grant={grant} size="md" />
          </div>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
        {isAi && (
          grant.eligibility === 'Eligible' ? (
            <li className="flex items-center gap-1.5 font-semibold text-primary-700">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" /> Eligible
            </li>
          ) : (
            <li className="flex items-center gap-1.5 font-semibold text-amber-700">
              <ShieldAlert className="w-4 h-4" aria-hidden="true" /> Check eligibility
            </li>
          )
        )}
        <li className={`flex items-center gap-1.5 ${DEADLINE_TEXT_CLASSES[deadline.tone]}`} title={deadline.tooltip || undefined}>
          <Calendar className="w-4 h-4 opacity-70" aria-hidden="true" />
          <span className="whitespace-nowrap">{deadline.label}</span>
        </li>
        <li className={`tabular-nums whitespace-nowrap ${isAmountSpecified ? 'font-semibold text-brand-900' : 'text-brand-500'}`}>
          {isAmountSpecified ? grant.amount : 'Amount not specified'}
        </li>
        <li>
          <FreshnessBadge timestamp={grant.lastVerifiedAt ?? grant.lastScrapedAt ?? grant.updatedAt} />
        </li>
      </ul>

      {isAi && grant.rationale && (
        <p className="mt-3 flex gap-2.5 rounded-lg bg-primary-50 px-3.5 py-2.5 text-sm text-brand-700 leading-relaxed">
          <Sparkles className="w-4 h-4 text-primary-600 shrink-0 mt-0.5" aria-hidden="true" />
          <span className="line-clamp-2">
            <span className="font-semibold text-primary-900">
              {grant.eligibility === 'Eligible' ? 'Why it fits: ' : 'Heads up: '}
            </span>
            {grant.rationale}
          </span>
        </p>
      )}

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="text-xs font-medium px-2 py-0.5 rounded-md bg-brand-100 text-brand-700">
              {tag}
            </span>
          ))}
          {allTags.length > tags.length && (
            <span className="text-xs font-medium text-brand-500 px-1">+{allTags.length - tags.length} more</span>
          )}
        </div>
      )}
    </article>
  );
}
