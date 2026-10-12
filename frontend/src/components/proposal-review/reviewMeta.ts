/** Score colour; the same thresholds as the score in the review report. */
export function scoreTone(score: number): string {
  return score >= 75 ? 'text-primary-700' : score >= 50 ? 'text-amber-700' : 'text-red-700';
}
