import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { FileSearch, Loader2, MessageCircleQuestion, RotateCcw, Send } from 'lucide-react';
import { askGuidelines, type Application, type GuidelineAnswer } from '../../services/applicationsService';

/** One question and, once it arrives, its answer or the error. */
export interface AskEntry {
  id: number;
  question: string;
  answer?: GuidelineAnswer;
  error?: string;
}

interface AskGuidelinesTabProps {
  application: Application;
  /** Held by the application page, so switching tabs doesn't lose the answers. */
  entries: AskEntry[];
  onEntries: Dispatch<SetStateAction<AskEntry[]>>;
  onOpenChecklist: () => void;
}

const SUGGESTIONS = [
  'Can I buy a laptop from this grant?',
  'Is overhead allowed, and how much?',
  'Who has to sign or forward the proposal?',
  'Is there an age limit for the PI?',
  'Do I need to send a hard copy?',
];

const MAX_QUESTION = 500;

/**
 * Questions about the call's guidelines, answered only from the text read
 * for the checklist. Every answer shows the sentences it rests on, checked
 * against the document, or says the guidelines don't cover it.
 */
export default function AskGuidelinesTab({ application, entries, onEntries, onOpenChecklist }: AskGuidelinesTabProps) {
  const [question, setQuestion] = useState('');
  const pending = entries.some((entry) => !entry.answer && !entry.error);

  if (!application.guidelineExtractionId) {
    return (
      <div className="rounded-xl border border-brand-200 bg-white p-8 text-center flex flex-col items-center gap-3">
        <FileSearch className="w-8 h-8 text-brand-300" />
        <p className="text-sm text-brand-700 max-w-md">
          Read the call's guidelines in the Checklist tab first. You can then ask questions about them here, without uploading them again.
        </p>
        <button type="button" onClick={onOpenChecklist} className="px-4 py-2 rounded-lg text-sm font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100">
          Go to the checklist
        </button>
      </div>
    );
  }

  const ask = async (text: string, replaceId?: number) => {
    const trimmed = text.trim();
    if (trimmed.length < 3 || pending) return;
    const id = replaceId ?? entries.reduce((max, entry) => Math.max(max, entry.id), 0) + 1;
    onEntries((prev) =>
      replaceId === undefined
        ? [{ id, question: trimmed }, ...prev]
        : prev.map((entry) => (entry.id === id ? { id, question: trimmed } : entry)),
    );
    setQuestion('');
    try {
      const answer = await askGuidelines(application.id, trimmed);
      onEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, answer } : entry)));
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Could not answer that question';
      onEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, error } : entry)));
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(question);
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="rounded-xl border border-brand-200 bg-white p-4 shadow-card">
        <label htmlFor="guidelines-question" className="block text-sm font-semibold text-brand-900">
          Ask about this call's guidelines
        </label>
        <p className="mt-0.5 text-sm text-brand-600 text-pretty">
          Answers come only from the guidelines you read in the Checklist tab, with the sentences they're based on.
        </p>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <input
            id="guidelines-question"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={MAX_QUESTION}
            placeholder="e.g. Can I buy a laptop from this grant?"
            className="flex-1 min-w-0 bg-white border border-brand-300 rounded-lg px-3 py-2 text-sm text-brand-900 placeholder:text-brand-500 focus:outline-none focus:border-primary-600 focus:ring-3 focus:ring-primary-600/15"
          />
          <button
            type="submit"
            disabled={pending || question.trim().length < 3}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Ask
          </button>
        </div>
        {entries.length === 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void ask(suggestion)}
                className="px-2.5 py-1 rounded-full border border-brand-300 bg-white text-xs font-medium text-brand-800 hover:border-primary-500 hover:text-primary-700"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </form>

      <ul className="flex flex-col gap-3" aria-live="polite">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-xl border border-brand-200 bg-white p-4 shadow-card">
            <p className="flex gap-2 text-sm font-semibold text-brand-900">
              <MessageCircleQuestion className="w-4 h-4 text-primary-600 shrink-0 mt-0.5" aria-hidden="true" />
              {entry.question}
            </p>
            {entry.answer ? (
              <AnswerView answer={entry.answer} />
            ) : entry.error ? (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                <span className="text-red-700">{entry.error}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void ask(entry.question, entry.id)}
                  className="inline-flex items-center gap-1 font-semibold text-primary-700 hover:text-primary-800 disabled:opacity-60"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Try again
                </button>
              </div>
            ) : (
              <p className="mt-2 flex items-center gap-2 text-sm text-brand-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Reading the guidelines…
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnswerView({ answer }: { answer: GuidelineAnswer }) {
  return (
    <div className="mt-2">
      {answer.status !== 'answered' && (
        <span className="inline-block mb-1.5 px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          {answer.status === 'partial' ? 'Not stated directly: confirm with the agency' : 'Not in the guidelines'}
        </span>
      )}
      <p className="text-sm text-brand-800 leading-relaxed text-pretty">{answer.answer}</p>

      {answer.citations.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {answer.citations.map((citation) => (
            <blockquote
              key={citation.quote}
              className="text-xs text-brand-700 bg-brand-50 border-l-2 border-primary-300 pl-3 pr-2 py-2 rounded-r-md"
            >
              “{citation.quote}”
              <span className="mt-1 flex flex-wrap items-center gap-2 not-italic text-brand-500">
                {citation.page && <span>Page {citation.page} of the guidelines</span>}
                {!citation.verified && (
                  <span
                    className="px-1.5 py-0.5 rounded-md font-semibold bg-amber-50 text-amber-800 border border-amber-200"
                    title="This sentence wasn't found in the document. Check it against the guidelines."
                  >
                    Unverified source
                  </span>
                )}
              </span>
            </blockquote>
          ))}
        </div>
      )}

      {answer.warnings.map((warning) => (
        <p key={warning} className="mt-2 text-xs text-amber-800">
          {warning}
        </p>
      ))}
    </div>
  );
}
