import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, XCircle } from 'lucide-react';
import type { ProposalReview } from '../../services/proposalReviewService';
import ReviewReport from './ReviewReport';

interface ReviewStatusViewProps {
  review: ProposalReview;
  previous?: ProposalReview | null;
  onRunFull: () => void;
  startingFull: boolean;
}

/** A review in any state: running (with progress), failed (with retry), or finished (the report). */
export default function ReviewStatusView({ review, previous, onRunFull, startingFull }: ReviewStatusViewProps) {
  if (review.status === 'RUNNING') return <Progress review={review} />;
  if (review.status === 'FAILED') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 flex flex-col sm:flex-row sm:items-center gap-3">
        <XCircle className="w-5 h-5 text-red-600 shrink-0" />
        <p className="flex-1 text-sm text-red-900">{review.errorMessage ?? 'The review failed.'}</p>
        {review.result && (
          <button type="button" onClick={onRunFull} disabled={startingFull}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-red-800 bg-white border border-red-200 hover:bg-red-100">
            <RotateCcw className="w-4 h-4" />
            Try again
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {review.status === 'PARTIAL' && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="flex-1">Some parts couldn't be evaluated (listed below). They aren't counted in the score.</span>
          <button type="button" onClick={onRunFull} disabled={startingFull}
            className="inline-flex items-center gap-1.5 font-semibold underline underline-offset-2 disabled:opacity-50">
            <RotateCcw className="w-3.5 h-3.5" />
            Retry the missing parts
          </button>
        </div>
      )}
      <ReviewReport review={review} previous={previous} onRunFull={onRunFull} runningFull={startingFull} />
    </div>
  );
}

const STAGES: Record<string, string> = {
  READING_GUIDELINES: 'Reading the call guidelines and their rules…',
  REVIEWING_INSTANT: 'Measuring pages, fonts, sections and the budget…',
  REVIEWING_FULL: 'The AI is reviewing the proposal against the rules and marking criteria…',
};

function Progress({ review }: { review: ProposalReview }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [review.id]);
  const key = review.stage === 'READING_GUIDELINES' ? 'READING_GUIDELINES' : `REVIEWING_${review.level}`;
  return (
    <div className="rounded-xl border border-primary-200 bg-white p-6 flex items-center gap-3" aria-live="polite">
      <Loader2 className="w-5 h-5 text-primary-600 animate-spin shrink-0" />
      <p className="flex-1 text-sm text-brand-800">{STAGES[key]}</p>
      <span className="text-xs text-brand-400 tabular-nums">{elapsed}s</span>
    </div>
  );
}
