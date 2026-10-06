import { useState, type FormEvent } from 'react';
import { Check, ChevronDown, FileSearch, Loader2, Pencil, Plus, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import type {
  Application,
  ChecklistCategory,
  ChecklistItem,
  ChecklistItemChanges,
} from '../../services/applicationsService';
import { formatTimestampDay } from '../../utils/applicationDates';
import ExtractChecklistPanel from './ExtractChecklistPanel';
import { CATEGORY_META, CATEGORY_ORDER } from './applicationMeta';

interface ChecklistTabProps {
  application: Application;
  items: ChecklistItem[];
  onApplication: (application: Application) => void;
  onPatchItem: (itemId: number, changes: ChecklistItemChanges) => void;
  onDeleteItem: (itemId: number) => void;
  onAddItem: (item: ChecklistItemChanges & { text: string }) => Promise<boolean>;
}

/** 3.2: the requirements checklist, grouped by category, with every source quote. */
export default function ChecklistTab({ application, items, onApplication, onPatchItem, onDeleteItem, onAddItem }: ChecklistTabProps) {
  const hasChecklist = Boolean(application.checklistGeneratedAt);
  const [reextracting, setReextracting] = useState(false);

  const groups = CATEGORY_ORDER
    .map((category) => ({ category, items: items.filter((i) => i.category === category) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {(!hasChecklist || reextracting) && (
        <ExtractChecklistPanel
          application={application}
          onExtracted={(updated) => {
            setReextracting(false);
            onApplication(updated);
          }}
          onCancel={hasChecklist ? () => setReextracting(false) : undefined}
        />
      )}

      {hasChecklist && !reextracting && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-600">
          <FileSearch className="w-3.5 h-3.5 text-brand-400" />
          <span className="min-w-0 truncate max-w-full">
            From <span className="font-semibold text-brand-800 break-all">{application.guidelinesSource || 'the guidelines'}</span>
            {' · '}
            {formatTimestampDay(application.checklistGeneratedAt)}
          </span>
          <button
            type="button"
            onClick={() => setReextracting(true)}
            className="inline-flex items-center gap-1 font-semibold text-primary-700 hover:text-primary-800"
          >
            <RefreshCw className="w-3 h-3" />
            Read again
          </button>
        </div>
      )}

      {hasChecklist && application.checklistWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2.5">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
          <ul className="flex flex-col gap-1">
            {application.checklistWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {groups.map(({ category, items: groupItems }) => (
        <section key={category} className="bg-white border border-brand-200 rounded-lg overflow-hidden">
          <header className="px-4 py-3 border-b border-brand-100 bg-brand-50 flex items-baseline justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-brand-900">{CATEGORY_META[category].label}</h3>
              <p className="text-xs text-brand-500">{CATEGORY_META[category].hint}</p>
            </div>
            <span className="text-xs text-brand-500 tabular-nums shrink-0">
              {groupItems.filter((i) => i.status === 'DONE').length}/{groupItems.filter((i) => i.status !== 'NA').length} done
            </span>
          </header>
          <ul className="divide-y divide-brand-100">
            {groupItems.map((item) => (
              <ChecklistRow key={item.id} item={item} onPatch={onPatchItem} onDelete={onDeleteItem} />
            ))}
          </ul>
        </section>
      ))}

      {(hasChecklist || items.length > 0) && <AddItemForm onAdd={onAddItem} />}

      {!hasChecklist && items.length === 0 && <AddItemDisclosure onAdd={onAddItem} />}
    </div>
  );
}

function ChecklistRow({
  item,
  onPatch,
  onDelete,
}: {
  item: ChecklistItem;
  onPatch: (itemId: number, changes: ChecklistItemChanges) => void;
  onDelete: (itemId: number) => void;
}) {
  const [showSource, setShowSource] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ text: item.text, category: item.category, mandatory: item.mandatory, signOff: item.signOff });
  const done = item.status === 'DONE';
  const na = item.status === 'NA';

  const startEditing = () => {
    setDraft({ text: item.text, category: item.category, mandatory: item.mandatory, signOff: item.signOff });
    setEditing(true);
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.text.trim()) return;
    onPatch(item.id, { ...draft, text: draft.text.trim() });
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="px-4 py-3 bg-primary-50/40">
        <form onSubmit={save} className="flex flex-col gap-3">
          <textarea
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            rows={2}
            maxLength={1000}
            autoFocus
            className="w-full bg-white border border-brand-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200 resize-y"
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <CategorySelect value={draft.category} onChange={(category) => setDraft({ ...draft, category })} />
            <label className="inline-flex items-center gap-1.5 text-brand-700">
              <input type="checkbox" checked={draft.mandatory} onChange={(e) => setDraft({ ...draft, mandatory: e.target.checked })} />
              Required
            </label>
            <label className="inline-flex items-center gap-1.5 text-brand-700" title="Needs a signature from outside the team, e.g. Head of Institution. Due 7 days before the deadline.">
              <input type="checkbox" checked={draft.signOff} onChange={(e) => setDraft({ ...draft, signOff: e.target.checked })} />
              Needs a sign-off
            </label>
            <div className="flex-1" />
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-md font-medium text-brand-600 hover:bg-brand-100">
              Cancel
            </button>
            <button type="submit" className="px-3 py-1.5 rounded-md font-semibold text-white bg-primary-600 hover:bg-primary-700">
              Save
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={`px-4 py-3 flex gap-3 ${na ? 'bg-brand-50/60' : ''}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark "${item.text}" as not done` : `Mark "${item.text}" as done`}
        disabled={na}
        onClick={() => onPatch(item.id, { status: done ? 'TODO' : 'DONE' })}
        className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
          done ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-brand-300 hover:border-primary-400'
        } disabled:opacity-40`}
      >
        {done && <Check className="w-3.5 h-3.5" />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${na ? 'text-brand-400 line-through' : done ? 'text-brand-500' : 'text-brand-900'}`}>
          {item.text}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {!item.mandatory && <Badge tone="neutral">Optional</Badge>}
          {item.signOff && <Badge tone="blue">Needs a sign-off</Badge>}
          {na && <Badge tone="neutral">Not applicable</Badge>}
          {item.origin === 'MANUAL' && <Badge tone="neutral">Added by you</Badge>}
          {item.origin === 'AI' && item.sourceVerified === false && (
            <Badge tone="amber" title="This quote wasn't found in the document. Check it against the guidelines.">
              Unverified source
            </Badge>
          )}
          {item.sourceQuote && (
            <button
              type="button"
              onClick={() => setShowSource((v) => !v)}
              aria-expanded={showSource}
              className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary-700 hover:text-primary-800"
            >
              Source{item.sourcePage ? `, p. ${item.sourcePage}` : ''}
              <ChevronDown className={`w-3 h-3 transition-transform ${showSource ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
        {showSource && item.sourceQuote && (
          <blockquote className="mt-2 text-xs text-brand-700 bg-brand-50 border-l-2 border-primary-300 pl-3 pr-2 py-2 rounded-r-md">
            “{item.sourceQuote}”
            {item.sourcePage && <span className="block mt-1 text-brand-500 not-italic">Page {item.sourcePage} of the guidelines</span>}
          </blockquote>
        )}
      </div>

      <div className="flex items-start gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => onPatch(item.id, { status: na ? 'TODO' : 'NA' })}
          className="px-2 py-1 rounded-md text-[11px] font-semibold text-brand-500 hover:bg-brand-100 hover:text-brand-800"
          title={na ? 'This applies to us after all' : "Doesn't apply to this application"}
        >
          {na ? 'Applies' : 'N/A'}
        </button>
        <button type="button" onClick={startEditing} className="p-1.5 rounded-md text-brand-500 hover:bg-brand-100 hover:text-brand-800" aria-label={`Edit "${item.text}"`}>
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => window.confirm(`Delete "${item.text}"?`) && onDelete(item.id)}
          className="p-1.5 rounded-md text-brand-500 hover:bg-red-50 hover:text-red-600"
          aria-label={`Delete "${item.text}"`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </li>
  );
}

function Badge({ tone, title, children }: { tone: 'neutral' | 'blue' | 'amber'; title?: string; children: string }) {
  const tones = {
    neutral: 'bg-brand-100 text-brand-600',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-100 text-amber-800',
  };
  return (
    <span title={title} className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${tones[tone]}`}>
      {children}
    </span>
  );
}

function CategorySelect({ value, onChange }: { value: ChecklistCategory; onChange: (c: ChecklistCategory) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ChecklistCategory)}
      className="bg-white border border-brand-200 rounded-md px-2 py-1.5 text-xs text-brand-800 focus:outline-none focus:border-primary-400"
      aria-label="Category"
    >
      {CATEGORY_ORDER.map((c) => (
        <option key={c} value={c}>{CATEGORY_META[c].label}</option>
      ))}
    </select>
  );
}

