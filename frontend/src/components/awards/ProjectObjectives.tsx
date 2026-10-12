import { useId, useState, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import { Loader2, Pencil } from 'lucide-react';
import { updateAwardObjectives, type Award } from '../../services/awardsService';

const PLACEHOLDER = [
  'To develop a paper-strip sensor for arsenic in groundwater',
  'To validate the sensor in 20 villages of Ballia district',
  'To train two JRFs in field water testing',
].join('\n');

/**
 * 4.4: the project's objectives as the proposal states them. Progress-report
 * drafts describe the work done against each one, so they're pasted in once.
 */
export default function ProjectObjectives({ award, onAward }: { award: Award; onAward: (award: Award) => void }) {
  const formId = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const objectives = award.objectives;

  const startEditing = () => {
    setText(objectives.join('\n'));
    setEditing(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      onAward(await updateAwardObjectives(award.id, text.split('\n')));
      setEditing(false);
      toast.success('Objectives saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the objectives');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white border border-brand-200 rounded-xl p-5 sm:p-6 shadow-xs mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-brand-900 tracking-tight">Project objectives</h2>
          <p className="text-xs text-brand-500 mt-0.5">
            As your proposal states them. Progress reports describe the work done against each one.
          </p>
        </div>
        {!editing && objectives.length > 0 && (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-800 bg-white border border-brand-300 hover:bg-brand-50 shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-2">
          <label htmlFor={`${formId}-objectives`} className="block text-xs font-semibold text-brand-700">
            One objective per line
          </label>
          <textarea
            id={`${formId}-objectives`}
            rows={Math.min(12, Math.max(4, text.split('\n').length + 1))}
            className="w-full bg-white border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            autoFocus
          />
          <p className="text-[11px] text-brand-500">
            Paste them straight from the proposal. Numbering such as "1." or "(a)" is removed.
          </p>
          <div className="flex gap-2 mt-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-2 py-1.5 text-xs font-medium text-brand-600 hover:text-brand-900"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : objectives.length === 0 ? (
        <p className="text-sm text-brand-600">
          No objectives yet.{' '}
          <button type="button" onClick={startEditing} className="font-semibold text-primary-700 hover:text-primary-800">
            Paste them from your proposal
          </button>
        </p>
      ) : (
        <ol className="flex flex-col gap-2 text-sm text-brand-800">
          {objectives.map((objective, index) => (
            <li key={index} className="flex gap-3">
              <span className="tabular-nums font-semibold text-brand-500 w-5 shrink-0 text-right">{index + 1}.</span>
              <span>{objective}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
