import { Landmark, Plane, Users, Briefcase, HeartHandshake } from 'lucide-react';

export type StageFundingEligibilityProps = {
  country: string;
  minFunding: string;
  maxFunding: string;
  grantType: string;
  yearsExperience: string;
  educationLevel: string;
  hasCompletedPhd: string;
  previousGrants: string;
  updateFields: (fields: Partial<{
    minFunding: string;
    maxFunding: string;
    grantType: string;
    yearsExperience: string;
    educationLevel: string;
    hasCompletedPhd: string;
    previousGrants: string;
  }>) => void;
};

const grantTypes = [
  { id: 'Research grant', label: 'Research Grant', icon: Landmark, desc: 'Project or lab investigation funding' },
  { id: 'Fellowship', label: 'Fellowship / Stipend', icon: Users, desc: 'Individual scholar support & training' },
  { id: 'Travel grant', label: 'Travel & Mobility', icon: Plane, desc: 'Conference travel & exchange grants' },
  { id: 'Startup funding', label: 'Commercial / Seed R&D', icon: Briefcase, desc: 'Deeptech & translational innovation' },
  { id: 'NGO funding', label: 'NGO / Community Impact', icon: HeartHandshake, desc: 'Social implementation programs' },
];

const eduLevels = [
  { value: 'Undergraduate', label: 'Undergraduate' },
  { value: 'Masters', label: "Master's Degree" },
  { value: 'PhD', label: 'Doctorate (PhD Candidate / Degree)' },
  { value: 'Postdoc', label: 'Postdoctoral Scholar' },
];

const getCurrencySymbol = (country: string): string => {
  const c = (country || '').toLowerCase();
  if (c.includes('india')) return '₹';
  if (c.includes('united kingdom') || c.includes('uk')) return '£';
  if (c.includes('germany') || c.includes('france') || c.includes('europe')) return '€';
  if (c.includes('canada')) return 'CA$';
  if (c.includes('australia')) return 'AU$';
  return '$';
};

