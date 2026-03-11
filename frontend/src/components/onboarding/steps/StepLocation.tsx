

type StepProps = {
  country: string;
  state: string;
  city: string;
  updateFields: (fields: Partial<StepProps>) => void;
};

export default function StepLocation({
  country, state, city, updateFields
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
          <option value="United States">United States</option>
          <option value="United Kingdom">United Kingdom</option>
          <option value="Canada">Canada</option>
          <option value="Australia">Australia</option>
          <option value="India">India</option>
          <option value="Germany">Germany</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>State / Province</label>
          <input 
            type="text" 
            placeholder="e.g. California"
            value={state} 
            onChange={e => updateFields({ state: e.target.value })} 
            className={inputClass} 
          />
        </div>
        <div>
          <label className={labelClass}>City</label>
          <input 
            type="text" 
            placeholder="e.g. San Francisco"
            value={city} 
            onChange={e => updateFields({ city: e.target.value })} 
            className={inputClass} 
          />
        </div>
      </div>
    </div>
  );
}
