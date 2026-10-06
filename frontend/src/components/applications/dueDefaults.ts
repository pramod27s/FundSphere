import type { ChecklistItem } from '../../services/applicationsService';
import { toIso } from '../../utils/applicationDates';

/** Same defaults as the backend's ChecklistDueDates. */
export const SIGN_OFF_DAYS_BEFORE = 7;
export const DEFAULT_DAYS_BEFORE = 3;

export function dueHint(daysBefore: number): string {
  return `${daysBefore} days before the deadline`;
}

/**
 * The item's default due date, and whether a "reset to default" makes
 * sense. Not offered for AI items whose date comes from the guidelines
 * themselves (fixed date, no offset).
 */
export function dueDefaults(item: ChecklistItem, deadline: string | null): {
  defaultOffset: number;
  defaultDate: string | null;
  canReset: boolean;
} {
  const defaultOffset = item.signOff ? SIGN_OFF_DAYS_BEFORE : DEFAULT_DAYS_BEFORE;
  if (!deadline) return { defaultOffset, defaultDate: null, canReset: false };
  const [y, m, d] = deadline.split('-').map(Number);
  const defaultDate = toIso(new Date(y, m - 1, d - defaultOffset));
  const ownDateFromGuidelines = item.origin === 'AI' && item.dueOffsetDays === null && item.dueDate !== null;
  return {
    defaultOffset,
    defaultDate,
    canReset: !ownDateFromGuidelines && item.status === 'TODO' && item.dueDate !== defaultDate,
  };
}