export default function StageFundingEligibility({
  country,
  minFunding,
  maxFunding,
  grantType,
  yearsExperience,
  educationLevel,
  hasCompletedPhd,
  previousGrants,
  updateFields,
}: StageFundingEligibilityProps) {
  const currency = getCurrencySymbol(country);
  const inputClass =
    'w-full px-4 py-2.5 rounded-xl border border-brand-200 bg-white/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all text-sm text-brand-900 placeholder:text-brand-400';
  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-brand-700 mb-1.5';

  const isInvalidRange = minFunding !== '' && maxFunding !== '' && Number(minFunding) > Number(maxFunding);

  // Quick budget presets
  const presets = [
    { label: `${currency}5k – 25k`, min: '5000', max: '25000' },
    { label: `${currency}25k – 100k`, min: '25000', max: '100000' },
    { label: `${currency}100k – 500k`, min: '100000', max: '500000' },
    { label: `${currency}500k+`, min: '500000', max: '2000000' },
  ];

  return (
    <div className="space-y-6">
      {/* Target Grant Type */}
      <div>
        <label className={labelClass}>
          Preferred Grant Type <span className="text-primary-600">*</span>
        </label>
        <p className="text-xs text-brand-500 mb-3">
          Select the primary funding mechanism matching your current objective.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {grantTypes.map((t) => {
            const Icon = t.icon;
            const isSelected = grantType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => updateFields({ grantType: t.id })}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                  isSelected
                    ? 'border-primary-500 bg-primary-50/60 shadow-sm ring-1 ring-primary-500'
                    : 'border-brand-200 bg-white hover:border-primary-300 hover:bg-brand-50/50'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isSelected ? 'bg-primary-600 text-white' : 'bg-brand-100 text-brand-600'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className={`text-xs font-semibold ${isSelected ? 'text-primary-900' : 'text-brand-800'}`}>
                    {t.label}
                  </h4>
                  <p className="text-[11px] text-brand-500 line-clamp-1">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Target Funding Amount & Presets */}
      <div className="pt-2 border-t border-brand-100">
        <div className="flex items-center justify-between mb-1">
          <label className={labelClass}>Target Budget Range ({currency})</label>
          <div className="flex items-center gap-1">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => updateFields({ minFunding: p.min, maxFunding: p.max })}
                className="text-[11px] font-medium px-2 py-0.5 rounded-md border border-brand-200 hover:border-primary-400 bg-white text-brand-600 hover:text-primary-700 transition-all cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-brand-500 mb-3">
          Filter out grants below your operational minimum or beyond eligible funding caps.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-brand-600 mb-1 block">Minimum Funding</label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-xs font-semibold text-brand-400 select-none">
                {currency}
              </span>
              <input
                type="number"
                min="0"
                placeholder="10,000"
                value={minFunding}
                onChange={(e) => updateFields({ minFunding: e.target.value })}
                className={`${inputClass} pl-8 ${isInvalidRange ? 'border-red-400 focus:ring-red-500/20' : ''}`}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-brand-600 mb-1 block">Maximum Funding</label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-xs font-semibold text-brand-400 select-none">
                {currency}
              </span>
              <input
                type="number"
                min="0"
                placeholder="250,000"
                value={maxFunding}
                onChange={(e) => updateFields({ maxFunding: e.target.value })}
                className={`${inputClass} pl-8 ${isInvalidRange ? 'border-red-400 focus:ring-red-500/20' : ''}`}
              />
            </div>
          </div>
        </div>
        {isInvalidRange && (
          <p className="text-xs text-red-600 mt-1.5 font-medium">
            Minimum funding cannot exceed maximum funding.
          </p>
        )}
      </div>

      {/* Experience & Eligibility Gates */}
      <div className="pt-2 border-t border-brand-100">
        <h3 className="text-base font-semibold text-brand-900 mb-1">
          Eligibility & Experience Qualifications
        </h3>
        <p className="text-xs text-brand-500 mb-4">
          Fund sponsors use career stage and degree completion to enforce hard eligibility criteria.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Years of Professional / Research Experience</label>
            <select
              value={yearsExperience}
              onChange={(e) => updateFields({ yearsExperience: e.target.value })}
              className={inputClass}
            >
              <option value="" disabled>
                Select years
              </option>
              <option value="0-2">Early Career (0 – 2 years)</option>
              <option value="3-5">Mid Career (3 – 5 years)</option>
              <option value="6-10">Established (6 – 10 years)</option>
              <option value="10+">Senior / Principal (10+ years)</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Current Education Level</label>
            <select
              value={educationLevel}
              onChange={(e) => updateFields({ educationLevel: e.target.value })}
              className={inputClass}
            >
              <option value="" disabled>
                Select highest level
              </option>
              {eduLevels.map((lvl) => (
                <option key={lvl.value} value={lvl.value}>
                  {lvl.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div className="p-3.5 rounded-xl border border-brand-200 bg-white/60">
            <label className={labelClass}>Have you completed a PhD / doctorate?</label>
            <p className="text-[11px] text-brand-500 mb-2">
              Certain PI grants require a completed degree in hand before application.
            </p>
            <div className="flex gap-2">
              {['Yes', 'No'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => updateFields({ hasCompletedPhd: opt })}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                    hasCompletedPhd === opt
                      ? 'bg-primary-600 text-white border-primary-600 shadow-xs'
                      : 'bg-white border-brand-200 text-brand-700 hover:border-brand-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-brand-200 bg-white/60">
            <label className={labelClass}>Have you previously received a grant?</label>
            <p className="text-[11px] text-brand-500 mb-2">
              First-time investigator grants often give preference to newcomers.
            </p>
            <div className="flex gap-2">
              {['Yes', 'No'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => updateFields({ previousGrants: opt })}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                    previousGrants === opt
                      ? 'bg-primary-600 text-white border-primary-600 shadow-xs'
                      : 'bg-white border-brand-200 text-brand-700 hover:border-brand-300'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
