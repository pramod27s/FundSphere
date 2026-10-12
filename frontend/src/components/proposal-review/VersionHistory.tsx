import { formatDay } from '../../utils/applicationDates';
import { PanelCard } from '../common/PageLayout';
import { ReviewOutcome, ScoreSparkline } from './reviewDisplay';
import type { ApplicationReviews } from './useApplicationReviews';

/**
 * The Proposal tab's side card (xl up): every draft version with its
 * outcome and the score trend. Picking one shows its report; below xl the
 * tab's own version buttons do this.
 */
export default function VersionHistory({ versions }: { versions: ApplicationReviews }) {
  const { reviews, selectedId, select } = versions;
  if (!reviews || reviews.length === 0) return null;

  const scores = [...reviews]
    .reverse()
    .filter((r) => (r.status === 'DONE' || r.status === 'PARTIAL') && r.overallScore !== null)
    .map((r) => ({ versionNo: r.versionNo, score: r.overallScore as number }));
  const gain = scores.length >= 2 ? scores[scores.length - 1].score - scores[0].score : null;

  return (
    <PanelCard title="Versions" detail={String(reviews.length)} className="hidden xl:block">
      {gain !== null && (
        <div className="mb-3 flex items-center gap-3">
          <ScoreSparkline scores={scores} />
          <span className={`text-xs font-semibold tabular-nums ${gain > 0 ? 'text-primary-700' : gain < 0 ? 'text-red-700' : 'text-brand-600'}`}>
            {gain > 0 ? '+' : ''}{gain} since version {scores[0].versionNo}
          </span>
        </div>
      )}
      <ul className="-mx-2 flex flex-col gap-0.5">
        {reviews.map((review) => {
          const selected = review.id === selectedId;
          return (
            <li key={review.id}>
              <button
                type="button"
                onClick={() => select(review.id)}
                aria-pressed={selected}
                className={`w-full text-left flex items-center gap-3 px-2 py-2 rounded-md border ${
                  selected ? 'border-primary-300 bg-primary-50' : 'border-transparent hover:bg-brand-50'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-brand-900">
                    Version {review.versionNo}
                    <span className="font-normal text-brand-500"> · {review.level === 'FULL' ? 'AI review' : 'Instant'}</span>
                  </span>
                  <span className="block text-xs text-brand-500 tabular-nums">{formatDay(review.createdAt.slice(0, 10), false)}</span>
                </span>
                <ReviewOutcome review={review} />
              </button>
            </li>
          );
        })}
      </ul>
    </PanelCard>
  );
}
