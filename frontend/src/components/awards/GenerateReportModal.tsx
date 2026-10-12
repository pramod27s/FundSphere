import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ChevronDown, Loader2, TriangleAlert, X } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import {
  fetchAwardOutputs,
  generateReportDraft,
  type Award,
  type AwardOutput,
  type ComplianceEvent,
} from '../../services/awardsService';
import { formatDay } from '../../utils/applicationDates';
import { formatPartialDate, OUTPUT_META, outsidePeriod } from './awardMeta';

const INPUT =
  'w-full bg-white border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200';
const LABEL = 'block text-xs font-semibold text-brand-700 mb-1';
const CUSTOM = 'custom';

interface GenerateReportModalProps {
  award: Award;
  /** The report deadline to draft for; the first pending one when omitted. */
  eventId?: number;
  onClose: () => void;
}

function isReportEvent(event: ComplianceEvent) {
  return event.type === 'PROGRESS_REPORT' || event.type === 'FINAL_REPORT';
}

/**
 * 4.4: choose what a progress-report draft covers (a report deadline, or a
 * period of your own), which outputs go into it and anything else it should
 * say, then have it written. Only these records reach the draft.
 */
export default function GenerateReportModal({ award, eventId, onClose }: GenerateReportModalProps) {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const formId = useId();
  const [busy, setBusy] = useState(false);
  useDialog(dialogRef, () => !busy && onClose());

  const reportEvents = useMemo(() => award.events.filter(isReportEvent), [award.events]);
  const firstPending = reportEvents.find((e) => e.status === 'PENDING') ?? reportEvents[0];
  const [choice, setChoice] = useState<string>(
    eventId !== undefined ? String(eventId) : firstPending ? String(firstPending.id) : CUSTOM,
  );
  const [customStart, setCustomStart] = useState(award.startDate);
  const [customEnd, setCustomEnd] = useState(award.endDate);
  const [outputs, setOutputs] = useState<AwardOutput[] | null>(null);
  /** null until the PI ticks or unticks something: the defaults for the chosen period. */
  const [picked, setPicked] = useState<Set<number> | null>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [notes, setNotes] = useState('');

  const event = reportEvents.find((e) => String(e.id) === choice);
  const periodStart = event ? event.periodStart ?? award.startDate : customStart;
  const periodEnd = event ? event.periodEnd ?? award.endDate : customEnd;

  useEffect(() => {
    let cancelled = false;
    fetchAwardOutputs(award.id)
      .then((loaded) => !cancelled && setOutputs(loaded))
      .catch((e: unknown) => !cancelled && toast.error(e instanceof Error ? e.message : 'Could not load the outputs'));
    return () => {
      cancelled = true;
    };
  }, [award.id]);

  // Dated within the period, or undated (they may belong to it): ticked by default.
  const inPeriod = (outputs ?? []).filter((o) => o.date === null || !outsidePeriod(o.date, periodStart, periodEnd));
  const others = (outputs ?? []).filter((o) => o.date !== null && outsidePeriod(o.date, periodStart, periodEnd));
  const ticked = picked ?? new Set(inPeriod.map((o) => o.id));
  const customInvalid = choice === CUSTOM && (!customStart || !customEnd || customEnd <= customStart);

  const changePeriod = () => setPicked(null);

  const toggle = (id: number) => {
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const generate = async () => {
    setBusy(true);
    try {
      const outputIds = [...ticked];
      const draft = await generateReportDraft(
        award.id,
        choice === CUSTOM
          ? { kind: 'PROGRESS_REPORT', periodStart: customStart, periodEnd: customEnd, outputIds, notes: notes.trim() || null }
          : { eventId: Number(choice), outputIds, notes: notes.trim() || null },
      );
      navigate(`/my-grants/${award.id}/reports/${draft.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not write the draft');
      setBusy(false);
    }
  };

  const outputRow = (output: AwardOutput) => (
    <li key={output.id}>
      <label className="flex items-start gap-3 py-2 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5 w-4 h-4 accent-primary-600 shrink-0"
          checked={ticked.has(output.id)}
          onChange={() => toggle(output.id)}
          disabled={busy}
        />
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-brand-900">{output.title}</span>
          <span className="block text-xs text-brand-500">
            {OUTPUT_META[output.type].label}
            {' · '}
            {output.date ? formatPartialDate(output.date) : 'No date'}
          </span>
        </span>
      </label>
    </li>
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="fixed inset-0 bg-brand-950/60" onClick={() => !busy && onClose()} aria-hidden="true" />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white rounded-xl shadow-modal w-full max-w-2xl max-h-[90vh] flex flex-col relative z-10 ring-1 ring-brand-200/50"
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-brand-100">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-brand-900 tracking-tight">Draft a progress report</h2>
            <p className="text-xs text-brand-500 mt-1">
              The draft is written only from what you choose here. Every sentence shows the records it comes from.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded-full text-brand-500 hover:text-brand-700 hover:bg-brand-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5 overflow-y-auto">
          {award.objectives.length === 0 && (
            <p className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <TriangleAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
              The project's objectives aren't added yet, so the work done can't be described against them. Add them on
              the grant page first for a better draft.
            </p>
          )}

          <div>
            <label htmlFor={`${formId}-report`} className={LABEL}>Report</label>
            <select
              id={`${formId}-report`}
              className={INPUT}
              value={choice}
              disabled={busy}
              onChange={(e) => {
                setChoice(e.target.value);
                changePeriod();
              }}
            >
              {reportEvents.map((event) => (
                <option key={event.id} value={String(event.id)}>
                  {event.title}
                  {event.periodStart && event.periodEnd
                    ? ` (${formatDay(event.periodStart)} – ${formatDay(event.periodEnd)})`
                    : ''}
                  {event.status === 'SUBMITTED' ? ', submitted' : ''}
                </option>
              ))}
              <option value={CUSTOM}>A period of my own</option>
            </select>
            {choice === CUSTOM && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label htmlFor={`${formId}-start`} className={LABEL}>From</label>
                  <input
                    id={`${formId}-start`}
                    type="date"
                    className={INPUT}
                    value={customStart}
                    min={award.startDate}
                    max={award.endDate}
                    disabled={busy}
                    onChange={(e) => {
                      setCustomStart(e.target.value);
                      changePeriod();
                    }}
                  />
                </div>
                <div>
                  <label htmlFor={`${formId}-end`} className={LABEL}>To</label>
                  <input
                    id={`${formId}-end`}
                    type="date"
                    className={INPUT}
                    value={customEnd}
                    min={award.startDate}
                    max={award.endDate}
                    disabled={busy}
                    onChange={(e) => {
                      setCustomEnd(e.target.value);
                      changePeriod();
                    }}
                  />
                </div>
                {customInvalid && <p className="col-span-2 text-xs text-red-600">The period must end after it starts.</p>}
              </div>
            )}
          </div>

          <div>
            <h3 className={LABEL}>Outputs to include</h3>
            {outputs === null ? (
              <p className="flex items-center gap-2 text-sm text-brand-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading…
              </p>
            ) : outputs.length === 0 ? (
              <p className="text-sm text-brand-600">
                No outputs recorded yet. The draft will have only the fixed parts (details, objectives, budget) and
                places for you to fill in.
              </p>
            ) : (
              <>
                <p className="text-xs text-brand-500 mb-1">
                  Ticked: those dated within {formatDay(periodStart)} – {formatDay(periodEnd)}, and those without a date.
                </p>
                {inPeriod.length > 0 ? (
                  <ul className="flex flex-col divide-y divide-brand-100">{inPeriod.map(outputRow)}</ul>
                ) : (
                  <p className="text-sm text-brand-600 py-1">None is dated within this period.</p>
                )}
                {others.length > 0 && (
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={() => setShowOthers((v) => !v)}
                      aria-expanded={showOthers}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-900"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showOthers ? 'rotate-180' : ''}`} />
                      Dated outside this period ({others.length})
                    </button>
                    {showOthers && <ul className="flex flex-col divide-y divide-brand-100">{others.map(outputRow)}</ul>}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label htmlFor={`${formId}-notes`} className={LABEL}>Anything else the report should say (optional)</label>
            <textarea
              id={`${formId}-notes`}
              rows={3}
              className={INPUT}
              value={notes}
              disabled={busy}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Field trials were delayed by two months by the monsoon; the second site moved to Buxar."
              maxLength={3000}
            />
            <p className="text-[11px] text-brand-500 mt-1">
              Delays, changes to the plan, collaborations. The Deviations section is written only from this.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-brand-100">
          {busy && (
            <p className="flex-1 text-xs text-brand-600" role="status">
              Writing the draft. This can take a minute or two.
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={busy || outputs === null || customInvalid}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 shadow-xs"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Write the draft
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
