/**
 * Relative-deadline formatter. Renders grant deadlines as actionable
 * countdowns ("Closes in 4 weeks") rather than abstract dates
 * ("Due Jun 12, 2026") — Indian researchers care about urgency far more
 * than the calendar.
 *
 * Strategy:
 *  - Past → "Closed" (overdue tone for greyed/red treatment)
 *  - Today / tomorrow → spelled out
 *  - ≤ 30 days → days
 *  - ≤ 365 days → weeks (under 8) then months
 *  - > 1 year out → fall back to the absolute date — relative units lie
 *    at that range ("in 14 months" reads worse than "Jun 2027")
 *
 * The tooltip always carries the absolute date so users can verify.
 */

const DAY = 86_400_000;

export type DeadlineTone = 'overdue' | 'urgent' | 'soon' | 'normal' | 'unknown';

export interface DeadlineFormat {
  /** Short label suitable for chips: e.g. "Closes in 4 weeks" */
  label: string;
  /** Urgency tone so the UI can color/style it. */
  tone: DeadlineTone;
  /** Full ISO-ish date for the `title` tooltip — empty when unknown. */
  tooltip: string;
  /** True when the deadline has passed. */
  isClosed: boolean;
}

export function formatRelativeDeadline(raw: string | undefined | null): DeadlineFormat {
  if (!raw) {
    return { label: 'Deadline TBD', tone: 'unknown', tooltip: '', isClosed: false };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { label: 'Deadline TBD', tone: 'unknown', tooltip: raw, isClosed: false };
  }

  const tooltip = parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const now = Date.now();
  const target = parsed.getTime();
  const diffMs = target - now;

  if (diffMs < 0) {
    return { label: 'Closed', tone: 'overdue', tooltip, isClosed: true };
  }

  const days = Math.ceil(diffMs / DAY);

  if (days === 0) return { label: 'Closes today', tone: 'urgent', tooltip, isClosed: false };
  if (days === 1) return { label: 'Closes tomorrow', tone: 'urgent', tooltip, isClosed: false };
  if (days <= 7) return { label: `Closes in ${days} days`, tone: 'urgent', tooltip, isClosed: false };
  if (days <= 30) {
    const weeks = Math.round(days / 7);
    return {
      label: weeks === 1 ? 'Closes in 1 week' : `Closes in ${weeks} weeks`,
      tone: 'soon',
      tooltip,
      isClosed: false,
    };
  }
  if (days <= 365) {
    const months = Math.round(days / 30);
    return {
      label: months === 1 ? 'Closes in 1 month' : `Closes in ${months} months`,
      tone: 'normal',
      tooltip,
      isClosed: false,
    };
  }

  // Far future: relative units stop being useful. Fall back to the date.
  return {
    label: `Closes ${parsed.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
    })}`,
    tone: 'normal',
    tooltip,
    isClosed: false,
  };
}

/**
 * Tailwind class fragments for the chip's text + bg + border, keyed on
 * tone. Kept here so every consumer renders deadlines consistently.
 */
export const DEADLINE_TONE_CLASSES: Record<DeadlineTone, string> = {
  overdue: 'bg-red-50 text-red-700 border-red-200',
  urgent: 'bg-amber-50 text-amber-800 border-amber-200',
  soon: 'bg-brand-50 text-brand-700 border-brand-200',
  normal: 'bg-brand-50/80 text-brand-700 border-brand-100',
  unknown: 'bg-brand-50/60 text-brand-500 border-brand-100',
};
