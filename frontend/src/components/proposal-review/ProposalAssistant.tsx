import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ArrowLeft, ArrowRight, ClipboardCheck, FileText } from 'lucide-react';
import {
  fetchStandaloneReviews,
  reviewStandalone,
  runFullReview,
  type ProposalReview,
} from '../../services/proposalReviewService';
import DraftUpload from './DraftUpload';
import ReviewStatusView from './ReviewStatusView';
import { useReview } from './useReview';

/**
 * The standalone Proposal page: check a draft against any call's guidelines
 * without starting an application. Inside an application, the Proposal tab
 * does the same with the guidelines already read.
 */
export default function ProposalAssistant() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<ProposalReview[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [startingFull, setStartingFull] = useState(false);
  const { review, error, reload } = useReview(selectedId);

  useEffect(() => {
    fetchStandaloneReviews().then(setRecent).catch(() => setRecent([]));
  }, [review?.status]);

  const start = async ({ proposal, guidelines, grantTitle, level }: {
    proposal: File; guidelines: File | null; grantTitle: string; level: 'INSTANT' | 'FULL';
  }) => {
    if (!guidelines) return;
    setStarting(true);
    try {
      const created = await reviewStandalone(proposal, guidelines, { grantTitle, level });
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
    <div className="min-h-screen flex flex-col">
      <div className="bg-white border-b border-brand-200 px-4 sm:px-6 h-16 flex items-center gap-4 sticky top-0 z-30">
        <button onClick={() => navigate('/discovery')}
          className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-900 px-2 py-1.5 -ml-2 rounded-lg hover:bg-brand-100">
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <div className="h-5 w-px bg-brand-200" />
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center shadow-xs shrink-0">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-brand-900 tracking-tight leading-none truncate">Proposal Assistant</h1>
            <p className="text-xs text-brand-600 mt-1 leading-none truncate">Check a draft against a call's rules and marking criteria</p>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:py-8 flex flex-col gap-5">
        <div className="rounded-lg border border-brand-200 bg-white px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <ClipboardCheck className="w-4 h-4 mt-0.5 text-primary-600 shrink-0" />
            <p className="text-sm text-brand-700">
              Preparing an application? Use its <strong>Proposal</strong> tab instead: the guidelines are read once and every draft version is kept.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/applications')}
            className="self-start sm:self-auto ml-6.5 sm:ml-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-primary-700 bg-white border border-primary-200 hover:bg-primary-50 shrink-0"
          >
            Go to Apply
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <DraftUpload withGuidelines busy={starting} onStart={start} />

        {recent.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="Recent reviews">
            {recent.map((r) => (
              <button key={r.id} type="button" onClick={() => setSelectedId(r.id)}
                className={`shrink-0 max-w-[16rem] px-3 py-2 rounded-lg border text-left ${r.id === selectedId ? 'border-primary-400 bg-primary-50' : 'border-brand-200 bg-white hover:bg-brand-50'}`}>
                <span className="block text-xs font-semibold text-brand-900 truncate">{r.grantTitle || r.proposalFileName || `Review ${r.id}`}</span>
                <span className="block text-[11px] text-brand-500 tabular-nums">
                  {r.status === 'RUNNING' ? 'Running…' : r.status === 'FAILED' ? 'Failed'
                    : r.overallScore !== null ? `${r.overallScore}/100` : `${r.rulesMet ?? 0}/${r.rulesTotal ?? 0} rules`}
                </span>
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-red-800">{error}</p>}
        {review && <ReviewStatusView review={review} onRunFull={upgrade} startingFull={startingFull} />}
      </div>
    </div>
  );
}
