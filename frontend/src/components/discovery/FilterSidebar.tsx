import type { ReactNode } from 'react';
import { useState } from 'react';
import { Filter, ChevronDown, Check, X, RotateCcw } from 'lucide-react';

export interface FilterState {
  grantTypes: string[];
  applicantTypes: string[];
  fundingRanges: string[];
  deadlineRanges: string[];
}

export const EMPTY_FILTERS: FilterState = {
  grantTypes: [],
  applicantTypes: [],
  fundingRanges: [],
  deadlineRanges: [],
};

function toggleItem(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function Checkbox({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex items-center gap-3 group cursor-pointer py-1.5 px-2 -mx-2 rounded-lg select-none transition-colors ${
        checked ? 'bg-primary-50/60' : 'hover:bg-brand-50'
      }`}
      onClick={onToggle}
    >
      <div
        className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 transition-all ${
          checked
            ? 'bg-gradient-to-br from-primary-500 to-primary-600 border-primary-600 shadow-sm shadow-primary-500/30'
            : 'border-brand-300 bg-white group-hover:border-primary-400 group-hover:shadow-sm'
        }`}
      >
        <Check
          className={`w-3 h-3 text-white transition-all ${
            checked ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
          }`}
          strokeWidth={3}
        />
      </div>
      <span className={`text-sm transition-colors ${checked ? 'text-brand-900 font-medium' : 'text-brand-700 group-hover:text-brand-900'}`}>
        {label}
      </span>
    </label>
  );
}

function FilterSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="mb-5 pb-5 border-b border-brand-100/80 last:border-b-0 last:pb-0 last:mb-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full mb-3 group"
      >
        <div className="flex items-center gap-2">
          <h4 className="text-[11px] font-bold text-brand-700 uppercase tracking-widest">{title}</h4>
          {count > 0 && (
            <span className="text-[10px] font-bold bg-primary-100 text-primary-700 rounded-full px-1.5 min-w-[18px] h-[18px] flex items-center justify-center tabular-nums">
              {count}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-brand-400 group-hover:text-brand-700 transition-all duration-200 ${isOpen ? '' : '-rotate-90'}`}
        />
      </button>
      {isOpen && <div className="flex flex-col gap-0.5">{children}</div>}
    </div>
  );
}

interface FilterSidebarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onClose?: () => void;
}

export default function FilterSidebar({ filters, onChange, onClose }: FilterSidebarProps) {
  const toggle = (key: keyof FilterState, value: string) => {
    onChange({ ...filters, [key]: toggleItem(filters[key], value) });
  };

  const activeCount =
    filters.grantTypes.length +
    filters.applicantTypes.length +
    filters.fundingRanges.length +
    filters.deadlineRanges.length;

  return (
    <aside className="w-full bg-white/80 backdrop-blur-xl border-r border-brand-100 h-full flex flex-col shrink-0">
      <div className="px-5 py-5 border-b border-brand-100 bg-gradient-to-br from-white via-white to-primary-50/30 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-md shadow-primary-500/20">
            <Filter className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-brand-900 leading-none tracking-tight">Filters</h2>
            <p className="text-[11px] text-brand-500 mt-1 leading-none">{activeCount > 0 ? `${activeCount} active` : 'Refine results'}</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1.5 text-brand-400 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 custom-scrollbar">
        <FilterSection title="Grant Type" count={filters.grantTypes.length}>
          {(['Research Projects', 'Fellowships', 'Travel Grants', 'Equipment / Lab'] as const).map((label) => (
            <Checkbox
              key={label}
              label={label}
              checked={filters.grantTypes.includes(label)}
              onToggle={() => toggle('grantTypes', label)}
            />
          ))}
        </FilterSection>

        <FilterSection title="Applicant Type" count={filters.applicantTypes.length}>
          {(['Early Career', 'Students (PhD/MSc)', 'Senior Researchers', 'Startups / Industry'] as const).map((label) => (
            <Checkbox
              key={label}
              label={label}
              checked={filters.applicantTypes.includes(label)}
              onToggle={() => toggle('applicantTypes', label)}
            />
          ))}
        </FilterSection>

        <FilterSection title="Funding Amount" count={filters.fundingRanges.length}>
          {(['< ₹5 Lakh', '₹5L - ₹25L', '₹25L - ₹1 Cr', '> ₹1 Cr'] as const).map((label) => (
            <Checkbox
              key={label}
              label={label}
              checked={filters.fundingRanges.includes(label)}
              onToggle={() => toggle('fundingRanges', label)}
            />
          ))}
        </FilterSection>

        <FilterSection title="Deadline Timeline" count={filters.deadlineRanges.length}>
          {(['Closing in < 30 days', 'Closing in 1-3 months', 'Closing in > 3 months'] as const).map((label) => (
            <Checkbox
              key={label}
              label={label}
              checked={filters.deadlineRanges.includes(label)}
              onToggle={() => toggle('deadlineRanges', label)}
            />
          ))}
        </FilterSection>
      </div>

      <div className="p-4 border-t border-brand-100 bg-gradient-to-t from-brand-50/60 to-transparent">
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          disabled={activeCount === 0}
          className="w-full py-2.5 bg-white border border-brand-200 text-brand-700 font-semibold rounded-xl hover:bg-brand-50 hover:border-brand-300 transition-all text-sm shadow-sm hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset All Filters
        </button>
      </div>
    </aside>
  );
}
