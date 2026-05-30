

type StepProps = {
  country: string;
  state: string;
  city: string;
  citizenship: string;
  updateFields: (fields: Partial<StepProps>) => void;
};

const countryOptions = [
  "India",
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Germany",
  "Other",
];

export default function StepLocation({
  country, state, city, citizenship, updateFields
}: StepProps) {
  const inputClass = "w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-colors bg-white/50";
  const labelClass = "block text-sm font-medium text-brand-700 mb-1.5";

  return (
    <div className="flex flex-col gap-5">
      <p className="text-brand-500 mb-1">Many grants are region-specific. Let us know where you are based.</p>
      
      <div>
        <label className={labelClass}>Country *</label>
        <select
          value={country}
          onChange={e => updateFields({ country: e.target.value })}
          className={inputClass}
        >
          <option value="" disabled>Select your country</option>
          {countryOptions.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Citizenship / Nationality</label>
        <p className="text-xs text-brand-500 mb-1.5">Some grants are restricted by citizenship, which can differ from where you live. Leave blank to use your country.</p>
        <select
          value={citizenship}
          onChange={e => updateFields({ citizenship: e.target.value })}
          className={inputClass}
        >
          <option value="">Same as country</option>
          {countryOptions.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>State / Province</label>
          <input 
            type="text" 
            placeholder="e.g. Maharashtra"
            value={state}
            onChange={e => updateFields({ state: e.target.value })} 
            className={inputClass} 
          />
        </div>
        <div>
          <label className={labelClass}>City</label>
          <input 
            type="text" 
            placeholder="e.g. Mumbai"
            value={city}
            onChange={e => updateFields({ city: e.target.value })} 
            className={inputClass} 
          />
        </div>
      </div>
    </div>
  );
}
