/**
 * Date helpers for applications and checklist items. The backend sends
 * plain dates ("2026-11-15"); `new Date("2026-11-15")` would read that as
 * UTC midnight and can shift the day, so these work in local calendar days.
 */

export type DateTone = 'overdue' | 'urgent' | 'soon' | 'normal' | 'done' | 'none';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Today's date as YYYY-MM-DD in local time. */
export function todayIso(): string {
  return toIso(new Date());
}

export function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole calendar days from today to `iso` (negative when past). */
export function daysUntil(iso: string, today: string = todayIso()): number {
  return Math.round((utcDay(iso) - utcDay(today)) / 86_400_000);
}

function utcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** "15 Nov 2026", or "15 Nov" when `withYear` is false. */
export function formatDay(iso: string, withYear = true): string {
  const [y, m, d] = iso.split('-').map(Number);
  return withYear ? `${d} ${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`;
}

/** Countdown to the call deadline, e.g. "12 days left". */
export function deadlineCountdown(deadline: string | null): { label: string; tone: DateTone } {
  if (!deadline) return { label: 'No deadline set', tone: 'none' };
  const days = daysUntil(deadline);
  if (days < 0) return { label: 'Deadline passed', tone: 'overdue' };
  if (days === 0) return { label: 'Due today', tone: 'urgent' };
  if (days === 1) return { label: '1 day left', tone: 'urgent' };
  if (days <= 7) return { label: `${days} days left`, tone: 'urgent' };
  if (days <= 30) return { label: `${days} days left`, tone: 'soon' };
  return { label: `${days} days left`, tone: 'normal' };
}

/** Due-date label for a checklist item, e.g. "Overdue by 2 days". */
export function dueLabel(dueDate: string | null, done: boolean): { label: string; tone: DateTone } {
  if (!dueDate) return { label: 'No due date', tone: 'none' };
  if (done) return { label: `Due ${formatDay(dueDate, false)}`, tone: 'done' };
  const days = daysUntil(dueDate);
  if (days < 0) return { label: `Overdue by ${-days} ${-days === 1 ? 'day' : 'days'}`, tone: 'overdue' };
  if (days === 0) return { label: 'Due today', tone: 'urgent' };
  if (days === 1) return { label: 'Due tomorrow', tone: 'urgent' };
  if (days <= 7) return { label: `Due in ${days} days`, tone: 'soon' };
  return { label: `Due ${formatDay(dueDate, false)}`, tone: 'normal' };
}

export const TONE_TEXT: Record<DateTone, string> = {
  overdue: 'text-red-700',
  urgent: 'text-amber-800',
  soon: 'text-amber-700',
  normal: 'text-brand-700',
  done: 'text-brand-500',
  none: 'text-brand-500',
};

/** "5 Oct 2026" from a LocalDateTime string such as "2026-10-05T20:21:56". */
export function formatTimestampDay(value: string | null | undefined): string {
  if (!value) return '';
  return formatDay(value.slice(0, 10));
}
