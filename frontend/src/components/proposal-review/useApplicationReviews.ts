import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { fetchApplicationReviews, type ProposalReview } from '../../services/proposalReviewService';

export interface ApplicationReviews {
  /** Newest first; null until loaded. */
  reviews: ProposalReview[] | null;
  selectedId: number | null;
  select: (reviewId: number) => void;
  /** Fetches the list again, keeping the selection. */
  reload: () => Promise<void>;
  /** Puts a review that just started on top and selects it. */
  add: (review: ProposalReview) => void;
}

/**
 * An application's draft versions and the one on screen. Held by the
 * application page so the Proposal tab and the side panel's version list
 * share them; loads the first time `enabled` is true (the tab is opened).
 */
export function useApplicationReviews(applicationId: number, enabled: boolean): ApplicationReviews {
  const [forId, setForId] = useState(applicationId);
  const [reviews, setReviews] = useState<ProposalReview[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Another application opened on the same page: start again.
  if (forId !== applicationId) {
    setForId(applicationId);
    setReviews(null);
    setSelectedId(null);
  }

  const loaded = reviews !== null;
  useEffect(() => {
    if (!enabled || loaded) return;
    let cancelled = false;
    fetchApplicationReviews(applicationId)
      .then((rows) => {
        if (cancelled) return;
        setReviews(rows);
        setSelectedId(rows[0]?.id ?? null);
      })
      .catch(() => !cancelled && setReviews([]));
    return () => {
      cancelled = true;
    };
  }, [applicationId, enabled, loaded]);

  const reload = useCallback(async () => {
    try {
      const rows = await fetchApplicationReviews(applicationId);
      setReviews(rows);
      setSelectedId((current) => current ?? rows[0]?.id ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load the reviews');
      setReviews([]);
    }
  }, [applicationId]);

  const add = useCallback((review: ProposalReview) => {
    setReviews((rows) => [review, ...(rows ?? [])]);
    setSelectedId(review.id);
  }, []);

  return { reviews, selectedId, select: setSelectedId, reload, add };
}
