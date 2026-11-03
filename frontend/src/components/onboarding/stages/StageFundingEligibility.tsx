import { useId } from 'react';
import { Landmark, Plane, Users, Briefcase, HeartHandshake } from 'lucide-react';
import { parseLakhInput } from '../../awards/awardMeta';
import { BUDGET_PRESETS } from '../../../utils/profileOptions';

export type StageFundingEligibilityProps = {
  /** In lakh, as typed ('' = no preference). */
  minFunding: string;
  maxFunding: string;
  grantType: string;
  yearsExperience: string;
  educationLevel: string;
  /** 'Yes', 'No', or '' when not answered. */
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
  { id: 'Research grant', label: 'Research grant', icon: Landmark, desc: 'Funding for a project or lab' },
  { id: 'Fellowship', label: 'Fellowship / Stipend', icon: Users, desc: 'Support for one scholar' },
  { id: 'Travel grant', label: 'Travel and mobility', icon: Plane, desc: 'Conferences and exchanges' },
  { id: 'Startup funding', label: 'Commercial / Seed R&D', icon: Briefcase, desc: 'Deep-tech and translation' },
  { id: 'NGO funding', label: 'NGO / Community impact', icon: HeartHandshake, desc: 'Social programmes' },
];

const eduLevels = [
  { value: 'Undergraduate', label: 'Undergraduate' },
  { value: 'Masters', label: "Master's degree" },
  { value: 'PhD', label: 'Doctorate (PhD candidate or degree)' },
  { value: 'Postdoc', label: 'Postdoctoral scholar' },
];

const lakhText = (value: number | null) => (value === null ? '' : String(value));

export default function StageFundingEligibility({
  minFunding,
  maxFunding,
  grantType,
  yearsExperience,
  educationLevel,
  hasCompletedPhd,
  previousGrants,
  updateFields,
}: StageFundingEligibilityProps) {
  const id = useId();
  const inputClass =
    'w-full px-4 py-2.5 rounded-lg border border-brand-200 bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all text-sm text-brand-900 placeholder:text-brand-400';
  const labelClass = 'block text-sm font-medium text-brand-700 mb-1.5';

  const min = parseLakhInput(minFunding);
  const max = parseLakhInput(maxFunding);
  const notANumber = min === 'invalid' || max === 'invalid';
  const isInvalidRange = !notANumber && min !== null && max !== null && min > max;

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className={labelClass}>
          Preferred grant type <span className="text-primary-600">*</span>
        </legend>
        <p className="text-xs text-brand-500 mb-3">
          The kind of funding you're after right now.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {grantTypes.map((t) => {
            const Icon = t.icon;
            const isSelected = grantType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => updateFields({ grantType: t.id })}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer flex items-center gap-3 ${
                  isSelected
                    ? 'border-primary-500 bg-primary-50 shadow-sm ring-1 ring-primary-500'
                    : 'border-brand-200 bg-white hover:border-primary-300 hover:bg-brand-50'
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
                  <span className={`block text-xs font-semibold ${isSelected ? 'text-primary-900' : 'text-brand-800'}`}>
                    {t.label}
                  </span>
                  <span className="block text-[11px] text-brand-500">{t.desc}</span>
                </div>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="pt-2 border-t border-brand-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
          <legend className={`${labelClass} mb-0`}>Budget you're looking for (optional)</legend>
          <div className="flex flex-wrap items-center gap-1">
            {BUDGET_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => updateFields({ minFunding: lakhText(p.minLakh), maxFunding: lakhText(p.maxLakh) })}
                className="text-[11px] font-medium px-2 py-0.5 rounded-md border border-brand-200 hover:border-primary-400 bg-white text-brand-600 hover:text-primary-700 transition-all cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-brand-500 mb-3">
          In lakh: type 12.5 for ₹12.5 lakh. Leave it blank if any amount is fine.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([
            ['min', 'Smallest amount', minFunding, 'minFunding', 'e.g. 5'],
            ['max', 'Largest amount', maxFunding, 'maxFunding', 'e.g. 50'],
          ] as const).map(([key, label, value, field, placeholder]) => (
            <div key={key}>
              <label htmlFor={`${id}-${key}`} className="text-xs text-brand-600 mb-1 block">{label}</label>
              <div className="relative">
                <input
                  id={`${id}-${key}`}
                  type="text"
                  inputMode="decimal"
                  placeholder={placeholder}
                  value={value}
                  onChange={(e) => updateFields({ [field]: e.target.value })}
                  className={`${inputClass} pr-14 ${isInvalidRange || notANumber ? 'border-red-400 focus:ring-red-500/20' : ''}`}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-brand-500 pointer-events-none">
                  lakh
                </span>
              </div>
            </div>
          ))}
        </div>
        {(isInvalidRange || notANumber) && (
          <p className="text-xs text-red-600 mt-1.5 font-medium">
            {notANumber ? 'Type a number of lakh, for example 12.5.' : 'The smallest amount is more than the largest.'}
          </p>
        )}
      </fieldset>

      <div className="pt-2 border-t border-brand-100">
        <h3 className="text-base font-semibold text-brand-900 mb-1">
          Eligibility and experience
        </h3>
        <p className="text-xs text-brand-500 mb-4">
          Some calls need a completed PhD or a minimum number of years. Skip anything you're unsure of: a call is only
          hidden when your answer rules you out.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${id}-years`} className={labelClass}>Years of professional or research experience</label>
            <select
              id={`${id}-years`}
              value={yearsExperience}
              onChange={(e) => updateFields({ yearsExperience: e.target.value })}
              className={inputClass}
            >
              <option value="">Not specified</option>
              <option value="0-2">Early career (0–2 years)</option>
              <option value="3-5">Mid career (3–5 years)</option>
              <option value="6-10">Established (6–10 years)</option>
              <option value="10+">Senior (more than 10 years)</option>
            </select>
          </div>

          <div>
            <label htmlFor={`${id}-education`} className={labelClass}>Current education level</label>
            <select
              id={`${id}-education`}
              value={educationLevel}
              onChange={(e) => updateFields({ educationLevel: e.target.value })}
              className={inputClass}
            >
              <option value="">Not specified</option>
              {eduLevels.map((lvl) => (
                <option key={lvl.value} value={lvl.value}>
                  {lvl.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <YesNo
            legend="Have you completed a PhD or doctorate?"
            hint="Some PI grants need the degree in hand before you apply."
            value={hasCompletedPhd}
            onChange={(opt) => updateFields({ hasCompletedPhd: opt })}
          />
          <YesNo
            legend="Have you received a grant before?"
            hint="Some schemes are only for first-time investigators."
            value={previousGrants}
            onChange={(opt) => updateFields({ previousGrants: opt })}
          />
        </div>
      </div>
    </div>
  );
}

/** A Yes/No question; tapping the chosen answer again clears it. */
function YesNo({ legend, hint, value, onChange }: {
  legend: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="p-3.5 rounded-lg border border-brand-200 bg-white">
      <legend className="sr-only">{legend}</legend>
      <p className="block text-sm font-medium text-brand-700 mb-1.5" aria-hidden="true">{legend}</p>
      <p className="text-[11px] text-brand-500 mb-2">{hint}</p>
      <div className="flex gap-2">
        {['Yes', 'No'].map((opt) => (
          <button
            key={opt}
            type="button"
            aria-pressed={value === opt}
            onClick={() => onChange(value === opt ? '' : opt)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
              value === opt
                ? 'bg-primary-600 text-white border-primary-600 shadow-xs'
                : 'bg-white border-brand-200 text-brand-700 hover:border-brand-300'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
