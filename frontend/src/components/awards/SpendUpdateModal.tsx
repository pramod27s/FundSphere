import { useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { Loader2, X } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import { updateSpending, type Award, type BudgetHead, type SpendCheck } from '../../services/awardsService';
import { formatDay, todayIso } from '../../utils/applicationDates';
import { formatInr } from '../../utils/formatFunding';
import { HEAD_LABEL, parseLakhInput, rupeesToLakhInput } from './awardMeta';

const INPUT =
  'w-full bg-white border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-900 placeholder:text-brand-400 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200';
const LABEL = 'block text-xs font-semibold text-brand-700 mb-1';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface SpendUpdateModalProps {
  award: Award;
  check: SpendCheck;
  onClose: () => void;
  onSaved: (check: SpendCheck) => void;
}

/**
 * 4.3: copy one financial year's totals per head from the institute's
 * statement. A budget left empty keeps FundSphere's estimate; spending left
 * empty means "not entered". Amounts are typed in lakh, like the grant form.
 */
export default function SpendUpdateModal({ award, check, onClose, onSaved }: SpendUpdateModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const formId = useId();
  useDialog(dialogRef, onClose);

  const today = todayIso();
  const latest = check.yearEnd < today ? check.yearEnd : today;
  const [asOf, setAsOf] = useState(check.asOf ?? latest);
  const [budgets, setBudgets] = useState<Record<string, string>>(() =>
    Object.fromEntries(check.heads.map((h) => [h.head, h.estimated ? '' : rupeesToLakhInput(h.budget)])),
  );
  const [spent, setSpent] = useState<Record<string, string>>(() =>
    Object.fromEntries(check.heads.map((h) => [h.head, h.spent === null ? '' : rupeesToLakhInput(h.spent) || '0'])),
  );
  const [percent, setPercent] = useState(String(check.equipmentAlertPercent));
  const [month, setMonth] = useState(check.equipmentAlertMonth);
  const [saving, setSaving] = useState(false);
  const hasEquipment = check.heads.some((h) => h.head === 'EQUIPMENT');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const heads: { head: BudgetHead; budget: number | null; spent: number | null }[] = [];
    for (const row of check.heads) {
      const budget = parseLakhInput(budgets[row.head] ?? '');
      const amount = parseLakhInput(spent[row.head] ?? '');
      if (budget === 'invalid' || amount === 'invalid') {
        toast.error(`${HEAD_LABEL[row.head]}: amounts are numbers of lakh, for example 2.5`);
        return;
      }
      heads.push({ head: row.head, budget, spent: amount });
    }
    const anySpent = heads.some((h) => h.spent !== null);
    if (anySpent && !asOf) {
      toast.error('Give the date of the statement you copied from');
      return;
    }
    const threshold = Number(percent);
    if (hasEquipment && (!Number.isInteger(threshold) || threshold < 1 || threshold > 100)) {
      toast.error('The Equipment warning needs a percentage from 1 to 100');
      return;
    }
    setSaving(true);
    try {
      const saved = await updateSpending(award.id, check.fyStartYear, {
        asOf: anySpent ? asOf : null,
        heads,
        ...(hasEquipment ? { equipmentAlertPercent: threshold, equipmentAlertMonth: month } : {}),
      });
      toast.success('Spending saved');
      onSaved(saved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the spending');
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="fixed inset-0 bg-brand-950/60" onClick={onClose} aria-hidden="true" />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white rounded-xl shadow-modal w-full max-w-2xl max-h-[90vh] flex flex-col relative z-10 ring-1 ring-brand-200/50"
      >
        <form onSubmit={submit} noValidate className="flex flex-col min-h-0">
          <div className="flex items-start justify-between gap-4 p-5 border-b border-brand-100">
            <div>
              <h2 id={titleId} className="text-lg font-bold text-brand-900 tracking-tight">Update spending · {check.label}</h2>
              <p className="text-xs text-brand-500 mt-1">
                Copy the totals per head from your institute's statement (Samarth, the accounts office's sheet or the
                project ledger), for {formatDay(check.yearStart)} – {formatDay(check.yearEnd)}. Totals only.
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

          <div className="p-5 flex flex-col gap-5 overflow-y-auto">
            <div className="max-w-xs">
              <label htmlFor={`${formId}-asof`} className={LABEL}>Statement date</label>
              <input
                id={`${formId}-asof`}
                type="date"
                className={INPUT}
                value={asOf}
                min={check.yearStart}
                max={today}
                onChange={(e) => setAsOf(e.target.value)}
              />
            </div>

            <div>
              <div className="hidden sm:grid grid-cols-[1fr_9rem_9rem] gap-3 text-xs font-semibold text-brand-700 mb-1">
                <span>Head</span>
                <span>Budget this year</span>
                <span>Spent this year</span>
              </div>
              <ul className="flex flex-col divide-y divide-brand-100">
                {check.heads.map((row) => (
                  <li key={row.head} className="py-3 grid grid-cols-2 sm:grid-cols-[1fr_9rem_9rem] gap-3 items-start">
                    <div className="col-span-2 sm:col-span-1">
                      <p className="text-sm font-medium text-brand-900">{HEAD_LABEL[row.head]}</p>
                      {row.allocated > 0 && (
                        <p className="text-[11px] text-brand-500">{formatInr(row.allocated)} for the whole project</p>
                      )}
                    </div>
                    <AmountInput
                      id={`${formId}-${row.head}-budget`}
                      label={`${HEAD_LABEL[row.head]} budget this year`}
                      value={budgets[row.head] ?? ''}
                      onChange={(value) => setBudgets((b) => ({ ...b, [row.head]: value }))}
                      placeholder="Estimate"
                      hint={row.estimated ? `Empty keeps the estimate, ${formatInr(row.budget)}` : 'Empty uses an estimate'}
                    />
                    <AmountInput
                      id={`${formId}-${row.head}-spent`}
                      label={`${HEAD_LABEL[row.head]} spent this year`}
                      value={spent[row.head] ?? ''}
                      onChange={(value) => setSpent((s) => ({ ...s, [row.head]: value }))}
                      placeholder="e.g. 1.25"
                    />
                  </li>
                ))}
              </ul>
            </div>

            {hasEquipment && (
              <fieldset className="rounded-lg border border-brand-200 bg-brand-50 p-3">
                <legend className="px-1 text-xs font-semibold text-brand-700">Equipment warning</legend>
                <div className="flex flex-wrap items-center gap-2 text-sm text-brand-800">
                  <label htmlFor={`${formId}-percent`}>Warn me if Equipment is under</label>
                  <input
                    id={`${formId}-percent`}
                    inputMode="numeric"
                    className="w-16 bg-white border border-brand-200 rounded-lg px-2 py-1 text-sm text-brand-900 tabular-nums focus:outline-none focus:border-primary-400"
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                  />
                  <label htmlFor={`${formId}-month`}>% used by</label>
                  <select
                    id={`${formId}-month`}
                    className="bg-white border border-brand-200 rounded-lg px-2 py-1 text-sm text-brand-900 focus:outline-none focus:border-primary-400"
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                  >
                    {MONTHS.map((name, index) => (
                      <option key={name} value={index + 1}>{name}</option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] text-brand-500 mt-1.5">
                  Most research equipment costs more than ₹2 lakh, so buying it takes quotations, a purchase committee
                  or a tender. An early warning leaves time for that.
                </p>
              </fieldset>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 p-4 border-t border-brand-100">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-brand-700 hover:bg-brand-100">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 shadow-xs"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body,
  );
}

/** A "lakh" amount box with the amount read back underneath, like the grant form's. */
function AmountInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hint?: string;
}) {
  const parsed = parseLakhInput(value);
  return (
    <div>
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          className={`${INPUT} pr-12 tabular-nums ${parsed === 'invalid' ? 'border-red-300' : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={parsed === 'invalid'}
        />
        <span className="absolute inset-y-0 right-3 flex items-center text-xs text-brand-500 pointer-events-none">lakh</span>
      </div>
      <p className={`text-[11px] mt-1 min-h-4 ${parsed === 'invalid' ? 'text-red-600' : 'text-brand-500'}`}>
        {parsed === 'invalid' ? 'Numbers only, for example 2.5' : typeof parsed === 'number' ? formatInr(parsed) : hint ?? ''}
      </p>
    </div>
  );
}
