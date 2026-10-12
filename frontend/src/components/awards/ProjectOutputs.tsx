import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import { ExternalLink, Loader2, Plus, TriangleAlert } from 'lucide-react';
import {
  addAwardOutput,
  deleteAwardOutput,
  fetchAwardOutputs,
  updateAwardOutput,
  type Award,
  type AwardOutput,
  type AwardOutputInput,
  type AwardOutputType,
} from '../../services/awardsService';
import { formatDay } from '../../utils/applicationDates';
import { formatInr } from '../../utils/formatFunding';
import {
  doiUrl,
  formatPartialDate,
  OUTPUT_META,
  OUTPUT_ORDER,
  outsidePeriod,
  parseLakhInput,
  rupeesToLakhInput,
} from './awardMeta';
import { ROW_ACTION } from '../common/buttonStyles';
import OrcidImportModal from './OrcidImportModal';

const INPUT =
  'w-full bg-white border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200';
const LABEL = 'block text-xs font-semibold text-brand-700 mb-1';

/**
 * 4.4: what the project produced. Papers come from the PI's ORCID record;
 * students, equipment, patents and milestones go in through a quick-add form.
 * Progress-report drafts are written only from these entries.
 */
export default function ProjectOutputs({ award }: { award: Award }) {
  const [outputs, setOutputs] = useState<AwardOutput[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | 'new' | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAwardOutputs(award.id)
      .then((loaded) => !cancelled && setOutputs(loaded))
      .catch((e: unknown) => !cancelled && setLoadError(e instanceof Error ? e.message : 'Could not load the outputs'));
    return () => {
      cancelled = true;
    };
  }, [award.id]);

  const run = async (id: number | 'new', action: () => Promise<AwardOutput[]>, success: string) => {
    setBusyId(id);
    try {
      setOutputs(await action());
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const groups = OUTPUT_ORDER.map((type) => ({ type, items: (outputs ?? []).filter((o) => o.type === type) })).filter(
    (group) => group.items.length > 0,
  );

  return (
    <section className="bg-white border border-brand-200 rounded-xl p-5 sm:p-6 shadow-xs mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-brand-900 tracking-tight">Outputs</h2>
          <p className="text-xs text-brand-500 mt-0.5">
            What the project has produced. Progress reports are drafted only from what you record here.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setImporting(true)}
            disabled={outputs === null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-800 bg-white border border-brand-300 hover:bg-brand-50 disabled:opacity-60"
          >
            Import papers from ORCID
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setAdding(true);
            }}
            disabled={outputs === null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </div>

      {adding && (
        <div className="mb-4">
          <OutputForm
            busy={busyId === 'new'}
            onSave={(input) => run('new', () => addAwardOutput(award.id, input), `${OUTPUT_META[input.type].label} added`)}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {loadError ? (
        <p className="text-sm text-red-700">{loadError}</p>
      ) : outputs === null ? (
        <p className="flex items-center gap-2 text-sm text-brand-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </p>
      ) : outputs.length === 0 ? (
        !adding && (
          <p className="text-sm text-brand-600">
            Nothing recorded yet. Import your papers from ORCID, then add the students trained, equipment bought,
            patents and milestones reached.
          </p>
        )
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.type}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-500 mb-1">
                {OUTPUT_META[group.type].group} <span className="tabular-nums">({group.items.length})</span>
              </h3>
              <ul className="flex flex-col divide-y divide-brand-100">
                {group.items.map((output) =>
                  editingId === output.id ? (
                    <li key={output.id} className="py-3">
                      <OutputForm
                        initial={output}
                        busy={busyId === output.id}
                        onSave={async (input) => {
                          const ok = await run(output.id, () => updateAwardOutput(award.id, output.id, input), 'Saved');
                          if (ok) setEditingId(null);
                          return ok;
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    </li>
                  ) : (
                    <OutputRow
                      key={output.id}
                      output={output}
                      award={award}
                      busy={busyId === output.id}
                      onEdit={() => {
                        setAdding(false);
                        setEditingId(output.id);
                      }}
                      onDelete={() => run(output.id, () => deleteAwardOutput(award.id, output.id), 'Removed')}
                    />
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      {importing && (
        <OrcidImportModal
          award={award}
          onClose={() => setImporting(false)}
          onImported={(updated, added) => {
            setOutputs(updated);
            setImporting(false);
            toast.success(`Added ${added} ${added === 1 ? 'work' : 'works'} from ORCID`);
          }}
        />
      )}
    </section>
  );
}

function OutputRow({
  output,
  award,
  busy,
  onEdit,
  onDelete,
}: {
  output: AwardOutput;
  award: Award;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const doi = doiUrl(output.reference);
  const facts = [
    output.details,
    output.date && formatPartialDate(output.date),
    output.amount !== null && formatInr(output.amount),
  ].filter(Boolean);
  const outside = output.date !== null && outsidePeriod(output.date, award.startDate, award.endDate);

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-brand-900">{output.title}</p>
          {facts.length > 0 && <p className="text-xs text-brand-600 mt-0.5">{facts.join(' · ')}</p>}
          {output.reference && (
            <p className="text-xs text-brand-500 mt-0.5 break-all">
              {doi ? (
                <a
                  href={doi}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary-700 hover:text-primary-800"
                >
                  {output.reference}
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              ) : (
                output.reference
              )}
            </p>
          )}
          {outside && (
            <p className="flex items-start gap-1 text-xs text-amber-800 mt-1">
              <TriangleAlert className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
              Dated outside the project ({formatDay(award.startDate)} – {formatDay(award.endDate)}). Remove it if it
              didn't come from this grant.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button type="button" className={ROW_ACTION.secondary} disabled={busy} onClick={onEdit}>
              Edit
            </button>
            <button
              type="button"
              className={ROW_ACTION.danger}
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Remove "${output.title}"?`)) onDelete();
              }}
            >
              Remove
            </button>
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" aria-label="Saving" />}
          </div>
        </div>
        {output.source === 'ORCID' && (
          <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[11px] font-semibold border bg-primary-50 text-primary-700 border-primary-200">
            ORCID
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * The quick-add form, also used to edit an output. When adding, it stays open
 * after each save with the same kind chosen, so three students go in one
 * after another.
 */
function OutputForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial?: AwardOutput;
  busy: boolean;
  onSave: (input: AwardOutputInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const formId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<AwardOutputType>(initial?.type ?? 'STUDENT');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [details, setDetails] = useState(initial?.details ?? '');
  const [date, setDate] = useState(initial?.date ?? '');
  const [amount, setAmount] = useState(rupeesToLakhInput(initial?.amount));
  const [reference, setReference] = useState(initial?.reference ?? '');
  const meta = OUTPUT_META[type];
  // ORCID often gives only "2027" or "2027-03"; the date picker can't show that, so it's kept unless a day is picked.
  const partialDate = date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(date);
  const parsedAmount = parseLakhInput(amount);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error(`Add the ${meta.titleLabel.toLowerCase()}`);
      titleRef.current?.focus();
      return;
    }
    if (meta.amount && parsedAmount === 'invalid') {
      toast.error('The cost should be a number of lakh, for example 8.5');
      return;
    }
    const ok = await onSave({
      type,
      title: title.trim(),
      details: details.trim() || null,
      date: date || null,
      amount: meta.amount && typeof parsedAmount === 'number' ? parsedAmount : null,
      reference: meta.referenceLabel ? reference.trim() || null : null,
    });
    if (ok && !initial) {
      setTitle('');
      setDetails('');
      setDate('');
      setAmount('');
      setReference('');
      titleRef.current?.focus();
    }
  };

  return (
    <form onSubmit={submit} noValidate className="rounded-lg border border-brand-200 bg-brand-50 p-4 flex flex-col gap-3">
      <div role="group" aria-label="Kind of output" className="flex flex-wrap gap-1.5">
        {OUTPUT_ORDER.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={kind === type}
            onClick={() => setType(kind)}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${
              kind === type
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-brand-700 border-brand-200 hover:bg-brand-100'
            }`}
          >
            {OUTPUT_META[kind].label}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor={`${formId}-title`} className={LABEL}>{meta.titleLabel} *</label>
        <input
          ref={titleRef}
          id={`${formId}-title`}
          className={INPUT}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={meta.titlePlaceholder}
          maxLength={1000}
          autoFocus
        />
      </div>

      <div>
        <label htmlFor={`${formId}-details`} className={LABEL}>{meta.detailsLabel}</label>
        <input
          id={`${formId}-details`}
          className={INPUT}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder={meta.detailsPlaceholder}
          maxLength={3000}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${formId}-date`} className={LABEL}>{meta.dateLabel}</label>
          <input
            id={`${formId}-date`}
            type="date"
            className={INPUT}
            value={partialDate ? '' : date}
            onChange={(e) => setDate(e.target.value)}
            aria-describedby={partialDate ? `${formId}-date-hint` : undefined}
          />
          {partialDate && (
            <p id={`${formId}-date-hint`} className="text-[11px] text-brand-500 mt-1">
              ORCID gives {formatPartialDate(date)}. Pick a day only if you know it.
            </p>
          )}
        </div>
        {meta.amount && (
          <div>
            <label htmlFor={`${formId}-amount`} className={LABEL}>Cost</label>
            <div className="relative">
              <input
                id={`${formId}-amount`}
                inputMode="decimal"
                className={`${INPUT} pr-14 tabular-nums ${parsedAmount === 'invalid' ? 'border-red-300' : ''}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 8.5"
                aria-invalid={parsedAmount === 'invalid'}
                aria-describedby={`${formId}-amount-readback`}
              />
              <span className="absolute inset-y-0 right-3 flex items-center text-xs text-brand-500 pointer-events-none">lakh</span>
            </div>
            <p
              id={`${formId}-amount-readback`}
              className={`text-[11px] mt-1 min-h-4 ${parsedAmount === 'invalid' ? 'text-red-600' : 'text-brand-500'}`}
            >
              {parsedAmount === 'invalid'
                ? 'Numbers only, for example 8.5'
                : typeof parsedAmount === 'number' && parsedAmount > 0
                  ? formatInr(parsedAmount)
                  : ''}
            </p>
          </div>
        )}
        {meta.referenceLabel && (
          <div>
            <label htmlFor={`${formId}-reference`} className={LABEL}>{meta.referenceLabel}</label>
            <input
              id={`${formId}-reference`}
              className={INPUT}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={meta.referencePlaceholder}
              maxLength={300}
            />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {initial ? 'Save' : `Add ${type === 'OTHER' ? 'output' : meta.label.toLowerCase()}`}
        </button>
        <button type="button" onClick={onCancel} className="px-2 py-1.5 text-xs font-medium text-brand-600 hover:text-brand-900">
          {initial ? 'Cancel' : 'Done'}
        </button>
      </div>
    </form>
  );
}
