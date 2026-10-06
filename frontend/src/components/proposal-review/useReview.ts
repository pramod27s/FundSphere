import { useEffect, useState } from 'react';
import { waitForReview, type ProposalReview } from '../../services/proposalReviewService';

/**
 * Loads one review and keeps polling while it runs. `reload()` starts polling
 * again, e.g. after asking for a Full review of the same draft.
 */
export function useReview(reviewId: number | null) {
  const [review, setReview] = useState<ProposalReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (reviewId === null) return;
    const controller = new AbortController();
    waitForReview(
      reviewId,
      (r) => {
        setReview(r);
        setError(null);
      },
      controller.signal,
    ).catch((e: unknown) => {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load the review');
    });
    return () => controller.abort();
  }, [reviewId, generation]);

  return {
    // Hide a review from a previous id until the new one has loaded.
    review: review && review.id === reviewId ? review : null,
    error,
    reload: () => setGeneration((g) => g + 1),
  };
}
