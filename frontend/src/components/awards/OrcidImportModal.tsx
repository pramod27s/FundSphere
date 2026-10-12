import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import {
  fetchOrcidWorks,
  importOrcidWorks,
  type Award,
  type AwardOutput,
  type OrcidWork,
  type OrcidWorks,
} from '../../services/awardsService';
import { formatDay } from '../../utils/applicationDates';
import { formatPartialDate, OUTPUT_META } from './awardMeta';

interface OrcidImportModalProps {
  award: Award;
  onClose: () => void;
  /** The grant's whole output list after the import, and how many works were added. */
  onImported: (outputs: AwardOutput[], added: number) => void;
}

/**
 * 4.4: lists the works on the PI's ORCID record so they can tick the ones
 * from this grant. Works dated within the project come first; the rest
 * (older, later, undated) fold away. The server fetches the ticked works
 * again from ORCID, so what's stored is what the record says.
 */
export default function OrcidImportModal({ award, onClose, onImported }: OrcidImportModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const formId = useId();
  useDialog(dialogRef, onClose);

  const [data, setData] = useState<OrcidWorks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** The iD the PI typed, if not the profile's; sent with the import so the server can remember it. */
  const [typedId, setTypedId] = useState<string | undefined>(undefined);
  const [idInput, setIdInput] = useState('');
  const [changingId, setChangingId] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [showOthers, setShowOthers] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOrcidWorks(award.id)
      .then((loaded) => !cancelled && setData(loaded))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load your ORCID works'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [award.id]);

  const lookUp = async (e: FormEvent) => {
    e.preventDefault();
    const id = idInput.trim();
    if (!id) {
      toast.error('Enter your ORCID iD, for example 0000-0002-1825-0097');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await fetchOrcidWorks(award.id, id));
      setTypedId(id);
      setTicked(new Set());
      setChangingId(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your ORCID works');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (putCode: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(putCode)) next.delete(putCode);
      else next.add(putCode);
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      onImported(await importOrcidWorks(award.id, [...ticked], typedId), ticked.size);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the works');
      setSaving(false);
    }
  };

  const works = data?.works ?? [];
  const inPeriod = works.filter((w) => w.inPeriod === true);
  const others = works.filter((w) => w.inPeriod !== true);
  const askForId = !loading && (changingId || (data !== null && data.orcidId === null) || (data === null && error !== null));

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="fixed inset-0 bg-brand-950/60" onClick={onClose} aria-hidden="true" />
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
            <h2 id={titleId} className="text-lg font-bold text-brand-900 tracking-tight">Import papers from ORCID</h2>
            <p className="text-xs text-brand-500 mt-1">
              Tick only the works that came from this grant. They'll be cited in its progress reports.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-brand-500 hover:text-brand-700 hover:bg-brand-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          {data?.orcidId && !changingId && (
            <p className="text-xs text-brand-600">
              Works on ORCID record <span className="font-semibold tabular-nums text-brand-900">{data.orcidId}</span>
              {' · '}
              <button
                type="button"
                onClick={() => {
                  setIdInput('');
                  setChangingId(true);
                }}
                className="font-semibold text-primary-700 hover:text-primary-800"
              >
                Use a different iD
              </button>
            </p>
          )}

          {error && (
            <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
              {error}
            </p>
          )}

          {askForId && (
            <form onSubmit={lookUp} className="flex flex-col sm:flex-row sm:items-end gap-2">
              <div className="flex-1">
                <label htmlFor={`${formId}-orcid`} className="block text-xs font-semibold text-brand-700 mb-1">
                  Your ORCID iD
                </label>
                <input
                  id={`${formId}-orcid`}
                  className="w-full bg-white border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200"
                  value={idInput}
                  onChange={(e) => setIdInput(e.target.value)}
                  placeholder="0000-0002-1825-0097 or https://orcid.org/…"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 shrink-0"
              >
                List my works
              </button>
              {changingId && (
                <button
                  type="button"
                  onClick={() => {
                    setChangingId(false);
                    setError(null);
                  }}
                  className="px-2 py-2 text-sm font-medium text-brand-600 hover:text-brand-900"
                >
                  Cancel
                </button>
              )}
            </form>
          )}

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-brand-500" role="status">
              <Loader2 className="w-4 h-4 animate-spin" />
              Fetching your works from ORCID…
            </p>
          ) : (
            data?.orcidId &&
            !changingId && (
              <>
                {data.message && <p className="text-sm text-brand-600">{data.message}</p>}
                {works.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-500">
                      Dated within the project <span className="tabular-nums">({inPeriod.length})</span>
                    </h3>
                    <p className="text-xs text-brand-500 mt-0.5 mb-1">
                      {formatDay(award.startDate)} – {formatDay(award.endDate)}
                    </p>
                    {inPeriod.length === 0 ? (
                      <p className="text-sm text-brand-600 py-2">None of your ORCID works is dated within the project yet.</p>
                    ) : (
                      <ul className="flex flex-col divide-y divide-brand-100">
                        {inPeriod.map((work) => (
                          <WorkRow key={work.putCode} work={work} ticked={ticked.has(work.putCode)} onToggle={toggle} />
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {others.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowOthers((v) => !v)}
                      aria-expanded={showOthers}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-900"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showOthers ? 'rotate-180' : ''}`} />
                      Outside the project period or undated ({others.length})
                    </button>
                    {showOthers && (
                      <ul className="mt-1 flex flex-col divide-y divide-brand-100">
                        {others.map((work) => (
                          <WorkRow key={work.putCode} work={work} ticked={ticked.has(work.putCode)} onToggle={toggle} />
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-brand-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-brand-700 hover:bg-brand-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={ticked.size === 0 || saving}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 shadow-xs"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {ticked.size === 0 ? 'Add works' : `Add ${ticked.size} ${ticked.size === 1 ? 'work' : 'works'}`}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

function WorkRow({ work, ticked, onToggle }: { work: OrcidWork; ticked: boolean; onToggle: (putCode: string) => void }) {
  const facts = [
    work.journal,
    work.date ? formatPartialDate(work.date) : 'No date on ORCID',
    work.outputType !== 'PAPER' && `added as ${OUTPUT_META[work.outputType].label.toLowerCase()}`,
  ].filter(Boolean);

  return (
    <li>
      <label className={`flex items-start gap-3 py-2.5 ${work.alreadyAdded ? 'opacity-60' : 'cursor-pointer'}`}>
        <input
          type="checkbox"
          className="mt-1 w-4 h-4 accent-primary-600 shrink-0"
          checked={work.alreadyAdded || ticked}
          disabled={work.alreadyAdded}
          onChange={() => onToggle(work.putCode)}
        />
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-brand-900">{work.title}</span>
          <span className="block text-xs text-brand-500 mt-0.5">{facts.join(' · ')}</span>
        </span>
        {work.alreadyAdded && (
          <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-semibold border bg-brand-100 text-brand-700 border-brand-200">
            Added
          </span>
        )}
      </label>
    </li>
  );
}