function AddItemForm({ onAdd }: { onAdd: ChecklistTabProps['onAddItem'] }) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<ChecklistCategory>('DOCUMENTS');
  const [signOff, setSignOff] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    const ok = await onAdd({ text: text.trim(), category, signOff });
    setSaving(false);
    if (ok) {
      setText('');
      setSignOff(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-white border border-dashed border-brand-300 rounded-lg p-4 flex flex-col gap-3">
      <label className="text-xs font-semibold text-brand-700" htmlFor="add-requirement">
        Add a requirement the AI missed, or your own task
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          id="add-requirement"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder="e.g. Get Co-PI's consent letter from IIT Dharwad"
          className="flex-1 bg-white border border-brand-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200"
        />
        <button
          type="submit"
          disabled={saving || !text.trim()}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <CategorySelect value={category} onChange={setCategory} />
        <label className="inline-flex items-center gap-1.5 text-brand-700">
          <input type="checkbox" checked={signOff} onChange={(e) => setSignOff(e.target.checked)} />
          Needs a sign-off (due 7 days before the deadline)
        </label>
      </div>
    </form>
  );
}

function AddItemDisclosure({ onAdd }: { onAdd: ChecklistTabProps['onAddItem'] }) {
  const [open, setOpen] = useState(false);
  if (open) return <AddItemForm onAdd={onAdd} />;
  return (
    <p className="text-center text-sm text-brand-500">
      No guidelines to hand?{' '}
      <button type="button" onClick={() => setOpen(true)} className="font-semibold text-primary-700 hover:text-primary-800">
        Add items yourself
      </button>
    </p>
  );
}
