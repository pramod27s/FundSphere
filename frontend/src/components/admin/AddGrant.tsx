import { useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { CircleCheck, FileText, FileUp, Link2, Loader2, Type, TriangleAlert } from 'lucide-react';
import { buttonClasses } from '../common/buttonStyles';
import { parseLakhInput, rupeesToLakhInput } from '../awards/awardMeta';
import { formatInr } from '../../utils/formatFunding';
import type { SourcedValue } from '../../services/awardsService';
import {
  createManualGrant,
  findDuplicates,
  readCall,
  type CallReading,
  type DeadlineType,
  type ManualGrantInput,
  type PossibleDuplicate,
  type SavedGrant,
} from '../../services/adminService';

const INPUT =
  'w-full bg-white border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200';
const LABEL = 'block text-xs font-semibold text-brand-700 mb-1';
const GRANT_TYPES = ['Research Grant', 'Fellowship', 'Seed Grant', 'Award', 'Travel Grant', 'Conference Grant', 'Scholarship', 'Other'];

type Tab = 'pdf' | 'url' | 'text';
const TABS: { id: Tab; label: string; icon: typeof FileUp }[] = [
  { id: 'pdf', label: 'Upload PDF', icon: FileUp },
  { id: 'url', label: 'Paste a link', icon: Link2 },
  { id: 'text', label: 'Paste text', icon: Type },
];

interface FormState {
  title: string;
  grantUrl: string;
  agency: string;
  programme: string;
  purpose: string;
  /** YYYY-MM-DD */
  deadline: string;
  deadlineType: Exclude<DeadlineType, 'FIXED'>;
  openingDate: string;
  /** In lakh, as typed. */
  amountMin: string;
  amountMax: string;
  duration: string;
  eligibility: string;
  themes: string;
  applicationLink: string;
  requiresPhd: '' | 'YES' | 'NO';
  citizenship: string;
  grantType: string;
}

/** Fields that can be filled from the call (the call's own link is typed or pasted). */
type FieldKey = Exclude<keyof FormState, 'grantUrl'>;

const EMPTY: FormState = {
  title: '', grantUrl: '', agency: '', programme: '', purpose: '', deadline: '', deadlineType: 'UNKNOWN',
  openingDate: '', amountMin: '', amountMax: '', duration: '', eligibility: '', themes: '', applicationLink: '',
  requiresPhd: '', citizenship: '', grantType: '',
};

/** Where a value read from the call came from, shown under its field. */
interface Source {
  page: number | null;
  quote: string;
}

interface ReadSummary {
  from: string;
  filled: number;
  warnings: string[];
}

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function withScheme(link: string): string {
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

/**
 * Add a grant by hand (2nd.md, Part B), for calls the scraper can't reach.
 * The AI fills the form from the call's PDF, link or text, with the sentence
 * each value came from; the admin checks every field before saving. The
 * saved grant is indexed for AI Match and the scraper never changes it.
 */
export default function AddGrant() {
  const formId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>('pdf');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReadSummary | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [sources, setSources] = useState<Partial<Record<FieldKey, Source>>>({});
  const [duplicates, setDuplicates] = useState<PossibleDuplicate[]>([]);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedGrant | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setChecked(false);
  };

  const checkDuplicates = async (values: FormState) => {
    if (!values.title.trim() && !values.grantUrl.trim()) {
      setDuplicates([]);
      return;
    }
    try {
      setDuplicates(await findDuplicates({
        grantUrl: values.grantUrl,
        grantTitle: values.title,
        fundingAgency: values.agency,
        applicationLink: values.applicationLink,
      }));
    } catch {
      // The warning is a help, not a gate: saving still refuses a known link.
    }
  };

  const applyReading = (result: CallReading) => {
    const next: FormState = { ...EMPTY, grantUrl: result.source_url || form.grantUrl };
    const found: Partial<Record<FieldKey, Source>> = {};
    let filled = 0;
    const take = <T,>(field: SourcedValue<T>, key: FieldKey, apply: (value: T) => void) => {
      if (field.value === null || field.value === undefined) return;
      apply(field.value);
      found[key] = { page: field.source_page, quote: field.source_quote };
      filled += 1;
    };
    take(result.title, 'title', (v) => { next.title = v; });
    take(result.agency, 'agency', (v) => { next.agency = v; });
    take(result.programme, 'programme', (v) => { next.programme = v; });
    take(result.purpose, 'purpose', (v) => { next.purpose = v; });
    take(result.deadline, 'deadline', (v) => { next.deadline = v; });
    take(result.opening_date, 'openingDate', (v) => { next.openingDate = v; });
    take(result.open_all_year, 'deadlineType', () => { next.deadlineType = 'ROLLING'; });
    if (result.deadline_type === 'CALL_BASED') next.deadlineType = 'CALL_BASED';
    take(result.amount_min, 'amountMin', (v) => { next.amountMin = rupeesToLakhInput(v); });
    take(result.amount_max, 'amountMax', (v) => { next.amountMax = rupeesToLakhInput(v); });
    take(result.duration, 'duration', (v) => { next.duration = v; });
    take(result.eligibility, 'eligibility', (v) => { next.eligibility = v; });
    take(result.themes, 'themes', (v) => { next.themes = v; });
    take(result.application_link, 'applicationLink', (v) => { next.applicationLink = v; });
    take(result.requires_phd, 'requiresPhd', (v) => { next.requiresPhd = v; });
    take(result.citizenship, 'citizenship', (v) => { next.citizenship = v; });
    take(result.grant_type, 'grantType', (v) => { next.grantType = v; });
    setForm(next);
    setSources(found);
    setSummary({ from: result.source_name || 'the call', filled, warnings: result.warnings });
    setChecked(false);
    setSaveError(null);
    void checkDuplicates(next);
  };

  const handleRead = async () => {
    setReadError(null);
    setSaved(null);
    if (tab === 'pdf' && !file) return setReadError('Choose the call\'s PDF first.');
    if (tab === 'url' && !url.trim()) return setReadError('Paste the link to the call first.');
    if (tab === 'text' && !text.trim()) return setReadError('Paste the call\'s text first.');
    setReading(true);
    try {
      const source = tab === 'pdf' ? { kind: 'pdf' as const, file: file as File }
        : tab === 'url' ? { kind: 'url' as const, url: url.trim() }
          : { kind: 'text' as const, text };
      applyReading(await readCall(source));
    } catch (error) {
      setReadError(error instanceof Error ? error.message : 'Could not read the call');
    } finally {
      setReading(false);
    }
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setReadError(null);
  };

  const amountMin = parseLakhInput(form.amountMin);
  const amountMax = parseLakhInput(form.amountMax);
  const knownLink = duplicates.find((d) => d.sameUrl);

  const problems: string[] = [];
  if (!form.title.trim()) problems.push('Add the call\'s title.');
  if (!/^https?:\/\/\S+$/i.test(form.grantUrl.trim())) problems.push('Add the link to the page or PDF where the call is published.');
  if (amountMin === 'invalid' || amountMax === 'invalid') problems.push('Amounts are in lakh, numbers only (for example 12.5).');
  if (typeof amountMin === 'number' && typeof amountMax === 'number' && amountMin > amountMax) {
    problems.push('The minimum amount is larger than the maximum.');
  }
  if (form.openingDate && form.deadline && form.openingDate > form.deadline) problems.push('The opening date is after the deadline.');
  if (knownLink) problems.push('This link is already in FundSphere.');

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (problems.length > 0 || !checked) return;
    setSaving(true);
    setSaveError(null);
    const input: ManualGrantInput = {
      grantTitle: form.title.trim(),
      grantUrl: form.grantUrl.trim(),
      fundingAgency: nullIfBlank(form.agency),
      programName: nullIfBlank(form.programme),
      description: nullIfBlank(form.purpose),
      applicationDeadline: form.deadline ? `${form.deadline}T23:59:59` : null,
      deadlineType: form.deadline ? 'FIXED' : form.deadlineType,
      openingDate: form.openingDate ? `${form.openingDate}T00:00:00` : null,
      fundingAmountMin: typeof amountMin === 'number' ? amountMin : null,
      fundingAmountMax: typeof amountMax === 'number' ? amountMax : null,
      fundingCurrency: 'INR',
      grantDuration: nullIfBlank(form.duration),
      eligibilityCriteria: nullIfBlank(form.eligibility),
      researchThemes: nullIfBlank(form.themes),
      applicationLink: form.applicationLink.trim() ? withScheme(form.applicationLink.trim()) : null,
      requiresPhd: form.requiresPhd === '' ? null : form.requiresPhd === 'YES',
      citizenshipRequired: nullIfBlank(form.citizenship),
      eligibleCountries: /\bindia/i.test(form.citizenship) ? 'India' : null,
      grantType: nullIfBlank(form.grantType),
    };
    try {
      const grant = await createManualGrant(input);
      setSaved(grant);
      toast.success('Grant added');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the grant');
    } finally {
      setSaving(false);
    }
  };

  const startOver = () => {
    setForm(EMPTY);
    setSources({});
    setSummary(null);
    setDuplicates([]);
    setChecked(false);
    setSaved(null);
    setSaveError(null);
    setFile(null);
    setUrl('');
    setText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (saved) {
    return (
      <section className="bg-white border border-brand-200 rounded-lg shadow-xs p-5 flex flex-col gap-3" aria-live="polite">
        <p className="flex items-start gap-2 text-sm text-brand-900">
          <CircleCheck className="w-5 h-5 text-primary-600 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">Added “{saved.grantTitle}”.</span> It's in Discover now and in AI Match within
            a few minutes. The scraper will never change it, so check it again if the call is revised.
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={startOver} className={buttonClasses('primary', 'sm')}>Add another grant</button>
          <RouterLink to="/discovery" className={buttonClasses('secondary', 'sm')}>Open Discover</RouterLink>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby={`${formId}-heading`} className="bg-white border border-brand-200 rounded-lg shadow-xs">
      <div className="px-5 pt-5 pb-4 border-b border-brand-100">
        <h2 id={`${formId}-heading`} className="text-base font-bold text-brand-900 tracking-tight">Add a grant</h2>
        <p className="text-sm text-brand-600 mt-1">
          For calls the scraper can't reach. Give FundSphere the call and it fills in the details, with the sentence each
          one came from. Check every field before saving.
        </p>
      </div>

      <div className="px-5 py-4 flex flex-col gap-3 border-b border-brand-100">
        <div role="tablist" aria-label="How to give the call" className="inline-flex rounded-lg border border-brand-200 bg-brand-50 p-0.5 self-start">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                setReadError(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === id ? 'bg-white text-brand-900 shadow-xs' : 'text-brand-600 hover:text-brand-900'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'pdf' && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFile}
              aria-label="The call's PDF"
              className="text-sm text-brand-700 file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-brand-300 file:bg-white file:text-sm file:font-medium file:text-brand-800 hover:file:bg-brand-50"
            />
          </div>
        )}
        {tab === 'url' && (
          <input
            type="url"
            className={INPUT}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… the call's page or PDF"
            aria-label="Link to the call"
          />
        )}
        {tab === 'text' && (
          <textarea
            className={`${INPUT} min-h-32`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Copy the call's text from the agency's site and paste it here"
            aria-label="The call's text"
          />
        )}
        <p className="text-xs text-brand-500">
          {tab === 'url'
            ? 'If the site blocks FundSphere, open it in your browser and upload the PDF or paste the text instead.'
            : 'Use this for sites that block FundSphere: your browser can open them.'}
        </p>

        <div className="flex items-center gap-3">
          <button type="button" onClick={handleRead} disabled={reading} className={buttonClasses('primary', 'sm')}>
            {reading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {reading ? 'Reading… about 15 seconds' : 'Read the call'}
          </button>
          {readError && <p className="text-sm text-red-700" role="alert">{readError}</p>}
        </div>

        {summary && (
          <div className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900" role="status">
            <p className="font-semibold">
              Filled {summary.filled} {summary.filled === 1 ? 'detail' : 'details'} from {summary.from}.
            </p>
            <p className="text-xs mt-0.5">
              Under each filled field, “From the call” shows the sentence it came from. Anything the call didn't clearly
              state is left for you to type.
            </p>
            {summary.warnings.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {summary.warnings.map((warning) => (
                  <li key={warning} className="flex items-start gap-1.5 text-xs text-amber-800">
                    <TriangleAlert className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
                    {warning}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="px-5 py-5 flex flex-col gap-6" noValidate>
        <Group title="The call">
          <Field id={`${formId}-title`} label="Title *" source={sources.title}>
            <input
              id={`${formId}-title`}
              className={INPUT}
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              onBlur={() => void checkDuplicates(form)}
              maxLength={500}
            />
          </Field>
          <Field id={`${formId}-url`} label="Link to the call's page or PDF *">
            <input
              id={`${formId}-url`}
              type="url"
              className={INPUT}
              value={form.grantUrl}
              onChange={(e) => update('grantUrl', e.target.value)}
              onBlur={() => void checkDuplicates(form)}
              placeholder="https://… where researchers can read the call"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id={`${formId}-agency`} label="Agency" source={sources.agency}>
              <input id={`${formId}-agency`} className={INPUT} value={form.agency} onChange={(e) => update('agency', e.target.value)} maxLength={300} />
            </Field>
            <Field id={`${formId}-programme`} label="Programme or scheme" source={sources.programme}>
              <input id={`${formId}-programme`} className={INPUT} value={form.programme} onChange={(e) => update('programme', e.target.value)} maxLength={300} />
            </Field>
            <Field id={`${formId}-type`} label="Grant type" source={sources.grantType}>
              <select id={`${formId}-type`} className={INPUT} value={form.grantType} onChange={(e) => update('grantType', e.target.value)}>
                <option value="">Not stated</option>
                {GRANT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </Field>
            <Field id={`${formId}-duration`} label="Duration" source={sources.duration}>
              <input id={`${formId}-duration`} className={INPUT} value={form.duration} onChange={(e) => update('duration', e.target.value)} placeholder="e.g. 3 years" maxLength={200} />
            </Field>
          </div>
          <Field id={`${formId}-purpose`} label="What it funds" source={sources.purpose}>
            <textarea id={`${formId}-purpose`} className={`${INPUT} min-h-20`} value={form.purpose} onChange={(e) => update('purpose', e.target.value)} maxLength={2000} />
          </Field>
          <Field id={`${formId}-themes`} label="Research areas" source={sources.themes}>
            <input id={`${formId}-themes`} className={INPUT} value={form.themes} onChange={(e) => update('themes', e.target.value)} maxLength={2000} />
          </Field>
        </Group>

        <Group title="Dates">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field id={`${formId}-deadline`} label="Last date to apply" source={sources.deadline}>
              <input id={`${formId}-deadline`} type="date" className={INPUT} value={form.deadline} onChange={(e) => update('deadline', e.target.value)} />
            </Field>
            <Field id={`${formId}-deadline-type`} label="If there's no date" source={sources.deadlineType}>
              <select
                id={`${formId}-deadline-type`}
                className={INPUT}
                value={form.deadline ? 'FIXED' : form.deadlineType}
                onChange={(e) => update('deadlineType', e.target.value as FormState['deadlineType'])}
                disabled={Boolean(form.deadline)}
              >
                {form.deadline && <option value="FIXED">Fixed date</option>}
                <option value="ROLLING">Open all year</option>
                <option value="CALL_BASED">Opens through calls</option>
                <option value="UNKNOWN">Not stated</option>
              </select>
            </Field>
            <Field id={`${formId}-opening`} label="Applications open" source={sources.openingDate}>
              <input id={`${formId}-opening`} type="date" className={INPUT} value={form.openingDate} onChange={(e) => update('openingDate', e.target.value)} />
            </Field>
          </div>
        </Group>

        <Group title="Money (in lakh)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LakhField id={`${formId}-min`} label="Smallest amount" value={form.amountMin} parsed={amountMin}
              onChange={(v) => update('amountMin', v)} source={sources.amountMin} />
            <LakhField id={`${formId}-max`} label="Largest amount" value={form.amountMax} parsed={amountMax}
              onChange={(v) => update('amountMax', v)} source={sources.amountMax} />
          </div>
        </Group>

        <Group title="Who can apply">
          <Field id={`${formId}-eligibility`} label="Eligibility" source={sources.eligibility}>
            <textarea id={`${formId}-eligibility`} className={`${INPUT} min-h-20`} value={form.eligibility} onChange={(e) => update('eligibility', e.target.value)} maxLength={2000} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id={`${formId}-phd`} label="PhD required" source={sources.requiresPhd}>
              <select id={`${formId}-phd`} className={INPUT} value={form.requiresPhd} onChange={(e) => update('requiresPhd', e.target.value as FormState['requiresPhd'])}>
                <option value="">Not stated</option>
                <option value="YES">Yes</option>
                <option value="NO">No</option>
              </select>
            </Field>
            <Field id={`${formId}-citizenship`} label="Citizenship" source={sources.citizenship}>
              <input id={`${formId}-citizenship`} className={INPUT} value={form.citizenship} onChange={(e) => update('citizenship', e.target.value)} placeholder="e.g. Indian" maxLength={200} />
            </Field>
          </div>
          <Field id={`${formId}-apply`} label="Where to apply" source={sources.applicationLink}>
            <input id={`${formId}-apply`} type="url" className={INPUT} value={form.applicationLink} onChange={(e) => update('applicationLink', e.target.value)} placeholder="https://… the application portal" />
          </Field>
        </Group>

        {duplicates.length > 0 && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${knownLink ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`} role="status">
            <p className="font-semibold flex items-center gap-1.5">
              <TriangleAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
              {knownLink ? 'This call is already in FundSphere.' : 'FundSphere may already have this call:'}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {duplicates.map((d) => (
                <li key={d.id} className="text-xs">
                  {d.grantTitle}
                  {d.fundingAgency && <span className="opacity-75"> · {d.fundingAgency}</span>}
                  {' · '}
                  <a href={d.grantUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">open its source</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-brand-100 pt-4">
          {problems.length > 0 && (summary || form.title || form.grantUrl) && (
            <ul className="flex flex-col gap-1">
              {problems.map((problem) => (
                <li key={problem} className="text-xs text-red-700">{problem}</li>
              ))}
            </ul>
          )}
          <label className="flex items-start gap-2 text-sm text-brand-800">
            <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            I checked these details against the call.
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving || problems.length > 0 || !checked} className={buttonClasses('primary', 'md')}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save grant
            </button>
            {saveError && <p className="text-sm text-red-700" role="alert">{saveError}</p>}
          </div>
        </div>
      </form>
    </section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-xs font-bold uppercase tracking-wide text-brand-500 mb-3">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({ id, label, source, children }: { id: string; label: string; source?: Source; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>{label}</label>
      {children}
      <SourceLine source={source} />
    </div>
  );
}

function LakhField({ id, label, value, parsed, onChange, source }: {
  id: string;
  label: string;
  value: string;
  parsed: number | null | 'invalid';
  onChange: (value: string) => void;
  source?: Source;
}) {
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

/** Under a field filled from the call: where it came from, and the sentence itself on request. */
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
          From the call{page}
          <span className="text-brand-500 font-normal"> · {open ? 'hide' : 'show'} the sentence</span>
        </span>
      </button>
      {open && (
        <p className="mt-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-1.5 text-[11px] text-brand-700">“{source.quote}”</p>
      )}
    </div>
  );
}
