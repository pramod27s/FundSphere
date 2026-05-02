import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  Minus,
  Printer,
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {
  analyzeProposal,
  diffAnalyses,
  downloadAnalysisAsMarkdown,
  type AnalysisDiff,
  type AnalysisMode,
  type ProposalAnalysis,
  type SectionDiff,
  type SectionFeedback,
  type SectionStatus,
  type SectionTransition,
} from '../../services/proposalService';

interface WritingProposalProps {
  onBack: () => void;
}

type Stage = 'idle' | 'analyzing' | 'results' | 'error' | 'revision';

const MAX_PDF_BYTES = 25 * 1024 * 1024;

export default function WritingProposal({ onBack }: WritingProposalProps) {
  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [guidelinesFile, setGuidelinesFile] = useState<File | null>(null);
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [grantTitle, setGrantTitle] = useState('');
  const [mode, setMode] = useState<AnalysisMode>('simple');
  const [stage, setStage] = useState<Stage>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ProposalAnalysis | null>(null);
  const [previousAnalysis, setPreviousAnalysis] = useState<ProposalAnalysis | null>(null);

  const validate = (): string | null => {
    if (!proposalFile) return 'Please upload your proposal PDF.';
    if (!guidelinesFile) return 'Please upload the grant guidelines PDF.';
    if (!proposalFile.name.toLowerCase().endsWith('.pdf')) return 'Proposal file must be a PDF.';
    if (!guidelinesFile.name.toLowerCase().endsWith('.pdf')) return 'Guidelines file must be a PDF.';
    if (proposalFile.size > MAX_PDF_BYTES) return 'Proposal PDF exceeds the 25 MB limit.';
    if (guidelinesFile.size > MAX_PDF_BYTES) return 'Guidelines PDF exceeds the 25 MB limit.';
    return null;
  };

  const handleAnalyze = async () => {
    const err = validate();
    if (err) {
      setErrorMessage(err);
      return;
    }
    setErrorMessage(null);
    setStage('analyzing');
    try {
      const result = await analyzeProposal(proposalFile!, guidelinesFile!, {
        grantTitle: grantTitle.trim(),
        mode,
      });
      setPreviousAnalysis(null);
      setAnalysis(result);
      setStage('results');
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Unknown error during analysis.');
      setStage('error');
    }
  };

  const handleAnalyzeRevision = async () => {
    if (!revisionFile) {
      setErrorMessage('Please upload the revised proposal PDF.');
      return;
    }
    if (!revisionFile.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Revised proposal must be a PDF.');
      return;
    }
    if (revisionFile.size > MAX_PDF_BYTES) {
      setErrorMessage('Revised proposal exceeds the 25 MB limit.');
      return;
    }
    if (!guidelinesFile) {
      setErrorMessage('Guidelines PDF is missing. Start a new analysis.');
      return;
    }
    setErrorMessage(null);
    const baseline = analysis;
    setStage('analyzing');
    try {
      const result = await analyzeProposal(revisionFile, guidelinesFile, {
        grantTitle: grantTitle.trim(),
        mode,
      });
      setPreviousAnalysis(baseline);
      setAnalysis(result);
      setProposalFile(revisionFile);
      setRevisionFile(null);
      setStage('results');
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Unknown error during analysis.');
      setStage('error');
    }
  };

  const handleStartRevision = () => {
    setRevisionFile(null);
    setErrorMessage(null);
    setStage('revision');
  };

  const handleCancelRevision = () => {
    setRevisionFile(null);
    setErrorMessage(null);
    setStage(analysis ? 'results' : 'idle');
  };

  const handleReset = () => {
    setStage('idle');
    setErrorMessage(null);
  };

  const handleFullReset = () => {
    setStage('idle');
    setAnalysis(null);
    setPreviousAnalysis(null);
    setErrorMessage(null);
    setProposalFile(null);
    setGuidelinesFile(null);
    setRevisionFile(null);
    setGrantTitle('');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-brand-100/80 px-4 sm:px-6 py-4 flex items-center gap-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sticky top-0 z-30">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-900 transition-colors px-2 py-1.5 -ml-2 rounded-lg hover:bg-brand-100"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </button>
        <div className="h-5 w-px bg-brand-200" />
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-md shadow-primary-500/20 shrink-0">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-brand-900 tracking-tight leading-none truncate">
              AI Proposal Assistant
            </h1>
            <p className="text-[11px] text-brand-500 mt-1 leading-none truncate">
              Compare your draft against grant guidelines
            </p>
          </div>
        </div>
        {stage === 'results' && (
          <button
            onClick={handleFullReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-brand-200 hover:border-primary-300 hover:bg-primary-50 text-brand-700 hover:text-primary-700 text-xs font-semibold transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Analyze Another
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        {stage === 'idle' && (
          <UploadForm
            proposalFile={proposalFile}
            guidelinesFile={guidelinesFile}
            grantTitle={grantTitle}
            mode={mode}
            errorMessage={errorMessage}
            onProposal={setProposalFile}
            onGuidelines={setGuidelinesFile}
            onTitle={setGrantTitle}
            onMode={setMode}
            onAnalyze={handleAnalyze}
          />
        )}

        {stage === 'analyzing' && <AnalyzingState mode={mode} />}

        {stage === 'results' && analysis && (
          <ResultsView
            analysis={analysis}
            previousAnalysis={previousAnalysis}
            onStartRevision={handleStartRevision}
            onFullReset={handleFullReset}
          />
        )}

        {stage === 'revision' && analysis && (
          <RevisionForm
            grantTitle={grantTitle}
            mode={mode}
            guidelinesFile={guidelinesFile}
            previousProposalFile={proposalFile}
            revisionFile={revisionFile}
            errorMessage={errorMessage}
            onPickRevision={setRevisionFile}
            onAnalyze={handleAnalyzeRevision}
            onCancel={handleCancelRevision}
          />
        )}

        {stage === 'error' && (
          <ErrorView message={errorMessage ?? 'Something went wrong.'} onRetry={handleReset} />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Upload form
// =============================================================================

interface UploadFormProps {
  proposalFile: File | null;
  guidelinesFile: File | null;
  grantTitle: string;
  mode: AnalysisMode;
  errorMessage: string | null;
  onProposal: (f: File | null) => void;
  onGuidelines: (f: File | null) => void;
  onTitle: (s: string) => void;
  onMode: (m: AnalysisMode) => void;
  onAnalyze: () => void;
}

function UploadForm(props: UploadFormProps) {
  const ready = props.proposalFile && props.guidelinesFile;

  return (
    <div className="space-y-6 mt-4">
      {/* Hero */}
      <div className="rounded-2xl border border-brand-200/60 bg-white/70 backdrop-blur-sm p-6 sm:p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)]">
        <div className="flex items-start gap-4">
          <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-primary-50 to-primary-100/60 flex items-center justify-center shadow-inner border border-primary-100 shrink-0">
            <FileText className="w-7 h-7 text-primary-500" />
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center shadow-md shadow-primary-500/30">
              <Sparkles className="w-2.5 h-2.5 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-brand-900 tracking-tight">Compliance Check</h2>
            <p className="text-sm text-brand-500 mt-1 leading-relaxed">
              Upload your draft proposal and the funder's guidelines. The AI reviewer will assess
              section-by-section coverage, score compliance, and tell you exactly what to fix.
            </p>
          </div>
        </div>
      </div>

      {/* Drop zones */}
      <div className="grid sm:grid-cols-2 gap-4">
        <FileDropZone
          label="Proposal PDF"
          description="Your draft grant proposal"
          file={props.proposalFile}
          onFile={props.onProposal}
        />
        <FileDropZone
          label="Guidelines PDF"
          description="The funder's grant guidelines or call document"
          file={props.guidelinesFile}
          onFile={props.onGuidelines}
        />
      </div>

      {/* Optional title */}
      <div className="rounded-2xl border border-brand-200/60 bg-white/70 backdrop-blur-sm p-5">
        <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-2">
          Grant Title <span className="text-brand-500 font-normal normal-case">(optional)</span>
        </label>
        <input
          type="text"
          value={props.grantTitle}
          onChange={(e) => props.onTitle(e.target.value)}
          placeholder="e.g. NSF CAREER Award 2025 — Computational Biology"
          className="w-full px-4 py-2.5 rounded-lg border border-brand-200 bg-white text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition"
        />
      </div>

      {/* Mode toggle */}
      <ModeToggle mode={props.mode} onMode={props.onMode} />

      {/* Error */}
      {props.errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{props.errorMessage}</p>
        </div>
      )}

      {/* Analyze button */}
      <button
        onClick={props.onAnalyze}
        disabled={!ready}
        className={`w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
          ready
            ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 hover:-translate-y-0.5'
            : 'bg-brand-100 text-brand-400 cursor-not-allowed'
        }`}
      >
        <Sparkles className="w-4 h-4" />
        Analyze Proposal
      </button>
    </div>
  );
}

// =============================================================================
// File drop zone
// =============================================================================

interface FileDropZoneProps {
  label: string;
  description: string;
  file: File | null;
  onFile: (f: File | null) => void;
}

function FileDropZone({ label, description, file, onFile }: FileDropZoneProps) {
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const f = files[0];
      if (!f.name.toLowerCase().endsWith('.pdf')) {
        return;
      }
      onFile(f);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`relative rounded-2xl border-2 border-dashed transition-all p-6 bg-white/60 backdrop-blur-sm ${
        hover
          ? 'border-primary-400 bg-primary-50/60'
          : file
            ? 'border-primary-300 bg-primary-50/40'
            : 'border-brand-200 hover:border-primary-300'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="flex flex-col items-center text-center">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition ${
            file
              ? 'bg-primary-100 text-primary-600'
              : 'bg-brand-100 text-brand-500'
          }`}
        >
          {file ? <CheckCircle2 className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
        </div>

        <h3 className="text-sm font-bold text-brand-900">{label}</h3>
        <p className="text-xs text-brand-500 mt-0.5">{description}</p>

        {file ? (
          <div className="mt-4 w-full px-3 py-2 rounded-lg bg-white border border-primary-200 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary-600 shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-semibold text-brand-900 truncate">{file.name}</p>
              <p className="text-[10px] text-brand-500">{formatBytes(file.size)}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFile(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="p-1 rounded-md text-brand-500 hover:text-red-600 hover:bg-red-50 transition"
              aria-label="Remove file"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className="mt-4 px-4 py-2 rounded-lg bg-white border border-brand-200 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 text-brand-700 text-xs font-semibold transition-all"
          >
            Click to browse · or drop PDF here
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Mode toggle
// =============================================================================

function ModeToggle({ mode, onMode }: { mode: AnalysisMode; onMode: (m: AnalysisMode) => void }) {
  return (
    <div className="rounded-2xl border border-brand-200/60 bg-white/70 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <h3 className="text-sm font-bold text-brand-900">Analysis Depth</h3>
          <p className="text-xs text-brand-500 mt-0.5">Pick how thorough the review should be.</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <ModeCard
          active={mode === 'simple'}
          onClick={() => onMode('simple')}
          title="Quick"
          time="~10 seconds"
          description="One-shot review of the full proposal against guidelines."
        />
        <ModeCard
          active={mode === 'deep'}
          onClick={() => onMode('deep')}
          title="Deep"
          time="~30-90 seconds"
          description="Section-by-section evaluation with granular feedback."
        />
      </div>
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  time,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  time: string;
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border-2 p-4 transition-all ${
        active
          ? 'border-primary-400 bg-primary-50/60 shadow-md shadow-primary-500/10'
          : 'border-brand-200 bg-white hover:border-primary-200'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-bold text-brand-900">{title}</span>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
            active ? 'bg-primary-100 text-primary-700' : 'bg-brand-100 text-brand-500'
          }`}
        >
          {time}
        </span>
      </div>
      <p className="text-xs text-brand-500 leading-relaxed">{description}</p>
    </button>
  );
}

// =============================================================================
// Analyzing state
// =============================================================================

function AnalyzingState({ mode }: { mode: AnalysisMode }) {
  const eta = mode === 'deep' ? '30-90 seconds' : '~10 seconds';
  return (
    <div className="rounded-2xl border border-brand-200/60 bg-white/70 backdrop-blur-sm p-12 flex flex-col items-center text-center mt-8">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100/60 flex items-center justify-center mb-5 shadow-inner border border-primary-100">
        <Loader2 className="w-9 h-9 text-primary-500 animate-spin" />
      </div>
      <h2 className="text-xl font-bold text-brand-900 mb-2">
        {mode === 'deep'
          ? 'Running deep section-by-section analysis...'
          : 'Analyzing your proposal...'}
      </h2>
      <p className="text-sm text-brand-500 max-w-md leading-relaxed">
        Gemini 2.5 Pro is reading the guidelines and your proposal carefully. This typically takes {eta}.
        Don't refresh the page.
      </p>
    </div>
  );
}

// =============================================================================
// Error state
// =============================================================================

// =============================================================================
// Revision form (re-upload v2)
// =============================================================================

interface RevisionFormProps {
  grantTitle: string;
  mode: AnalysisMode;
  guidelinesFile: File | null;
  previousProposalFile: File | null;
  revisionFile: File | null;
  errorMessage: string | null;
  onPickRevision: (f: File | null) => void;
  onAnalyze: () => void;
  onCancel: () => void;
}

function RevisionForm(props: RevisionFormProps) {
  return (
    <div className="space-y-5 mt-4">
      <div className="rounded-2xl border border-brand-200/60 bg-white/70 backdrop-blur-sm p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)]">
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-50 to-primary-100/60 flex items-center justify-center shadow-inner border border-primary-100 shrink-0">
            <Sparkles className="w-6 h-6 text-primary-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-brand-900 tracking-tight">
              Upload Updated Proposal
            </h2>
            <p className="text-sm text-brand-500 mt-1 leading-relaxed">
              We'll re-run the analysis against the same guidelines and show you exactly what
              improved (and what didn't).
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 text-xs">
          <LockedInfoRow
            label="Guidelines"
            value={props.guidelinesFile?.name ?? '— missing —'}
          />
          <LockedInfoRow
            label="Previous version"
            value={props.previousProposalFile?.name ?? 'unknown'}
          />
          <LockedInfoRow
            label="Grant"
            value={props.grantTitle.trim() || 'untitled'}
          />
          <LockedInfoRow
            label="Mode"
            value={props.mode === 'deep' ? 'Deep' : 'Quick'}
          />
        </div>
      </div>

      <FileDropZone
        label="Revised Proposal PDF"
        description="Your updated draft — guidelines stay the same"
        file={props.revisionFile}
        onFile={props.onPickRevision}
      />

      {props.errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{props.errorMessage}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={props.onAnalyze}
          disabled={!props.revisionFile}
          className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
            props.revisionFile
              ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/25 hover:shadow-xl hover:-translate-y-0.5'
              : 'bg-brand-100 text-brand-400 cursor-not-allowed'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Analyze Revision
        </button>
        <button
          onClick={props.onCancel}
          className="px-6 py-3 rounded-xl bg-white border border-brand-200 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 text-brand-700 text-sm font-semibold transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function LockedInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-brand-50 border border-brand-100">
      <span className="text-[10px] font-bold uppercase tracking-wider text-brand-500 shrink-0">
        {label}
      </span>
      <span className="text-xs font-semibold text-brand-800 truncate">{value}</span>
    </div>
  );
}

// =============================================================================
// Diff summary (revision compare)
// =============================================================================

function DiffSummaryCard({ diff }: { diff: AnalysisDiff }) {
  const deltaPositive = diff.scoreDelta > 0;
  const deltaNeutral = diff.scoreDelta === 0;
  const deltaTone = deltaNeutral
    ? 'text-brand-600 bg-brand-100'
    : deltaPositive
      ? 'text-emerald-700 bg-emerald-100'
      : 'text-red-700 bg-red-100';

  const headline = deltaNeutral
    ? 'No change in overall score.'
    : deltaPositive
      ? `Overall score improved by ${diff.scoreDelta} point${Math.abs(diff.scoreDelta) === 1 ? '' : 's'}.`
      : `Overall score dropped by ${Math.abs(diff.scoreDelta)} point${Math.abs(diff.scoreDelta) === 1 ? '' : 's'}.`;

  const changedSections = diff.sections.filter(
    (s) => s.transition !== 'unchanged',
  );

  return (
    <div className="rounded-2xl border border-primary-200/60 bg-gradient-to-br from-primary-50/60 via-white to-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-primary-700 bg-primary-100 rounded-full px-2.5 py-1">
          Revision Compare
        </span>
        <h2 className="text-base font-bold text-brand-900">{headline}</h2>
      </div>

      <div className="flex items-center gap-4 mb-5">
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-brand-500">Before</div>
          <div className="text-2xl font-bold text-brand-800">{diff.previousScore}</div>
        </div>
        <ArrowRight className="w-5 h-5 text-brand-400" />
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-wider text-brand-500">After</div>
          <div className="text-2xl font-bold text-brand-900">{diff.currentScore}</div>
        </div>
        <div
          className={`ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${deltaTone}`}
        >
          {deltaPositive ? (
            <TrendingUp className="w-3.5 h-3.5" />
          ) : deltaNeutral ? (
            <Minus className="w-3.5 h-3.5" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5" />
          )}
          {deltaPositive ? '+' : ''}
          {diff.scoreDelta}
        </div>
      </div>

      {(diff.resolvedMissing.length > 0 || diff.newlyMissing.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          {diff.resolvedMissing.length > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  Now included
                </span>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {diff.resolvedMissing.map((s) => (
                  <li
                    key={s}
                    className="text-xs font-semibold text-emerald-900 bg-white border border-emerald-200 rounded-full px-2 py-0.5"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {diff.newlyMissing.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/70 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <XCircle className="w-3.5 h-3.5 text-red-600" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">
                  Newly missing
                </span>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {diff.newlyMissing.map((s) => (
                  <li
                    key={s}
                    className="text-xs font-semibold text-red-900 bg-white border border-red-200 rounded-full px-2 py-0.5"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {changedSections.length > 0 ? (
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-brand-500 mb-2">
            Section changes ({changedSections.length})
          </h3>
          <ul className="space-y-1.5">
            {changedSections.map((s) => (
              <DiffRow key={s.section_name} diff={s} />
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-brand-500 italic">
          Section-level results are unchanged. Look at the score and section feedback below for nuances.
        </p>
      )}
    </div>
  );
}

function DiffRow({ diff }: { diff: SectionDiff }) {
  const tone = transitionTone(diff.transition);
  const Icon = tone.icon;
  const prevLabel = diff.previousStatus
    ? `${diff.previousStatus} ${diff.previousScore ?? 0}`
    : '—';
  const currLabel = diff.currentStatus
    ? `${diff.currentStatus} ${diff.currentScore ?? 0}`
    : '—';

  return (
    <li className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-brand-100">
      <span className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${tone.bg}`}>
        <Icon className={`w-3.5 h-3.5 ${tone.text}`} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-brand-900 truncate">{diff.section_name}</div>
        <div className="text-[11px] text-brand-500 truncate">
          {prevLabel} <span className="text-brand-400">→</span> <span className={tone.text}>{currLabel}</span>
        </div>
      </div>
      {diff.scoreDelta !== 0 && (
        <span className={`text-xs font-bold shrink-0 ${tone.text}`}>
          {diff.scoreDelta > 0 ? '+' : ''}
          {diff.scoreDelta}
        </span>
      )}
    </li>
  );
}

interface TransitionTone {
  bg: string;
  text: string;
  icon: typeof TrendingUp;
}

function transitionTone(t: SectionTransition): TransitionTone {
  switch (t) {
    case 'improved':
      return { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: TrendingUp };
    case 'regressed':
      return { bg: 'bg-red-100', text: 'text-red-700', icon: TrendingDown };
    case 'newly_added':
      return { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2 };
    case 'newly_missing':
      return { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle };
    default:
      return { bg: 'bg-brand-100', text: 'text-brand-600', icon: Minus };
  }
}

// =============================================================================
// Error view
// =============================================================================

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/60 backdrop-blur-sm p-10 flex flex-col items-center text-center mt-8">
      <div className="w-14 h-14 rounded-xl bg-red-100 flex items-center justify-center mb-4">
        <XCircle className="w-7 h-7 text-red-600" />
      </div>
      <h2 className="text-lg font-bold text-brand-900 mb-2">Analysis failed</h2>
      <p className="text-sm text-red-700 max-w-md leading-relaxed mb-5">{message}</p>
      <button
        onClick={onRetry}
        className="px-5 py-2.5 rounded-xl bg-white border border-brand-200 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 text-brand-700 text-sm font-semibold transition-all"
      >
        Try Again
      </button>
    </div>
  );
}

// =============================================================================
// Results view
// =============================================================================

interface ResultsViewProps {
  analysis: ProposalAnalysis;
  previousAnalysis: ProposalAnalysis | null;
  onStartRevision: () => void;
  onFullReset: () => void;
}

function ResultsView({
  analysis,
  previousAnalysis,
  onStartRevision,
  onFullReset,
}: ResultsViewProps) {
  const diff = useMemo(
    () => (previousAnalysis ? diffAnalyses(previousAnalysis, analysis) : null),
    [previousAnalysis, analysis],
  );

  const handleExportMarkdown = () => downloadAnalysisAsMarkdown(analysis);
  const handlePrint = () => window.print();

  return (
    <div className="space-y-5 mt-4 proposal-report">
      <ResultsToolbar
        onExportMarkdown={handleExportMarkdown}
        onPrint={handlePrint}
        onStartRevision={onStartRevision}
        onFullReset={onFullReset}
      />
      {diff && <DiffSummaryCard diff={diff} />}
      <ScoreHero analysis={analysis} />
      {analysis.missing_sections.length > 0 && (
        <MissingSectionsBox missing={analysis.missing_sections} />
      )}
      {analysis.key_suggestions.length > 0 && (
        <KeySuggestionsBox suggestions={analysis.key_suggestions} />
      )}
      <SectionAccordion sections={analysis.section_feedback} />
    </div>
  );
}

function ResultsToolbar({
  onExportMarkdown,
  onPrint,
  onStartRevision,
  onFullReset,
}: {
  onExportMarkdown: () => void;
  onPrint: () => void;
  onStartRevision: () => void;
  onFullReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button
        onClick={onStartRevision}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 text-white text-xs font-semibold shadow-md shadow-primary-500/20 hover:shadow-lg hover:-translate-y-0.5 transition-all"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Re-analyze with Updated Version
      </button>
      <button
        onClick={onExportMarkdown}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-brand-200 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 text-brand-700 text-xs font-semibold transition-all"
      >
        <Download className="w-3.5 h-3.5" />
        Markdown
      </button>
      <button
        onClick={onPrint}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-brand-200 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 text-brand-700 text-xs font-semibold transition-all"
      >
        <Printer className="w-3.5 h-3.5" />
        Save as PDF
      </button>
      <div className="ml-auto" />
      <button
        onClick={onFullReset}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-brand-500 hover:text-brand-900 text-xs font-semibold transition-colors"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Start Over
      </button>
    </div>
  );
}

function ScoreHero({ analysis }: { analysis: ProposalAnalysis }) {
  const tone = scoreTone(analysis.overall_score);
  return (
    <div className="rounded-2xl border border-brand-200/60 bg-white/70 backdrop-blur-sm p-6 sm:p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-6 flex-col sm:flex-row">
        <ScoreRing score={analysis.overall_score} tone={tone} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary-700 bg-primary-50 border border-primary-200/60 rounded-full px-2.5 py-1">
              {analysis.mode === 'deep' ? 'Deep Analysis' : 'Quick Analysis'}
            </span>
            {analysis.grant_title && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-600 bg-brand-100 rounded-full px-2.5 py-1 truncate max-w-full">
                {analysis.grant_title}
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-brand-900 tracking-tight mb-2">
            Compliance Summary
          </h2>
          <p className="text-sm text-brand-500 leading-relaxed">{analysis.summary}</p>
        </div>
      </div>
    </div>
  );
}

function ScoreRing({ score, tone }: { score: number; tone: ToneSpec }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="relative w-28 h-28 shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" className="stroke-brand-100" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          className={tone.stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold ${tone.text}`}>{score}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-brand-500">/ 100</span>
      </div>
    </div>
  );
}

function MissingSectionsBox({ missing }: { missing: string[] }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 backdrop-blur-sm p-5 flex gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-amber-900 mb-1">Missing required sections</h3>
        <p className="text-xs text-amber-800 mb-3 leading-relaxed">
          The guidelines require these sections, but they could not be found in your proposal.
        </p>
        <ul className="flex flex-wrap gap-2">
          {missing.map((s) => (
            <li
              key={s}
              className="px-3 py-1 rounded-full bg-white border border-amber-200 text-xs font-semibold text-amber-900"
            >
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function KeySuggestionsBox({ suggestions }: { suggestions: string[] }) {
  return (
    <div className="rounded-2xl border border-primary-200/60 bg-gradient-to-br from-primary-50/70 to-white p-5 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-primary-600" />
        <h3 className="text-sm font-bold text-brand-900">Top recommendations</h3>
      </div>
      <ol className="space-y-2">
        {suggestions.map((s, idx) => (
          <li key={idx} className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-primary-500 text-white flex items-center justify-center text-xs font-bold">
              {idx + 1}
            </span>
            <span className="text-sm text-brand-800 leading-relaxed pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SectionAccordion({ sections }: { sections: SectionFeedback[] }) {
  const sorted = useMemo(() => {
    const order: Record<SectionStatus, number> = { missing: 0, weak: 1, strong: 2 };
    return [...sections].sort((a, b) => {
      const so = order[a.status] - order[b.status];
      if (so !== 0) return so;
      return a.score - b.score;
    });
  }, [sections]);

  return (
    <div className="rounded-2xl border border-brand-200/60 bg-white/70 backdrop-blur-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-brand-100">
        <h3 className="text-sm font-bold text-brand-900">Section-by-section feedback</h3>
        <p className="text-xs text-brand-500 mt-0.5">Click any section to expand details.</p>
      </div>
      <div className="divide-y divide-brand-100">
        {sorted.map((fb, idx) => (
          <SectionCard key={`${fb.section_name}-${idx}`} fb={fb} defaultOpen={idx < 2} />
        ))}
      </div>
    </div>
  );
}

function SectionCard({ fb, defaultOpen }: { fb: SectionFeedback; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const tone = statusTone(fb.status);

  return (
    <div className="bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-4 flex items-center gap-3 hover:bg-brand-50/60 transition text-left"
      >
        <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${tone.badgeBg}`}>
          {fb.status === 'strong' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          {fb.status === 'weak' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
          {fb.status === 'missing' && <XCircle className="w-4 h-4 text-red-600" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-sm font-bold text-brand-900 truncate">{fb.section_name}</span>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${tone.pill}`}
            >
              {fb.status}
            </span>
          </div>
          <ScoreBar score={fb.score} tone={tone} />
        </div>
        <ChevronDown
          className={`w-4 h-4 text-brand-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`px-5 pb-5 pt-1 ml-10 section-card-body ${open ? '' : 'hidden print:block'}`}
      >
        <p className="text-sm text-brand-700 leading-relaxed mb-3">{fb.feedback}</p>
        {fb.suggestions.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-500 mb-2">
              Suggested improvements
            </p>
            <ul className="space-y-1.5">
              {fb.suggestions.map((s, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-brand-700">
                  <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-500" />
                  <span className="leading-relaxed">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreBar({ score, tone }: { score: number; tone: ToneSpec }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-brand-100 overflow-hidden">
        <div
          className={`h-full ${tone.bar} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-bold ${tone.text}`}>{pct}</span>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

interface ToneSpec {
  text: string;
  stroke: string;
  bar: string;
  pill: string;
  badgeBg: string;
}

function scoreTone(score: number): ToneSpec {
  if (score >= 70) {
    return {
      text: 'text-emerald-600',
      stroke: 'stroke-emerald-500',
      bar: 'bg-emerald-500',
      pill: 'bg-emerald-100 text-emerald-700',
      badgeBg: 'bg-emerald-100',
    };
  }
  if (score >= 40) {
    return {
      text: 'text-amber-600',
      stroke: 'stroke-amber-500',
      bar: 'bg-amber-500',
      pill: 'bg-amber-100 text-amber-700',
      badgeBg: 'bg-amber-100',
    };
  }
  return {
    text: 'text-red-600',
    stroke: 'stroke-red-500',
    bar: 'bg-red-500',
    pill: 'bg-red-100 text-red-700',
    badgeBg: 'bg-red-100',
  };
}

function statusTone(status: SectionStatus): ToneSpec {
  if (status === 'strong') return scoreTone(85);
  if (status === 'weak') return scoreTone(50);
  return scoreTone(0);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
