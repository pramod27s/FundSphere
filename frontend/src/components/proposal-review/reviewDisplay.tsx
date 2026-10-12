import type { ProposalReview } from '../../services/proposalReviewService';
import { scoreTone } from './reviewMeta';

/** A check's outcome in a list: the score, or the rules met for an instant check. */
export function ReviewOutcome({ review }: { review: ProposalReview }) {
  if (review.status === 'RUNNING') return <span className="shrink-0 text-xs text-brand-500">Checking…</span>;
  if (review.status === 'FAILED') return <span className="shrink-0 text-xs font-semibold text-red-700">Failed</span>;
  if (review.overallScore !== null) {
    return (
      <span className="shrink-0 flex items-baseline gap-0.5">
        <span className={`text-base font-bold tabular-nums ${scoreTone(review.overallScore)}`}>{review.overallScore}</span>
        <span className="text-[11px] text-brand-500">/100</span>
      </span>
    );
  }
  return (
    <span className="shrink-0 text-xs text-brand-600 tabular-nums" title="Instant check: rules only, no score">
      {review.rulesMet ?? 0}/{review.rulesTotal ?? 0} rules
    </span>
  );
}

/** Score by version: earlier versions in a muted line, the latest as an accent dot. */
export function ScoreSparkline({ scores }: { scores: { versionNo: number; score: number }[] }) {
  const W = 96;
  const H = 28;
  const PAD = 4;
  const values = scores.map((s) => s.score);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  // At least a 20-point window, so a 2-point wobble doesn't look like a cliff.
  if (hi - lo < 20) {
    const mid = (hi + lo) / 2;
    lo = mid - 10;
    hi = mid + 10;
  }
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (scores.length - 1);
  const y = (v: number) => H - PAD - ((v - lo) * (H - 2 * PAD)) / (hi - lo);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Score by version: ${values.join(', ')}`} className="overflow-visible">
      <polyline
        points={scores.map((s, i) => `${x(i)},${y(s.score)}`).join(' ')}
        fill="none"
        className="stroke-brand-300"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {scores.map((s, i) => {
        const last = i === scores.length - 1;
        return (
          <g key={s.versionNo}>
            <circle
              cx={x(i)}
              cy={y(s.score)}
              r={last ? 4 : 2.5}
              className={last ? 'fill-primary-600 stroke-white' : 'fill-brand-400'}
              strokeWidth={last ? 2 : 0}
            />
            {/* Larger invisible target for the hover tooltip. */}
            <circle cx={x(i)} cy={y(s.score)} r={8} fill="transparent">
              <title>{`Version ${s.versionNo}: ${s.score}/100`}</title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
}
