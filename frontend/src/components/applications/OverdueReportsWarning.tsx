import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import type { OverdueReport } from '../../hooks/useOverdueReports';
import { formatDay } from '../../utils/applicationDates';

/**
 * Warns before applying that a UC, SE or final report on one of the user's
 * grants is overdue (fable.md §7). Each item links to its grant, where it
 * can be marked submitted. Renders nothing when there's nothing overdue.
 */
export default function OverdueReportsWarning({ overdue, compact = false }: {
  overdue: OverdueReport[];
  /** Tighter spacing, for inside a form. */
  compact?: boolean;
}) {
  if (overdue.length === 0) return null;
  const heading = overdue.length === 1
    ? 'A report on one of your grants is overdue'
    : `${overdue.length} reports on your grants are overdue`;

  return (
    <div
      role="status"
      className={`rounded-lg border border-amber-200 bg-amber-50 text-amber-900 ${compact ? 'px-3 py-2.5' : 'px-4 py-3 mb-5'}`}
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <TriangleAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
        {heading}
      </p>
      <p className="text-xs mt-1">
        Some agencies, ICMR for example, ask you to certify when applying that no utilisation certificate or final
        report is pending. Submit it before you apply, or mark it submitted in My grants if you already have.
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {overdue.map((report) => (
          <li key={report.eventId} className="text-xs">
            <Link
              to={`/my-grants/${report.awardId}`}
              className="font-semibold underline underline-offset-2 hover:text-amber-950"
            >
              {report.title}
            </Link>
            <span>
              {' '}· {report.projectTitle}
              {report.agency && ` (${report.agency})`} · due {formatDay(report.dueDate)},{' '}
              {report.daysOverdue === 1 ? '1 day' : `${report.daysOverdue} days`} overdue
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
