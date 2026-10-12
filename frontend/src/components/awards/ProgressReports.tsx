import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FileText, Loader2, Sparkles } from 'lucide-react';
import { fetchReportDrafts, type Award, type ReportDraft } from '../../services/awardsService';
import { formatDay, formatTimestampDay } from '../../utils/applicationDates';

/**
 * 4.4: the grant's progress-report drafts, newest first, each with how many
 * sentences still aren't supported by the records and how many places are
 * left for the PI to fill in.
 */
export default function ProgressReports({ award, onDraft }: { award: Award; onDraft: () => void }) {
  const [drafts, setDrafts] = useState<ReportDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchReportDrafts(award.id)
      .then((loaded) => !cancelled && setDrafts(loaded))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load the drafts'));
    return () => {
      cancelled = true;
    };
  }, [award.id]);

  return (
    <section className="bg-white border border-brand-200 rounded-xl p-5 sm:p-6 shadow-xs mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-brand-900 tracking-tight">Progress reports</h2>
          <p className="text-xs text-brand-500 mt-0.5">
            Drafts written from your objectives and outputs. Every sentence shows the records it comes from.
          </p>
        </div>
        <button
          type="button"
          onClick={onDraft}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Draft a report
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : drafts === null ? (
        <p className="flex items-center gap-2 text-sm text-brand-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </p>
      ) : drafts.length === 0 ? (
        <p className="text-sm text-brand-600">
          No drafts yet. Record your outputs, then draft the report for any reporting deadline.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-brand-100">
          {drafts.map((draft) => (
            <li key={draft.id}>
              <Link
                to={`/my-grants/${award.id}/reports/${draft.id}`}
                className="flex items-center gap-3 py-3 group"
              >
                <FileText className="w-4 h-4 text-brand-400 shrink-0" aria-hidden="true" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-brand-900 group-hover:text-primary-700">{draft.title}</span>
                  <span className="block text-xs text-brand-500">
                    {formatDay(draft.periodStart)} – {formatDay(draft.periodEnd)} · drafted {formatTimestampDay(draft.createdAt)}
                  </span>
                </span>
                <DraftStatus draft={draft} />
                <ChevronRight className="w-4 h-4 text-brand-400 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** "2 unsupported" in red, "1 kept by you", "3 to fill in" in amber, or "Every line traced" in green. */
export function DraftStatus({
  draft,
}: {
  draft: Pick<ReportDraft, 'unsupportedCount' | 'placeholderCount' | 'confirmedCount'>;
}) {
  const chip = 'shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap';
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {draft.unsupportedCount > 0 && (
        <span className={`${chip} bg-red-50 text-red-700 border-red-200`}>{draft.unsupportedCount} unsupported</span>
      )}
      {draft.confirmedCount > 0 && (
        <span className={`${chip} bg-brand-100 text-brand-700 border-brand-200`}>{draft.confirmedCount} kept by you</span>
      )}
      {draft.unsupportedCount === 0 && draft.confirmedCount === 0 && (
        <span className={`${chip} bg-primary-50 text-primary-700 border-primary-200`}>Every line traced</span>
      )}
      {draft.placeholderCount > 0 && (
        <span className={`${chip} bg-amber-50 text-amber-800 border-amber-200`}>{draft.placeholderCount} to fill in</span>
      )}
    </span>
  );
}
