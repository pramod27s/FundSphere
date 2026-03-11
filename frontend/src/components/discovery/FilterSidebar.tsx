import { Filter, ChevronDown, Check } from 'lucide-react';

export default function FilterSidebar() {
  const Checkbox = ({ label, count }: { label: string, count: number }) => (
    <label className="flex items-center justify-between group cursor-pointer py-1">
      <div className="flex items-center gap-3">
        <div className="w-4 h-4 rounded border border-brand-300 bg-white group-hover:border-primary-400 flex items-center justify-center transition-colors">
          <Check className="w-3 h-3 text-primary-600 opacity-0 group-hover:opacity-100" />
        </div>
        <span className="text-sm text-brand-700 group-hover:text-brand-900">{label}</span>
      </div>
      <span className="text-xs text-brand-400 group-hover:text-brand-500 font-medium">{count}</span>
    </label>
  );

  const FilterSection = ({ title, children }: { title: string, children: React.ReactNode }) => (
    <div className="mb-6">
      <button className="flex items-center justify-between w-full mb-3 group">
        <h4 className="text-sm font-semibold text-brand-900 uppercase tracking-wider">{title}</h4>
        <ChevronDown className="w-4 h-4 text-brand-400 group-hover:text-brand-600 transition-colors" />
      </button>
      <div className="flex flex-col gap-2">
        {children}
      </div>
    </div>
  );

  return (
    <aside className="w-72 bg-white border-r border-brand-100 h-full flex flex-col flex-shrink-0">
      <div className="p-6 border-b border-brand-100 flex items-center gap-2 text-brand-800">
        <Filter className="w-5 h-5" />
        <h2 className="font-bold">Filters & Preferences</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <FilterSection title="Grant Type">
          <Checkbox label="Research Projects" count={412} />
          <Checkbox label="Fellowships" count={89} />
          <Checkbox label="Travel Grants" count={64} />
          <Checkbox label="Equipment / Lab" count={32} />
        </FilterSection>

        <FilterSection title="Applicant Type">
          <Checkbox label="Early Career" count={156} />
          <Checkbox label="Students (PhD/MSc)" count={92} />
          <Checkbox label="Senior Researchers" count={234} />
          <Checkbox label="Startups / Industry" count={45} />
        </FilterSection>

        <FilterSection title="Funding Amount">
          <Checkbox label="< $10,000" count={104} />
          <Checkbox label="$10k - $50k" count={341} />
          <Checkbox label="$50k - $250k" count={121} />
          <Checkbox label="> $250k" count={83} />
        </FilterSection>

        <FilterSection title="Deadline Timeline">
          <Checkbox label="Closing in < 30 days" count={45} />
          <Checkbox label="Closing in 1-3 months" count={122} />
          <Checkbox label="Closing in > 3 months" count={509} />
        </FilterSection>
      </div>

      <div className="p-4 border-t border-brand-100 bg-brand-50/50">
        <button className="w-full py-2.5 bg-white border border-brand-200 text-brand-700 font-medium rounded-lg hover:bg-brand-50 transition-colors text-sm shadow-sm">
          Reset All Filters
        </button>
      </div>
    </aside>
  );
}
