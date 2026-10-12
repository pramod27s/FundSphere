import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Copy, Download, FileText, Loader2, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import {
  deleteReportDraft,
  downloadReportDocx,
  fetchReportDraft,
  generateReportDraft,
  updateReportDraft,
  type DraftSection,
  type DraftSentence,
  type ReportDraft,
} from '../../services/awardsService';
import { formatDay, formatTimestampDay } from '../../utils/applicationDates';

const BUTTON =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-800 bg-white border border-brand-300 hover:bg-brand-50 disabled:opacity-60 shrink-0';

/** Unsupported and not kept by the PI: what still needs fixing. */
function needsFixing(sentence: DraftSentence) {
  return !sentence.placeholder && !sentence.supported && !sentence.confirmed;
}

function allSentences(sections: DraftSection[]): DraftSentence[] {
  return sections.flatMap((section) => section.blocks.flatMap((block) => block.sentences));
}

/**
 * 4.4: one progress-report draft, laid out like the report. Click a sentence
 * to see the records it cites and edit it. Sentences the check couldn't trace
 * to a record are marked red; places left for the PI to fill in, amber. Every
 * edit is checked again against the grant's current records.
 */
export default function ReportEditor() {
  const { id, draftId } = useParams();
  const awardId = Number(id);
  const reportId = Number(draftId);
  const validIds = Number.isInteger(awardId) && awardId > 0 && Number.isInteger(reportId) && reportId > 0;
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<'again' | 'delete' | 'export' | null>(null);

  useEffect(() => {
    if (!validIds) return;
    let cancelled = false;
    fetchReportDraft(awardId, reportId)
      .then((loaded) => !cancelled && setDraft(loaded))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load the draft'));
    return () => {
      cancelled = true;
    };
  }, [validIds, awardId, reportId]);

  const content = draft?.content ?? null;
  const labels = useMemo(() => new Map((content?.entries ?? []).map((e) => [e.id, e.label])), [content]);
  const back = () => navigate(`/my-grants/${awardId}`);

  if (!validIds || error) {
    return (
      <Frame onBack={back} title="Progress report">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {validIds ? error : 'Draft not found'}
        </div>
      </Frame>
    );
  }
  if (!draft || !content) {
    return (
      <Frame onBack={back} title="Progress report">
        <div className="flex items-center justify-center py-24 text-brand-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading…
        </div>
      </Frame>
    );
  }

  /** Replaces (or, when change returns null, deletes) one sentence and saves; the server checks it again. */
  const saveSentence = async (sentenceId: string, change: (sentence: DraftSentence) => DraftSentence | null) => {
    const sections = content.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) => ({
        ...block,
        sentences: block.sentences.flatMap((s) => {
          if (s.id !== sentenceId) return [s];
          const changed = change(s);
          return changed ? [changed] : [];
        }),
      })),
    }));
    setSaving(true);
    try {
      setDraft(await updateReportDraft(awardId, reportId, sections));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the draft');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const sentences = allSentences(content.sections);
  const toFix = sentences.filter(needsFixing);

  const showNextToFix = () => {
    if (toFix.length === 0) return;
    const position = sentences.findIndex((s) => s.id === selected);
    const next = sentences.slice(position + 1).find(needsFixing) ?? toFix[0];
    setSelected(next.id);
    document.getElementById(`sentence-${next.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const draftAgain = async () => {
    setBusy('again');
    try {
      const fresh = await generateReportDraft(
        awardId,
        draft.eventId !== null
          ? { eventId: draft.eventId, outputIds: draft.outputIds, notes: draft.notes }
          : { kind: draft.kind, periodStart: draft.periodStart, periodEnd: draft.periodEnd, outputIds: draft.outputIds, notes: draft.notes },
      );
      setSelected(null);
      setDraft(null);
      navigate(`/my-grants/${awardId}/reports/${fresh.id}`);
      toast.success('New draft written');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not write the draft');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete this draft of "${draft.title}"? This can't be undone.`)) return;
    setBusy('delete');
    try {
      await deleteReportDraft(awardId, reportId);
      toast.success('Draft deleted');
      back();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the draft');
      setBusy(null);
    }
  };

  const exportWord = async () => {
    if (
      draft.unsupportedCount > 0 &&
      !window.confirm(
        `${draft.unsupportedCount} ${draft.unsupportedCount === 1 ? 'sentence isn’t' : 'sentences aren’t'} supported by your records. ` +
          'The Word file says so at the top and shows them in red. Export anyway?',
      )
    ) {
      return;
    }
    setBusy('export');
    try {
      await downloadReportDocx(awardId, reportId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not export the draft');
    } finally {
      setBusy(null);
    }
  };

  const copyText = async () => {
    if (
      draft.unsupportedCount > 0 &&
      !window.confirm(
        `${draft.unsupportedCount} ${draft.unsupportedCount === 1 ? 'sentence isn’t' : 'sentences aren’t'} supported by your records. Copy anyway?`,
      )
    ) {
      return;
    }
    try {
      await navigator.clipboard.writeText(plainText(draft, content.sections));
      toast.success('Draft copied');
    } catch {
      toast.error('Copy failed. Select the text and copy it yourself.');
    }
  };

  return (
    <Frame
      onBack={back}
      title={draft.title}
      subtitle={`Draft · ${formatDay(draft.periodStart)} – ${formatDay(draft.periodEnd)}`}
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportWord}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 shrink-0"
          >
            {busy === 'export' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Export to Word</span>
          </button>
          <button type="button" onClick={copyText} className={BUTTON}>
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Copy text</span>
          </button>
          <button type="button" onClick={draftAgain} disabled={busy !== null} className={BUTTON}>
            {busy === 'again' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Draft again</span>
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy !== null}
            className={`${BUTTON} text-red-700 hover:bg-red-50`}
            aria-label="Delete draft"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 mb-5" aria-live="polite">
        {toFix.length > 0 ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="flex-1 text-sm text-red-900">
              <span className="font-semibold">
                {toFix.length} {toFix.length === 1 ? 'sentence isn’t' : 'sentences aren’t'} supported by your records.
              </span>{' '}
              Fix or delete {toFix.length === 1 ? 'it' : 'them'}, or keep {toFix.length === 1 ? 'it' : 'them'} if
              you've checked.
            </p>
            <button
              type="button"
              onClick={showNextToFix}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 shrink-0"
            >
              Show the next one
            </button>
          </div>
        ) : (
          <p className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900">
            <span className="font-semibold">Every sentence traces to your records.</span>
            {draft.confirmedCount > 0 &&
              ` ${draft.confirmedCount} ${draft.confirmedCount === 1 ? 'is' : 'are'} kept as you wrote ${draft.confirmedCount === 1 ? 'it' : 'them'}.`}
          </p>
        )}
        {draft.placeholderCount > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            {draft.placeholderCount} {draft.placeholderCount === 1 ? 'place is' : 'places are'} left for you to fill in,
            marked in amber.
          </p>
        )}
        {content.warnings.map((warning) => (
          <p key={warning} className="flex items-start gap-1.5 text-xs text-amber-800">
            <TriangleAlert className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
            {warning}
          </p>
        ))}
        <p className="text-xs text-brand-500">Click any sentence to see the records it comes from, or to edit it.</p>
      </div>

      <article className="bg-white border border-brand-200 rounded-xl p-6 sm:p-10 shadow-xs">
        <p className="text-[11px] font-bold tracking-widest text-amber-700 uppercase">Draft</p>
        <h2 className="text-2xl font-bold text-brand-900 tracking-tight mt-1">{content.title}</h2>

        {content.sections.map((section) => (
          <section key={section.key} className="mt-8">
            <h3 className="text-lg font-bold text-brand-900 tracking-tight border-b border-brand-100 pb-1">{section.heading}</h3>
            {section.blocks.map((block, index) => {
              const open = block.sentences.find((s) => s.id === selected);
              const sentence = (s: DraftSentence) => (
                <SentenceText
                  sentence={s}
                  selected={s.id === selected}
                  onSelect={() => setSelected(s.id === selected ? null : s.id)}
                />
              );
              return (
                <div key={index} className="mt-3">
                  {block.heading && <h4 className="text-sm font-semibold text-brand-800 mb-1">{block.heading}</h4>}
                  {block.style === 'list' ? (
                    <ul className="list-disc pl-5 flex flex-col gap-1 text-[15px] leading-relaxed text-brand-900">
                      {block.sentences.map((s) => (
                        <li key={s.id}>{sentence(s)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[15px] leading-relaxed text-brand-900">
                      {block.sentences.map((s, i) => (
                        <Fragment key={s.id}>
                          {i > 0 && ' '}
                          {sentence(s)}
                        </Fragment>
                      ))}
                    </p>
                  )}
                  {open && (
                    <SentencePanel
                      key={`${open.id}:${open.text}:${open.confirmed}`}
                      sentence={open}
                      labels={labels}
                      saving={saving}
                      onSave={(text) => saveSentence(open.id, (s) => ({ ...s, text, edited: true, confirmed: false }))}
                      onConfirm={(confirmed) => saveSentence(open.id, (s) => ({ ...s, confirmed }))}
                      onDelete={async () => {
                        if (await saveSentence(open.id, () => null)) setSelected(null);
                      }}
                      onClose={() => setSelected(null)}
                    />
                  )}
                </div>
              );
            })}
          </section>
        ))}

        <p className="mt-10 pt-4 border-t border-brand-100 text-xs text-brand-500">
          Drafted {formatTimestampDay(draft.createdAt)}
          {draft.model ? ` · narrative written by ${draft.model}` : ''} · last checked {formatTimestampDay(draft.updatedAt)}
        </p>
      </article>
    </Frame>
  );
}

function SentenceText({ sentence, selected, onSelect }: { sentence: DraftSentence; selected: boolean; onSelect: () => void }) {
  const tone = selected
    ? 'bg-primary-100 ring-2 ring-primary-300'
    : sentence.placeholder
      ? 'bg-amber-50 text-amber-900 italic hover:bg-amber-100'
      : needsFixing(sentence)
        ? 'bg-red-50 text-red-900 underline decoration-red-400 decoration-wavy underline-offset-4 hover:bg-red-100'
        : sentence.confirmed
          ? 'underline decoration-brand-300 decoration-dotted underline-offset-4 hover:bg-brand-50'
          : 'hover:bg-primary-50';
  const status = sentence.placeholder
    ? 'For you to fill in'
    : needsFixing(sentence)
      ? 'Not supported by your records'
      : sentence.confirmed
        ? 'Kept as written'
        : 'Supported';
  return (
    <button
      type="button"
      id={`sentence-${sentence.id}`}
      onClick={onSelect}
      aria-expanded={selected}
      title={status}
      className={`inline text-left rounded-sm px-0.5 -mx-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${tone}`}
    >
      {sentence.text}
      <span className="sr-only"> ({status})</span>
    </button>
  );
}

function SentencePanel({
  sentence,
  labels,
  saving,
  onSave,
  onConfirm,
  onDelete,
  onClose,
}: {
  sentence: DraftSentence;
  labels: Map<string, string>;
  saving: boolean;
  onSave: (text: string) => Promise<boolean>;
  onConfirm: (confirmed: boolean) => Promise<boolean>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(sentence.text);
  const changed = text.trim() !== sentence.text && text.trim() !== '';

  return (
    <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-4 flex flex-col gap-3">
      {sentence.placeholder ? (
        <p className="text-xs text-amber-900">
          A place for you to fill in. Replace the text in brackets with your own, or delete it.
        </p>
      ) : needsFixing(sentence) || sentence.confirmed ? (
        <div className={`text-xs ${sentence.confirmed ? 'text-brand-700' : 'text-red-800'}`}>
          <p className="font-semibold">
            {sentence.confirmed ? 'You kept this as written, although:' : 'Not supported by your records:'}
          </p>
          <ul className="list-disc pl-4 mt-1">
            {sentence.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs font-semibold text-primary-800">Supported by the records it cites.</p>
      )}

      {!sentence.placeholder && (
        <div className="text-xs">
          <p className="font-semibold text-brand-700 mb-1">Comes from</p>
          {sentence.sources.length === 0 ? (
            <p className="text-brand-500">No records cited.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {sentence.sources.map((source) => (
                <li
                  key={source}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${
                    labels.has(source) ? 'bg-white border-brand-200 text-brand-800' : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  <FileText className="w-3 h-3 shrink-0" aria-hidden="true" />
                  {labels.get(source) ?? `${source} (no longer one of your records)`}
                </li>
              ))}
            </ul>
          )}
          <p className="text-brand-500 mt-1.5">
            {sentence.origin === 'AI' ? 'Written by the AI' : 'Written from your records'}
            {sentence.edited ? ', edited by you' : ''}.
          </p>
        </div>
      )}

      <div>
        <label htmlFor={`edit-${sentence.id}`} className="block text-xs font-semibold text-brand-700 mb-1">
          Sentence
        </label>
        <textarea
          id={`edit-${sentence.id}`}
          rows={3}
          className="w-full bg-white border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-900 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1500}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onSave(text.trim())}
          disabled={!changed || saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Save and check
        </button>
        {needsFixing(sentence) && (
          <button type="button" onClick={() => onConfirm(true)} disabled={saving} className={BUTTON}>
            Keep as written
          </button>
        )}
        {sentence.confirmed && (
          <button type="button" onClick={() => onConfirm(false)} disabled={saving} className={BUTTON}>
            Mark as not checked
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          Delete sentence
        </button>
        <button type="button" onClick={onClose} className="px-2 py-1.5 text-xs font-medium text-brand-600 hover:text-brand-900">
          Close
        </button>
      </div>
    </div>
  );
}

/** The draft as plain text for pasting, marked as a draft, with any unsupported sentences counted at the top. */
function plainText(draft: ReportDraft, sections: DraftSection[]): string {
  const lines = ['DRAFT. Check every line before you submit it.'];
  if (draft.unsupportedCount > 0) {
    lines.push(`${draft.unsupportedCount} sentence(s) are not supported by your recorded outputs.`);
  }
  lines.push('', draft.content?.title ?? draft.title);
  for (const section of sections) {
    lines.push('', section.heading.toUpperCase());
    for (const block of section.blocks) {
      if (block.heading) lines.push('', block.heading);
      if (block.style === 'list') {
        block.sentences.forEach((s) => lines.push(`• ${s.text}`));
      } else {
        lines.push(block.sentences.map((s) => s.text).join(' '));
      }
    }
  }
  return lines.join('\n');
}

function Frame({
  onBack,
  title,
  subtitle,
  actions,
  children,
}: {
  onBack: () => void;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-white border-b border-brand-200 px-4 sm:px-6 h-16 flex items-center gap-4 sticky top-0 z-30">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-900 transition-colors px-2 py-1.5 -ml-2 rounded-lg hover:bg-brand-100"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Grant</span>
        </button>
        <div className="h-5 w-px bg-brand-200" />
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-bold text-brand-900 tracking-tight leading-tight truncate" title={title}>
            {title}
          </h1>
          {subtitle && <p className="text-xs text-brand-600 leading-none mt-0.5 truncate">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:py-8">{children}</div>
    </div>
  );
}
