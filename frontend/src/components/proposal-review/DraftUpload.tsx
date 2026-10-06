import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { FileText, Loader2, Sparkles, Upload, X, Zap } from 'lucide-react';
import type { ReviewLevel } from '../../services/proposalReviewService';

interface DraftUploadProps {
  /** Standalone page: also ask for the call's guidelines and title. */
  withGuidelines?: boolean;
  busy?: boolean;
  onStart: (input: { proposal: File; guidelines: File | null; grantTitle: string; level: ReviewLevel }) => void;
}

const MAX_BYTES = 25 * 1024 * 1024;

/** Pick a draft (and, standalone, the guidelines) and how deep to check it. */
export default function DraftUpload({ withGuidelines = false, busy = false, onStart }: DraftUploadProps) {
  const [proposal, setProposal] = useState<File | null>(null);
  const [guidelines, setGuidelines] = useState<File | null>(null);
  const [grantTitle, setGrantTitle] = useState('');
  const [level, setLevel] = useState<ReviewLevel>('INSTANT');
  const [error, setError] = useState<string | null>(null);

  const ready = proposal !== null && (!withGuidelines || guidelines !== null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!proposal || (withGuidelines && !guidelines)) return;
    onStart({ proposal, guidelines, grantTitle: grantTitle.trim(), level });
  };

  const pick = (setter: (f: File | null) => void) => (file: File | null) => {
    if (file && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Choose a PDF file.');
      return;
    }
    if (file && file.size > MAX_BYTES) {
      setError('The PDF is larger than 25 MB.');
      return;
    }
    setError(null);
    setter(file);
  };

  return (
    <form onSubmit={submit} className="bg-white border border-brand-200 rounded-xl p-5 flex flex-col gap-4">
      <div className={`grid gap-3 ${withGuidelines ? 'sm:grid-cols-2' : ''}`}>
        <FilePicker label="Proposal draft (PDF)" file={proposal} onPick={pick(setProposal)} />
        {withGuidelines && <FilePicker label="Call guidelines (PDF)" file={guidelines} onPick={pick(setGuidelines)} />}
      </div>

      {withGuidelines && (
        <input
          value={grantTitle}
          onChange={(e) => setGrantTitle(e.target.value)}
          maxLength={300}
          placeholder="Call name (optional), e.g. ANRF Core Research Grant 2026"
          className="w-full bg-white border border-brand-200 rounded-lg px-3 py-2 text-sm placeholder:text-brand-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200"
        />
      )}

      <fieldset className="grid sm:grid-cols-2 gap-2">
        <legend className="sr-only">How deep to check</legend>
        <LevelOption
          active={level === 'INSTANT'} onSelect={() => setLevel('INSTANT')}
          icon={<Zap className="w-4 h-4" />} title="Instant check"
          text="Pages, words, fonts, sections and budget rules, measured from the PDF. Quick and almost free."
        />
        <LevelOption
          active={level === 'FULL'} onSelect={() => setLevel('FULL')}
          icon={<Sparkles className="w-4 h-4" />} title="Full AI review"
          text="Adds a quality score marked like the committee, judgement rules and contradictions between sections."
        />
      </fieldset>

      {error && <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>}

      <button
        type="submit"
        disabled={!ready || busy}
        className="self-start inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        Check this draft
      </button>
    </form>
  );
}

function FilePicker({ label, file, onPick }: { label: string; file: File | null; onPick: (f: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={`rounded-lg border-2 border-dashed p-4 text-center ${file ? 'border-primary-300 bg-primary-50' : 'border-brand-200'}`}>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      <p className="text-xs font-semibold text-brand-700 mb-2">{label}</p>
      {file ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-primary-200 text-left">
          <FileText className="w-4 h-4 text-primary-600 shrink-0" />
          <span className="flex-1 min-w-0 text-xs font-semibold text-brand-900 truncate">{file.name}</span>
          <button
            type="button"
            onClick={() => {
              onPick(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            className="p-1 rounded text-brand-500 hover:text-red-600"
            aria-label={`Remove ${file.name}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()}
          className="px-4 py-2 rounded-lg bg-white border border-brand-200 hover:border-primary-300 text-xs font-semibold text-brand-700">
          Choose PDF
        </button>
      )}
    </div>
  );
}

function LevelOption({ active, onSelect, icon, title, text }: {
  active: boolean; onSelect: () => void; icon: ReactNode; title: string; text: string;
}) {
  return (
    <label className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition ${active ? 'border-primary-400 bg-primary-50 ring-2 ring-primary-200' : 'border-brand-200 hover:bg-brand-50'}`}>
      <input type="radio" name="review-level" checked={active} onChange={onSelect} className="sr-only" />
      <span className={`mt-0.5 ${active ? 'text-primary-700' : 'text-brand-500'}`}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold text-brand-900">{title}</span>
        <span className="block text-xs text-brand-600 mt-0.5">{text}</span>
      </span>
    </label>
  );
}
