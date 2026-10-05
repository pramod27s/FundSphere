interface MatchScoreDialProps {
  /** 0–100 match score. */
  score: number;
  size?: 'sm' | 'md';
}

/**
 * Circular match-score dial. The single most important number on a grant
 * card, so it gets its own visual weight instead of competing as one more
 * pill among many.
 */
export default function MatchScoreDial({ score, size = 'md' }: MatchScoreDialProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const box = size === 'sm' ? 'w-12 h-12' : 'w-14 h-14';
  const stroke = clamped >= 85 ? 'stroke-primary-500' : clamped >= 70 ? 'stroke-primary-400' : 'stroke-brand-400';

  return (
    <div className={`relative shrink-0 ${box}`} role="img" aria-label={`${clamped}% match`}>
      <svg viewBox="0 0 48 48" className={`${box} -rotate-90`} aria-hidden="true">
        <circle cx="24" cy="24" r={radius} fill="none" strokeWidth="4" className="stroke-brand-100" />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-bold text-brand-900 tabular-nums ${size === 'sm' ? 'text-sm' : 'text-base'}`}>
        {clamped}
        <span className="text-[11px] font-semibold text-brand-500">%</span>
      </span>
    </div>
  );
}
