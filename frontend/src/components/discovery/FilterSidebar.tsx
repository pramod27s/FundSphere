import type { ReactNode } from 'react';
import { useState } from 'react';
import { Filter, ChevronDown, Check, X } from 'lucide-react';

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
      className="flex items-center gap-3 group cursor-pointer py-1 select-none"
      onClick={onToggle}
    >
      <div
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
          checked
            ? 'bg-primary-500 border-primary-500'
            : 'border-brand-300 bg-white group-hover:border-primary-400'
        }`}
      >
        <Check className={`w-3 h-3 text-white transition-opacity ${checked ? 'opacity-100' : 'opacity-0'}`} />
      </div>
      <span className="text-sm text-brand-700 group-hover:text-brand-900">{label}</span>
    </label>
  );
}

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="mb-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full mb-3 group"
      >
        <h4 className="text-sm font-semibold text-brand-900 uppercase tracking-wider">{title}</h4>
        <ChevronDown
          className={`w-4 h-4 text-brand-400 group-hover:text-brand-600 transition-all ${isOpen ? '' : '-rotate-90'}`}
        />
      </button>
      {isOpen && <div className="flex flex-col gap-1">{children}</div>}
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
    <aside className="w-full bg-white border-r border-brand-100 h-full flex flex-col shrink-0">
      <div className="p-4 md:p-6 border-b border-brand-100 flex items-center justify-between text-brand-800">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5" />
          <h2 className="font-bold">Filters & Preferences</h2>
          {activeCount > 0 && (
            <span className="text-xs font-bold bg-primary-500 text-white rounded-full w-5 h-5 flex items-center justify-center">
              {activeCount}
            </span>
          )}
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

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <FilterSection title="Grant Type">
          {(['Research Projects', 'Fellowships', 'Travel Grants', 'Equipment / Lab'] as const).map((label) => (
            <Checkbox
              key={label}
              label={label}
              checked={filters.grantTypes.includes(label)}
              onToggle={() => toggle('grantTypes', label)}
            />
          ))}
        </FilterSection>

        <FilterSection title="Applicant Type">
          {(['Early Career', 'Students (PhD/MSc)', 'Senior Researchers', 'Startups / Industry'] as const).map((label) => (
            <Checkbox
              key={label}
              label={label}
              checked={filters.applicantTypes.includes(label)}
              onToggle={() => toggle('applicantTypes', label)}
            />
          ))}
        </FilterSection>

        <FilterSection title="Funding Amount">
          {(['< ₹5 Lakh', '₹5L - ₹25L', '₹25L - ₹1 Cr', '> ₹1 Cr'] as const).map((label) => (
            <Checkbox
              key={label}
              label={label}
              checked={filters.fundingRanges.includes(label)}
              onToggle={() => toggle('fundingRanges', label)}
            />
          ))}
        </FilterSection>

        <FilterSection title="Deadline Timeline">
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

      <div className="p-4 border-t border-brand-100 bg-brand-50/50">
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          disabled={activeCount === 0}
          className="w-full py-2.5 bg-white border border-brand-200 text-brand-700 font-medium rounded-lg hover:bg-brand-50 transition-colors text-sm shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reset All Filters
        </button>
      </div>
    </aside>
  );
}
