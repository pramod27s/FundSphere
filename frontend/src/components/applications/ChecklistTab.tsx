import { useState, type FormEvent } from 'react';
import { Check, ChevronDown, FileSearch, FileText, Loader2, Plus, RefreshCw, TriangleAlert } from 'lucide-react';
import { ROW_ACTION } from '../common/buttonStyles';
import MoreActions from '../common/MoreActions';
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

type CategoryFilter = 'ALL' | ChecklistCategory;

/** Done and counted items; not-applicable ones don't count, as in each section's header. */
function progressOf(list: ChecklistItem[]): { done: number; total: number } {
  const counted = list.filter((i) => i.status !== 'NA');
  return { done: counted.filter((i) => i.status === 'DONE').length, total: counted.length };
}

/** 3.2: the requirements checklist, grouped by category, with every source quote. */
export default function ChecklistTab({ application, items, onApplication, onPatchItem, onDeleteItem, onAddItem }: ChecklistTabProps) {
  const hasChecklist = Boolean(application.checklistGeneratedAt);
  const [reextracting, setReextracting] = useState(false);
  const [filter, setFilter] = useState<CategoryFilter>('ALL');

  const groups = CATEGORY_ORDER
    .map((category) => ({ category, items: items.filter((i) => i.category === category) }))
    .filter((g) => g.items.length > 0);
  // A category whose last item was deleted or moved falls back to showing everything.
  const active: CategoryFilter = filter !== 'ALL' && groups.some((g) => g.category === filter) ? filter : 'ALL';
  const shown = active === 'ALL' ? groups : groups.filter((g) => g.category === active);
  const overall = progressOf(items);

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
          <button type="button" onClick={() => setReextracting(true)} className={ROW_ACTION.secondary}>
            <RefreshCw className="w-3.5 h-3.5" />
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

      {/* One category at a time, with each one's progress on its chip (this replaced the "By category" panel). */}
      {groups.length > 1 && (
        <div role="group" aria-label="Show one category" className="flex flex-wrap gap-2">
          <FilterChip label="All" progress={overall} active={active === 'ALL'} onClick={() => setFilter('ALL')} />
          {groups.map(({ category, items: groupItems }) => (
            <FilterChip
              key={category}
              label={CATEGORY_META[category].label}
              progress={progressOf(groupItems)}
              active={active === category}
              onClick={() => setFilter(active === category ? 'ALL' : category)}
            />
          ))}
        </div>
      )}

      {shown.map(({ category, items: groupItems }) => (
        <section key={category} className="bg-white border border-brand-200 rounded-lg overflow-hidden">
          <header className="px-4 py-3 border-b border-brand-100 bg-brand-50 flex items-baseline justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-brand-900">{CATEGORY_META[category].label}</h3>
              <p className="text-xs text-brand-500">{CATEGORY_META[category].hint}</p>
            </div>
            <span className="text-xs text-brand-500 tabular-nums shrink-0">
              {progressOf(groupItems).done}/{progressOf(groupItems).total} done
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

  const badges = [
    !item.mandatory && <Badge key="optional" tone="neutral">Optional</Badge>,
    item.signOff && <Badge key="signoff" tone="blue">Needs a sign-off</Badge>,
    na && <Badge key="na" tone="neutral">Not applicable</Badge>,
    item.origin === 'MANUAL' && <Badge key="manual" tone="neutral">Added by you</Badge>,
    item.origin === 'AI' && item.sourceVerified === false && (
      <Badge key="unverified" tone="amber" title="This quote wasn't found in the document. Check it against the guidelines.">
        Unverified source
      </Badge>
    ),
  ].filter(Boolean);

  const sourceButton = item.sourceQuote && (
    <button
      type="button"
      onClick={() => setShowSource((v) => !v)}
      aria-expanded={showSource}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold text-primary-700 whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
        showSource ? 'bg-primary-100 border-primary-300' : 'bg-primary-50 border-primary-200 hover:bg-primary-100 hover:border-primary-300'
      }`}
    >
      <FileText className="w-3 h-3" aria-hidden="true" />
      Source{item.sourcePage ? `, p. ${item.sourcePage}` : ''}
      <ChevronDown className={`w-3 h-3 transition-transform ${showSource ? 'rotate-180' : ''}`} />
    </button>
  );

  // One line per item where it fits: the text with its badges, then Source and the menu on the right.
  return (
    <li className={`px-4 py-2.5 flex items-start gap-3 ${na ? 'bg-brand-50/60' : ''}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Mark "${item.text}" as not done` : `Mark "${item.text}" as done`}
        disabled={na}
        onClick={() => onPatch(item.id, { status: done ? 'TODO' : 'DONE' })}
        className={`mt-1 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
          done ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-brand-300 hover:border-primary-400'
        } disabled:opacity-40`}
      >
        {done && <Check className="w-3.5 h-3.5" />}
      </button>

      <div className="flex-1 min-w-0 pt-1">
        <p className={`text-sm leading-snug ${na ? 'text-brand-500 line-through' : done ? 'text-brand-500' : 'text-brand-900'}`}>
          {item.text}
          {badges.length > 0 && (
            <span className="ml-2 inline-flex flex-wrap items-center gap-1.5 align-middle no-underline">{badges}</span>
          )}
        </p>
        {/* Phones: Source sits under the text, where there's room for it. */}
        {sourceButton && <div className="mt-1.5 sm:hidden">{sourceButton}</div>}
        {showSource && item.sourceQuote && (
          <blockquote className="mt-2 text-xs text-brand-700 bg-brand-50 border-l-2 border-primary-300 pl-3 pr-2 py-2 rounded-r-md">
            “{item.sourceQuote}”
            {item.sourcePage && <span className="block mt-1 text-brand-500 not-italic">Page {item.sourcePage} of the guidelines</span>}
          </blockquote>
        )}
      </div>

      {sourceButton && <div className="hidden sm:block shrink-0 mt-0.5">{sourceButton}</div>}

      {/* One menu instead of three buttons per row, so a long checklist stays easy to scan. */}
      <div className="shrink-0">
        <MoreActions
          label={`Actions for "${item.text}"`}
          items={[
            na
              ? { label: 'It applies after all', onSelect: () => onPatch(item.id, { status: 'TODO' }) }
              : { label: 'Not applicable', onSelect: () => onPatch(item.id, { status: 'NA' }) },
            { label: 'Edit', onSelect: startEditing },
            { label: 'Delete', danger: true, onSelect: () => window.confirm(`Delete "${item.text}"?`) && onDelete(item.id) },
          ]}
        />
      </div>
    </li>
  );
}

/** A category filter, with that category's done/total and a tick once it's complete. */
function FilterChip({ label, progress, active, onClick }: {
  label: string;
  progress: { done: number; total: number };
  active: boolean;
  onClick: () => void;
}) {
  const complete = progress.total > 0 && progress.done === progress.total;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
        active ? 'bg-brand-900 text-white border-brand-900' : 'bg-white text-brand-700 border-brand-200 hover:bg-brand-50 hover:border-brand-300'
      }`}
    >
      {complete && <Check className={`w-3 h-3 ${active ? 'text-primary-300' : 'text-primary-600'}`} aria-hidden="true" />}
      {label}
      <span className={`px-1.5 py-0.5 rounded-full text-[11px] tabular-nums ${active ? 'bg-white/20' : 'bg-brand-100 text-brand-600'}`}>
        {progress.done}/{progress.total}
      </span>
    </button>
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
