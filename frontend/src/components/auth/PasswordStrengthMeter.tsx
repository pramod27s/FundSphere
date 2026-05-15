import { useEffect, useMemo } from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import {
  evaluatePasswordStrength,
  type PasswordContext,
  type PasswordScore,
} from '../../utils/passwordStrength';

interface PasswordStrengthMeterProps {
  password: string;
  context?: PasswordContext;
  /**
   * Optional callback so the parent form can disable submit when the
   * score falls below its threshold.
   */
  onScoreChange?: (score: PasswordScore) => void;
}

/**
 * Four-segment strength bar + dynamic feedback line. Re-renders cheaply —
 * the underlying evaluator is pure regex and a Set lookup, no async deps.
 */
export default function PasswordStrengthMeter({
  password,
  context,
  onScoreChange,
}: PasswordStrengthMeterProps) {
  const result = useMemo(
    () => evaluatePasswordStrength(password, context ?? {}),
    [password, context],
  );

  // Notify parent of score changes via effect (not during render).
  useEffect(() => {
    onScoreChange?.(result.score);
  }, [result.score, onScoreChange]);

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1.5" aria-live="polite">
      <div className="flex gap-1" role="meter" aria-valuenow={result.score} aria-valuemin={0} aria-valuemax={4} aria-label={`Password strength: ${result.label}`}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
              i < Math.max(1, result.score) ? result.color : 'bg-brand-100'
            }`}
          />
        ))}
      </div>

      <div className="flex items-start justify-between gap-3 text-xs">
        <span className={`font-semibold ${labelTone(result.score)}`}>
          {result.score >= 3 ? (
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> {result.label}
            </span>
          ) : (
            result.label
          )}
        </span>
      </div>

      {result.warning && (
        <p className="text-xs text-red-700 flex items-start gap-1.5 leading-snug">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{result.warning}</span>
        </p>
      )}

      {!result.warning && result.suggestions.length > 0 && (
        <ul className="text-xs text-brand-600 space-y-0.5 leading-snug">
          {result.suggestions.map((s, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="text-brand-400 select-none">·</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function labelTone(score: PasswordScore): string {
  if (score === 0) return 'text-red-600';
  if (score === 1) return 'text-orange-600';
  if (score === 2) return 'text-amber-600';
  if (score === 3) return 'text-lime-700';
  return 'text-emerald-700';
}
