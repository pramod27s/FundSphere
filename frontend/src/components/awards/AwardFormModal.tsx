import { useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { FileText, FileUp, Loader2, Trash2, TriangleAlert, X } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import { formatInr } from '../../utils/formatFunding';
import {
  createAward,
  deleteAward,
  readSanctionOrder,
  updateAward,
  type Award,
  type AwardInput,
  type AwardStatus,
  type BudgetHead,
  type ReportingProfile,
  type SanctionOrderReading,
  type SourcedValue,
  type SubmissionPortal,
  type UnspentPolicy,
} from '../../services/awardsService';
import {
  AWARD_STATUS_META,
  guessPortal,
  guessProfile,
  HEAD_LABEL,
  HEAD_ORDER,
  parseLakhInput,
  PORTAL_LABEL,
  PORTAL_ORDER,
  portalFromUrl,
  PROFILE_LABEL,
  PROFILE_ORDER,
  rupeesToLakhInput,
  UNSPENT_LABEL,
  UNSPENT_ORDER,
} from './awardMeta';

/** Where a value filled from the sanction order came from (4.5), shown under its field. */
interface Source {
  page: number | null;
  quotes: string[];
  /** For budget heads: the items as the order prints them, e.g. "Fellowship (1 JRF for 36 months)". */
  labels?: string[];
}

type SourceKey =
  | 'title' | 'agency' | 'scheme' | 'sanctionNo' | 'sanctionDate' | 'start' | 'end' | 'total' | 'portal' | 'unspent'
  | BudgetHead;

interface ReadingSummary {
  fileName: string;
  filled: number;
  heads: number;
  warnings: string[];
}

/** Starting values when the grant comes from an awarded application. */
export interface AwardPrefill {
  applicationId: number;
  agency: string | null;
  scheme: string | null;
  submissionPortal: SubmissionPortal;
  reportingProfile: ReportingProfile;
}

interface AwardFormModalProps {
  /** Pass to edit a grant; omit to add one. */
  award?: Award;
  prefill?: AwardPrefill;
  onClose: () => void;
  /** created is false when the application already had a grant and that one came back. */
  onSaved: (award: Award, created: boolean) => void;
  onDeleted?: () => void;
}

const INPUT =
  'w-full bg-white border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200';
const LABEL = 'block text-xs font-semibold text-brand-700 mb-1';

/** 4.1 "Add my grant": one short form with the standard budget heads pre-filled, amounts in lakh. */
export default function AwardFormModal({ award, prefill, onClose, onSaved, onDeleted }: AwardFormModalProps) {
  const editing = Boolean(award);
  const dialogRef = useRef<HTMLDivElement>(null);
  const formId = useId();
  useDialog(dialogRef, onClose);

  const [projectTitle, setProjectTitle] = useState(award?.projectTitle ?? '');
  const [agency, setAgency] = useState(award?.agency ?? prefill?.agency ?? '');
  const [scheme, setScheme] = useState(award?.scheme ?? prefill?.scheme ?? '');
  const [sanctionNo, setSanctionNo] = useState(award?.sanctionNo ?? '');
  const [sanctionDate, setSanctionDate] = useState(award?.sanctionDate ?? '');
  const [startDate, setStartDate] = useState(award?.startDate ?? '');
  const [endDate, setEndDate] = useState(award?.endDate ?? '');
  const [total, setTotal] = useState(rupeesToLakhInput(award?.totalSanctioned));
  const [heads, setHeads] = useState<Record<BudgetHead, string>>(() => {
    const values = Object.fromEntries(HEAD_ORDER.map((head) => [head, ''])) as Record<BudgetHead, string>;
    for (const line of award?.budgetLines ?? []) values[line.head] = rupeesToLakhInput(line.allocated);
    return values;
  });
  const [portal, setPortal] = useState<SubmissionPortal>(award?.submissionPortal ?? prefill?.submissionPortal ?? 'OTHER');
  const [portalUrl, setPortalUrl] = useState(award?.submissionPortal === 'OTHER' ? award.portalUrl ?? '' : '');
  const [unspent, setUnspent] = useState<UnspentPolicy>(award?.unspentPolicy ?? 'UNKNOWN');
  const [profile, setProfile] = useState<ReportingProfile>(award?.reportingProfile ?? prefill?.reportingProfile ?? 'OTHER');
  // Follows the agency as it's typed or read, until the PI picks rules themselves.
  const [profileChosen, setProfileChosen] = useState(Boolean(award));
  const [status, setStatus] = useState<AwardStatus>(award?.status ?? 'ACTIVE');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // 4.5: filling the form from the sanction order PDF.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [readingFile, setReadingFile] = useState<string | null>(null);
  const [readingSummary, setReadingSummary] = useState<ReadingSummary | null>(null);
  const [sources, setSources] = useState<Partial<Record<SourceKey, Source>>>({});

  const applyReading = (reading: SanctionOrderReading, fileName: string) => {
    const found: Partial<Record<SourceKey, Source>> = {};
    let filled = 0;
    // Only values code confirmed in the PDF come back with a value; the rest stay as they are.
    function take<T>(field: SourcedValue<T>, key: SourceKey, set: (value: T) => void) {
      if (field.value === null) return;
      set(field.value);
      found[key] = { page: field.source_page, quotes: [field.source_quote] };
      filled += 1;
    }
    take(reading.project_title, 'title', setProjectTitle);
    take(reading.agency, 'agency', setAgency);
    take(reading.scheme, 'scheme', setScheme);
    take(reading.sanction_no, 'sanctionNo', setSanctionNo);
    take(reading.sanction_date, 'sanctionDate', setSanctionDate);
    take(reading.start_date, 'start', setStartDate);
    take(reading.end_date, 'end', setEndDate);
    take(reading.total_sanctioned, 'total', (rupees) => setTotal(rupeesToLakhInput(rupees)));
    take(reading.unspent_policy, 'unspent', setUnspent);
    take(reading.portal_url, 'portal', (url) => {
      const known = portalFromUrl(url);
      setPortal(known ?? 'OTHER');
      setPortalUrl(known ? '' : url);
    });
    const agencyRead = reading.agency.value;
    if (reading.portal_url.value === null && agencyRead) {
      setPortal((current) => (current === 'OTHER' ? guessPortal(agencyRead) : current));
    }
    if (agencyRead && !profileChosen) setProfile(guessProfile(agencyRead));
    if (reading.budget_lines.length > 0) {
      setHeads((current) => {
        const next = { ...current };
        for (const line of reading.budget_lines) next[line.head] = rupeesToLakhInput(line.amount);
        return next;
      });
      for (const line of reading.budget_lines) {
        found[line.head] = {
          page: line.items[0]?.source_page ?? null,
          quotes: line.items.map((item) => item.source_quote),
          labels: line.items.map((item) => item.label),
        };
      }
    }
    setSources(found);
    setReadingSummary({ fileName, filled, heads: reading.budget_lines.length, warnings: reading.warnings });
  };

  const handleOrderFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Choose the sanction order as a PDF file');
      return;
    }
    setReadingFile(file.name);
    try {
      applyReading(await readSanctionOrder(file), file.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read the sanction order');
    } finally {
      setReadingFile(null);
    }
  };

  const parsedTotal = parseLakhInput(total);
  const parsedHeads = useMemo(
    () => HEAD_ORDER.map((head) => ({ head, value: parseLakhInput(heads[head]) })),
    [heads],
  );
  const headsSum = parsedHeads.reduce((sum, { value }) => sum + (typeof value === 'number' ? value : 0), 0);
  const gap = typeof parsedTotal === 'number' && headsSum > 0 ? parsedTotal - headsSum : 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!projectTitle.trim()) {
      toast.error('Give the project a title');
      return;
    }
    if (!startDate || !endDate) {
      toast.error("Add the project's start and end dates");
      return;
    }
    if (endDate <= startDate) {
      toast.error('The end date must be after the start date');
      return;
    }
    const badHead = parsedHeads.find(({ value }) => value === 'invalid');
    if (parsedTotal === 'invalid' || badHead) {
      toast.error(`Enter ${badHead ? HEAD_LABEL[badHead.head] : 'the total'} in lakh, for example 12.5`);
      return;
    }

    const input: AwardInput = {
      applicationId: prefill?.applicationId,
      projectTitle: projectTitle.trim(),
      agency: agency.trim() || null,
      scheme: scheme.trim() || null,
      sanctionNo: sanctionNo.trim() || null,
      sanctionDate: sanctionDate || null,
      startDate,
      endDate,
      totalSanctioned: parsedTotal,
      submissionPortal: portal,
      portalUrl: portal === 'OTHER' ? portalUrl.trim() || null : null,
      unspentPolicy: unspent,
      reportingProfile: profile,
      status: editing ? status : undefined,
      budgetLines: parsedHeads
        .filter((line): line is { head: BudgetHead; value: number } => typeof line.value === 'number' && line.value > 0)
        .map(({ head, value }) => ({ head, allocated: value })),
    };

    setSaving(true);
    try {
      if (award) {
        onSaved(await updateAward(award.id, input), false);
      } else {
        const { award: saved, created } = await createAward(input);
        onSaved(saved, created);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!award) return;
    if (!window.confirm(`Delete "${award.projectTitle}" from My grants? This can't be undone.`)) return;
    setDeleting(true);
    try {
      await deleteAward(award.id);
      toast.success('Grant deleted');
      onDeleted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete');
      setDeleting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="fixed inset-0 bg-brand-950/60" onClick={onClose} aria-hidden="true" />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-heading`}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white rounded-xl shadow-modal w-full max-w-2xl max-h-[90vh] overflow-y-auto relative z-10 ring-1 ring-brand-200/50"
      >
        <form onSubmit={handleSubmit} noValidate>
          <div className="flex items-start justify-between gap-4 p-5 border-b border-brand-100">
            <div>
              <h2 id={`${formId}-heading`} className="text-lg font-bold text-brand-900 tracking-tight">
                {editing ? 'Edit grant details' : prefill ? 'Set up your awarded grant' : 'Add a grant you hold'}
              </h2>
              <p className="text-xs text-brand-500 mt-1">
                Copy these from your sanction order. FundSphere works out your UC, SE and report dates from them.
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

          <div className="p-5 flex flex-col gap-6">
            {!editing && (
              <div className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-3">
                {readingFile ? (
                  <p className="flex items-center gap-2 text-sm text-primary-900" role="status">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    Reading {readingFile}. This takes about 15 seconds.
                  </p>
                ) : readingSummary ? (
                  <div className="text-sm text-primary-900" role="status">
                    <p className="font-semibold">
                      Filled {readingSummary.filled} {readingSummary.filled === 1 ? 'detail' : 'details'} and{' '}
                      {readingSummary.heads} budget {readingSummary.heads === 1 ? 'head' : 'heads'} from {readingSummary.fileName}.
                    </p>
                    <p className="text-xs mt-0.5">
                      Check each one against the order before saving. Under each filled field, "From the order" shows
                      the sentence it came from. Anything the order didn't clearly state is left for you to type.
                    </p>
                    {readingSummary.warnings.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {readingSummary.warnings.map((warning) => (
                          <li key={warning} className="flex items-start gap-1.5 text-xs text-amber-800">
                            <TriangleAlert className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
                            {warning}
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-2 text-xs font-semibold text-primary-700 hover:text-primary-800"
                    >
                      Read a different PDF
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <p className="flex-1 text-sm text-primary-900">
                      <span className="font-semibold">Have the sanction order as a PDF?</span> FundSphere can fill in
                      this form from it, and you check every value before saving.
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 shadow-xs shrink-0"
                    >
                      <FileUp className="w-4 h-4" />
                      Fill from PDF
                    </button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={handleOrderFile}
                  aria-label="Sanction order PDF"
                />
              </div>
            )}

            <Section title="Project">
              <div>
                <label htmlFor={`${formId}-title`} className={LABEL}>Project title *</label>
                <input
                  id={`${formId}-title`}
                  data-autofocus
                  className={INPUT}
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  placeholder="As written in the sanction order"
                  maxLength={500}
                  required
                />
                <SourceLine source={sources.title} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`${formId}-agency`} className={LABEL}>Agency</label>
                  <input
                    id={`${formId}-agency`}
                    className={INPUT}
                    value={agency}
                    onChange={(e) => {
                      setAgency(e.target.value);
                      if (!profileChosen) setProfile(guessProfile(e.target.value));
                    }}
                    placeholder="e.g. ANRF, DST, DBT, ICMR"
                    maxLength={300}
                  />
                  <SourceLine source={sources.agency} />
                </div>
                <div>
                  <label htmlFor={`${formId}-scheme`} className={LABEL}>Scheme</label>
                  <input
                    id={`${formId}-scheme`}
                    className={INPUT}
                    value={scheme}
                    onChange={(e) => setScheme(e.target.value)}
                    placeholder="e.g. Core Research Grant"
                    maxLength={300}
                  />
                  <SourceLine source={sources.scheme} />
                </div>
                <div>
                  <label htmlFor={`${formId}-sanction-no`} className={LABEL}>Sanction order number</label>
                  <input
                    id={`${formId}-sanction-no`}
                    className={INPUT}
                    value={sanctionNo}
                    onChange={(e) => setSanctionNo(e.target.value)}
                    placeholder="e.g. CRG/2026/001234"
                    maxLength={200}
                  />
                  <SourceLine source={sources.sanctionNo} />
                </div>
                <div>
                  <label htmlFor={`${formId}-sanction-date`} className={LABEL}>Sanction date</label>
                  <input
                    id={`${formId}-sanction-date`}
                    type="date"
                    className={INPUT}
                    value={sanctionDate}
                    onChange={(e) => setSanctionDate(e.target.value)}
                  />
                  <SourceLine source={sources.sanctionDate} />
                </div>
                <div>
                  <label htmlFor={`${formId}-start`} className={LABEL}>Start date *</label>
                  <input
                    id={`${formId}-start`}
                    type="date"
                    className={INPUT}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                  <SourceLine source={sources.start} />
                </div>
                <div>
                  <label htmlFor={`${formId}-end`} className={LABEL}>End date *</label>
                  <input
                    id={`${formId}-end`}
                    type="date"
                    className={INPUT}
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                  <SourceLine source={sources.end} />
                </div>
              </div>
            </Section>

            <Section title="Budget" hint="Amounts in lakh: type 12.5 for ₹12.5 lakh. Leave a head empty if your grant doesn't have it.">
              <LakhField
                id={`${formId}-total`}
                label="Total sanctioned"
                value={total}
                onChange={setTotal}
                placeholder="e.g. 45.6"
                source={sources.total}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                {HEAD_ORDER.map((head) => (
                  <LakhField
                    key={head}
                    id={`${formId}-head-${head}`}
                    label={HEAD_LABEL[head]}
                    value={heads[head]}
                    onChange={(value) => setHeads((prev) => ({ ...prev, [head]: value }))}
                    placeholder="0"
                    source={sources[head]}
                  />
                ))}
              </div>
              {headsSum > 0 && (
                <p
                  className={`text-xs rounded-lg px-3 py-2 border ${
                    gap === 0 ? 'text-brand-600 bg-brand-50 border-brand-200' : 'text-amber-800 bg-amber-50 border-amber-200'
                  }`}
                >
                  Heads add up to {formatInr(headsSum)}
                  {gap > 0 && `, ${formatInr(gap)} less than the total sanctioned`}
                  {gap < 0 && `, ${formatInr(-gap)} more than the total sanctioned`}.
                </p>
              )}
            </Section>

            <Section title="Reporting">
              <div>
                <label htmlFor={`${formId}-profile`} className={LABEL}>Reporting rules</label>
                <select
                  id={`${formId}-profile`}
                  className={INPUT}
                  value={profile}
                  onChange={(e) => {
                    setProfile(e.target.value as ReportingProfile);
                    setProfileChosen(true);
                  }}
                >
                  {PROFILE_ORDER.map((p) => (
                    <option key={p} value={p}>{PROFILE_LABEL[p]}</option>
                  ))}
                </select>
                <p className="text-xs text-brand-500 mt-1">
                  Sets the default dates for your UCs, reports and closing documents. You can move any date later
                  {editing ? ', and dates you already moved or marked submitted are kept' : ''}.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor={`${formId}-portal`} className={LABEL}>Where you submit UCs and reports</label>
                  <select
                    id={`${formId}-portal`}
                    className={INPUT}
                    value={portal}
                    onChange={(e) => setPortal(e.target.value as SubmissionPortal)}
                  >
                    {PORTAL_ORDER.map((p) => (
                      <option key={p} value={p}>{PORTAL_LABEL[p]}</option>
                    ))}
                  </select>
                  <SourceLine source={sources.portal} />
                </div>
                <div>
                  <label htmlFor={`${formId}-unspent`} className={LABEL}>Money unspent on 31 March</label>
                  <select
                    id={`${formId}-unspent`}
                    className={INPUT}
                    value={unspent}
                    onChange={(e) => setUnspent(e.target.value as UnspentPolicy)}
                  >
                    {UNSPENT_ORDER.map((u) => (
                      <option key={u} value={u}>{UNSPENT_LABEL[u]}</option>
                    ))}
                  </select>
                  <SourceLine source={sources.unspent} />
                </div>
              </div>
              {portal === 'OTHER' && (
                <div>
                  <label htmlFor={`${formId}-portal-url`} className={LABEL}>Portal link</label>
                  <input
                    id={`${formId}-portal-url`}
                    type="url"
                    inputMode="url"
                    className={INPUT}
                    value={portalUrl}
                    onChange={(e) => setPortalUrl(e.target.value)}
                    placeholder="https://"
                    maxLength={2000}
                  />
                </div>
              )}
              <p className="text-xs text-brand-500">
                Your sanction order or accounts office can tell you what happens to unspent money. It differs by agency,
                so FundSphere words its year-end reminders from your answer.
              </p>
              {editing && (
                <div className="sm:w-1/2">
                  <label htmlFor={`${formId}-status`} className={LABEL}>Status</label>
                  <select
                    id={`${formId}-status`}
                    className={INPUT}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AwardStatus)}
                  >
                    {(['ACTIVE', 'CLOSED'] as AwardStatus[]).map((s) => (
                      <option key={s} value={s}>{AWARD_STATUS_META[s].label}</option>
                    ))}
                  </select>
                </div>
              )}
            </Section>
          </div>

          <div className="flex items-center gap-3 p-5 border-t border-brand-100">
            {editing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-brand-700 hover:bg-brand-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || readingFile !== null}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 shadow-xs"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'Save' : 'Add grant'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body,
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-sm font-bold text-brand-900 mb-1">{title}</legend>
      {hint && <p className="text-xs text-brand-500 -mt-3">{hint}</p>}
      {children}
    </fieldset>
  );
}

/** A "₹ lakh" amount input with the amount read back underneath, so a slipped digit is easy to spot. */
function LakhField({
  id,
  label,
  value,
  onChange,
  placeholder,
  source,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  source?: Source;
}) {
  const parsed = parseLakhInput(value);
  return (
    <div>
      <label htmlFor={id} className={LABEL}>{label}</label>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          className={`${INPUT} pr-14 tabular-nums ${parsed === 'invalid' ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={parsed === 'invalid'}
          aria-describedby={`${id}-readback`}
        />
        <span className="absolute inset-y-0 right-3 flex items-center text-xs text-brand-500 pointer-events-none">lakh</span>
      </div>
      <p id={`${id}-readback`} className={`text-[11px] mt-1 min-h-4 ${parsed === 'invalid' ? 'text-red-600' : 'text-brand-500'}`}>
        {parsed === 'invalid' ? 'Numbers only, for example 12.5' : typeof parsed === 'number' && parsed > 0 ? formatInr(parsed) : ''}
      </p>
      <SourceLine source={source} />
    </div>
  );
}

/**
 * Under a field filled from the sanction order: where it came from, and the
 * sentence itself on request. For budget heads the items are named as the
 * order prints them, because which head an item belongs to is the PI's call.
 */
function SourceLine({ source }: { source?: Source }) {
  const [open, setOpen] = useState(false);
  if (!source) return null;
  const page = source.page ? `, p. ${source.page}` : '';
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-start gap-1 text-left text-[11px] font-medium text-primary-700 hover:text-primary-800"
      >
        <FileText className="w-3 h-3 mt-px shrink-0" aria-hidden="true" />
        <span>
          From the order{page}
          {source.labels && `: ${source.labels.join(' + ')}`}
          <span className="text-brand-500 font-normal"> · {open ? 'hide' : 'show'} the sentence</span>
        </span>
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-1.5 text-[11px] text-brand-700">
          {source.quotes.map((quote, index) => (
            <p key={index}>“{quote}”</p>
          ))}
        </div>
      )}
    </div>
  );
}
