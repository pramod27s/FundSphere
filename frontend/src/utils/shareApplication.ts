/**
 * Sharing and reminders for an application (3.4).
 *
 * The pending list goes straight to wa.me (not the system share sheet) so
 * "Send to WhatsApp" opens WhatsApp on both phone and desktop; the PI then
 * picks the lab group. Uses WhatsApp's *asterisk* bold.
 */
import type { Application, ChecklistItem } from '../services/applicationsService';
import { daysUntil, deadlineCountdown, formatDay, todayIso } from './applicationDates';
import { openWhatsApp } from './shareGrant';

const UNASSIGNED = 'Unassigned';

export function buildPendingListMessage(application: Application, items: ChecklistItem[]): string {
  const pending = items.filter((item) => item.status === 'TODO');
  const today = todayIso();
  const lines: string[] = [`*${application.title}*: pending items`];

  if (application.deadline) {
    lines.push(`Deadline: ${formatDay(application.deadline)} (${deadlineCountdown(application.deadline).label})`);
  }
  const { mandatoryDone, mandatoryTotal, percent } = application.readiness;
  if (percent !== null) {
    lines.push(`Ready: ${mandatoryDone} of ${mandatoryTotal} required items done (${percent}%)`);
  }

  if (pending.length === 0) {
    lines.push('', 'Nothing pending. Everything is done!');
  }

  const byOwner = new Map<string, ChecklistItem[]>();
  for (const item of pending) {
    const owner = item.ownerName?.trim() || UNASSIGNED;
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), item]);
  }
  const owners = [...byOwner.keys()].sort((a, b) =>
    a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b),
  );

  for (const owner of owners) {
    lines.push('', `*${owner}*`);
    const ownerItems = [...byOwner.get(owner)!].sort(
      (a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31'),
    );
    for (const item of ownerItems) {
      let due = '';
      if (item.dueDate) {
        due = daysUntil(item.dueDate, today) < 0
          ? ` (OVERDUE, was due ${formatDay(item.dueDate, false)})`
          : ` (due ${formatDay(item.dueDate, false)})`;
      }
      const optional = item.mandatory ? '' : ' [optional]';
      lines.push(`• ${item.text}${optional}${due}`);
    }
  }

  lines.push('', 'Sent from FundSphere');
  return lines.join('\n');
}

export function sendPendingListToWhatsApp(application: Application, items: ChecklistItem[]): void {
  openWhatsApp(buildPendingListMessage(application, items));
}

/**
 * Google Calendar "add event" link for the call deadline (an all-day
 * event). Works on phones without importing a file.
 */
export function googleCalendarDeadlineUrl(application: Application): string | null {
  if (!application.deadline) return null;
  const start = application.deadline.replaceAll('-', '');
  const [y, m, d] = application.deadline.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replaceAll('-', '');
  const details = [
    application.agency ? `Agency: ${application.agency}` : '',
    application.callUrl ? `Call: ${application.callUrl}` : '',
    'Added from FundSphere',
  ].filter(Boolean).join('\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Deadline: ${application.title}`,
    dates: `${start}/${next}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
