import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { FileSearch, Loader2 } from 'lucide-react';
import type { Application } from '../../services/applicationsService';
import {
  fetchApplicationReviews,
  fetchReview,
  reviewDraftForApplication,
  runFullReview,
  type ProposalReview,
} from '../../services/proposalReviewService';
import DraftUpload from './DraftUpload';
import ReviewStatusView from './ReviewStatusView';
import { useReview } from './useReview';

interface ProposalTabProps {
  application: Application;
  onOpenChecklist: () => void;
}

/**
 * Proposal Assistant inside an application: drafts are checked against the
 * guidelines already read for the checklist, and every version is kept so
 * the score trend shows how the proposal improves.
 */
export default function ProposalTab({ application, onOpenChecklist }: ProposalTabProps) {
  const [reviews, setReviews] = useState<ProposalReview[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [startingFull, setStartingFull] = useState(false);
  const [previous, setPrevious] = useState<ProposalReview | null>(null);
  const { review, error, reload } = useReview(selectedId);

  const loadList = useCallback(async () => {
    try {
      const rows = await fetchApplicationReviews(application.id);
      setReviews(rows);
      setSelectedId((current) => current ?? rows[0]?.id ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load the reviews');
      setReviews([]);
    }
  }, [application.id]);

  useEffect(() => {
    fetchApplicationReviews(application.id)
      .then((rows) => {
        setReviews(rows);
        setSelectedId(rows[0]?.id ?? null);
      })
      .catch(() => setReviews([]));
  }, [application.id]);

  // Refresh the history when the selected review finishes, so its score shows in the list.
  const finished = review !== null && review.status !== 'RUNNING';
  useEffect(() => {
    if (finished) void loadList();
  }, [finished, loadList]);

  // The previous finished version of this application, for "what changed".
  const previousId = reviews && review
    ? reviews.find((r) => r.versionNo < review.versionNo && (r.status === 'DONE' || r.status === 'PARTIAL'))?.id ?? null
    : null;
  useEffect(() => {
    if (previousId === null) return;
    let cancelled = false;
    fetchReview(previousId).then((r) => !cancelled && setPrevious(r)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [previousId]);

  if (!application.guidelineExtractionId) {
    return (
      <div className="rounded-xl border border-brand-200 bg-white p-8 text-center flex flex-col items-center gap-3">
        <FileSearch className="w-8 h-8 text-brand-300" />
        <p className="text-sm text-brand-700 max-w-md">
          Read the call's guidelines in the Checklist tab first. Your drafts are then checked against the same rules, with no need to upload the guidelines again.
        </p>
        <button type="button" onClick={onOpenChecklist} className="px-4 py-2 rounded-lg text-sm font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100">
          Go to the checklist
        </button>
      </div>
    );
  }

  const start = async ({ proposal, level }: { proposal: File; level: 'INSTANT' | 'FULL' }) => {
    setStarting(true);
    try {
      const created = await reviewDraftForApplication(application.id, proposal, level);
      setReviews((rows) => [created, ...(rows ?? [])]);
      setSelectedId(created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start the review');
    } finally {
      setStarting(false);
    }
  };

  const upgrade = async () => {
    if (!review) return;
    setStartingFull(true);
    try {
      await runFullReview(review.id);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start the AI review');
    } finally {
      setStartingFull(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <DraftUpload busy={starting} onStart={start} />

      {reviews === null ? (
        <div className="flex items-center justify-center py-10 text-brand-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading reviews…
        </div>
      ) : reviews.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Draft versions">
          {reviews.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={r.id === selectedId}
              onClick={() => setSelectedId(r.id)}
              className={`shrink-0 px-3 py-2 rounded-lg border text-left transition ${
                r.id === selectedId ? 'border-primary-400 bg-primary-50' : 'border-brand-200 bg-white hover:bg-brand-50'
              }`}
            >
              <span className="block text-xs font-semibold text-brand-900">
                Version {r.versionNo}
                <span className="font-normal text-brand-500"> · {r.level === 'FULL' ? 'AI review' : 'Instant'}</span>
              </span>
              <span className="block text-[11px] text-brand-500 tabular-nums">
                {r.status === 'RUNNING' ? 'Running…' : r.status === 'FAILED' ? 'Failed'
                  : r.overallScore !== null ? `${r.overallScore}/100` : `${r.rulesMet ?? 0}/${r.rulesTotal ?? 0} rules`}
                {' · '}{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-800">{error}</p>}
      {review && (
        <ReviewStatusView
          review={review}
          previous={previous && previous.id === previousId ? previous : null}
          onRunFull={upgrade}
          startingFull={startingFull}
        />
      )}
    </div>
  );
}
