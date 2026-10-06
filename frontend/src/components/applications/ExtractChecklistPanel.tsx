import { useEffect, useRef, useState } from 'react';
import { FileText, Link2, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { extractChecklist, type Application } from '../../services/applicationsService';

interface ExtractChecklistPanelProps {
  application: Application;
  onExtracted: (application: Application) => void;
  onCancel?: () => void;
}

const MAX_BYTES = 25 * 1024 * 1024;
const PROGRESS = [
  { after: 0, text: 'Reading the guidelines…' },
  { after: 6, text: 'Finding every document, limit and sign-off…' },
  { after: 25, text: 'Checking each quote against the document…' },
  { after: 50, text: 'Long document, almost there…' },
];

/**
 * 3.2 input: the call's guidelines as a PDF upload or a pasted link. The
 * extraction takes up to a minute, so it shows what it's doing meanwhile.
 */
export default function ExtractChecklistPanel({ application, onExtracted, onCancel }: ExtractChecklistPanelProps) {
  const hasChecklist = Boolean(application.checklistGeneratedAt);
  const [mode, setMode] = useState<'pdf' | 'link'>('pdf');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState(application.checklistGeneratedAt ? '' : application.callUrl ?? '');
  const [hover, setHover] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const pickFile = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setError('Choose a PDF file.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError('The PDF is larger than 25 MB.');
      return;
    }
    setError(null);
    setFile(f);
  };

  const canRun = mode === 'pdf' ? file !== null : url.trim().length > 0;

  const run = async () => {
    if (!canRun || running) return;
    if (hasChecklist && !window.confirm('Replace the AI checklist? Owners, dates and ticks on AI items will be lost. Items you added yourself are kept.')) {
      return;
    }
    setRunning(true);
    setElapsed(0);
    setError(null);
    try {
      const updated = await extractChecklist(application.id, mode === 'pdf' ? { file: file! } : { url: url.trim() });
      onExtracted(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the guidelines');
    } finally {
      setRunning(false);
    }
  };

  const progress = [...PROGRESS].reverse().find((p) => elapsed >= p.after)?.text ?? PROGRESS[0].text;

  return (
    <div className="rounded-xl border border-primary-200 bg-white p-5 sm:p-6 shadow-xs">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-primary-50 border border-primary-200 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-primary-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-brand-900">
            {hasChecklist ? 'Read the guidelines again' : 'Build the checklist from the call guidelines'}
          </h2>
          <p className="text-sm text-brand-600 mt-0.5">
            The AI lists every document, format limit, eligibility proof, budget rule and sign-off, and shows the
            sentence each one came from. You can edit everything afterwards.
          </p>
        </div>
        {onCancel && !running && (
          <button type="button" onClick={onCancel} className="p-1.5 rounded-lg text-brand-500 hover:bg-brand-100" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="inline-flex p-1 rounded-lg bg-brand-100 mb-4" role="tablist">
        {(['pdf', 'link'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            disabled={running}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              mode === m ? 'bg-white text-brand-900 shadow-xs' : 'text-brand-600 hover:text-brand-900'
            }`}
          >
            {m === 'pdf' ? <Upload className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            {m === 'pdf' ? 'Upload PDF' : 'Paste link'}
          </button>
        ))}
      </div>

      {mode === 'pdf' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setHover(true);
          }}
          onDragLeave={() => setHover(false)}
          onDrop={(e) => {
            e.preventDefault();
            setHover(false);
            if (!running) pickFile(e.dataTransfer.files);
          }}
          className={`rounded-xl border-2 border-dashed p-5 text-center transition ${
            hover || file ? 'border-primary-300 bg-primary-50' : 'border-brand-200'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => pickFile(e.target.files)}
          />
          {file ? (
            <div className="flex items-center gap-2 max-w-md mx-auto px-3 py-2 rounded-lg bg-white border border-primary-200">
              <FileText className="w-4 h-4 text-primary-600 shrink-0" />
              <span className="flex-1 min-w-0 text-left text-xs font-semibold text-brand-900 truncate">{file.name}</span>
              {!running && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = '';
                  }}
                  className="p-1 rounded-md text-brand-500 hover:text-red-600 hover:bg-red-50"
                  aria-label="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-brand-600 mb-3">The call's guidelines or advertisement PDF (up to 25 MB)</p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="px-4 py-2 rounded-lg bg-white border border-brand-200 hover:border-primary-300 hover:bg-primary-50 text-brand-700 text-xs font-semibold"
              >
                Choose PDF · or drop it here
              </button>
            </>
          )}
        </div>
      ) : (
        <div>
          <input
            type="url"
            inputMode="url"
            value={url}
            disabled={running}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="https://… link to the call page or its guidelines PDF"
            className="w-full bg-white border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200"
          />
          <p className="text-xs text-brand-500 mt-1.5">
            If the page links to a guidelines PDF, FundSphere reads that PDF. A PDF upload gives page numbers for every item.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={!canRun || running}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {running ? 'Reading…' : hasChecklist ? 'Replace AI checklist' : 'Build checklist'}
        </button>
        {running && (
          <p className="text-sm text-brand-600" aria-live="polite">
            {progress} <span className="tabular-nums text-brand-400">{elapsed}s</span>
          </p>
        )}
      </div>
    </div>
  );
}
