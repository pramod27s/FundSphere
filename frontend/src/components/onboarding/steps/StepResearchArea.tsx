

type StepProps = {
  primaryField: string;
  keywords: string;
  updateFields: (fields: Partial<StepProps>) => void;
};

const fieldsList = [
  "Artificial Intelligence",
  "Healthcare",
  "Education",
  "Environment",
  "Agriculture",
  "Robotics",
  "Data Science",
  "Social Impact",
  "Other"
];

export default function StepResearchArea({
  primaryField, keywords, updateFields
}: StepProps) {
  const inputClass = "w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-colors bg-white/50";
  const labelClass = "block text-sm font-medium text-brand-700 mb-1.5";

  return (
    <div className="flex flex-col gap-5">
      <p className="text-brand-500 mb-1">We use this to match you with highly relevant grants.</p>
      
      <div>
        <label className={labelClass}>Primary Field *</label>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
          {fieldsList.map(field => {
            const isSelected = primaryField === field;
            return (
              <button
                key={field}
                onClick={() => updateFields({ primaryField: field })}
                className={`py-2 px-3 text-sm rounded-lg border transition-all ${
                  isSelected 
                    ? 'bg-primary-500 text-white border-primary-500 shadow-sm' 
                    : 'bg-white border-brand-200 text-brand-700 hover:border-primary-300'
                }`}
              >
                {field}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4">
        <label className={labelClass}>Keywords / Research Interests (Optional)</label>
        <p className="text-xs text-brand-500 mb-2">Separate tags with commas. Example: Machine Learning, Climate Tech, Public Health</p>
        <textarea 
          rows={3}
          placeholder="Enter keywords..."
          value={keywords} 
          onChange={e => updateFields({ keywords: e.target.value })} 
          className={inputClass + " resize-none"} 
        />
      </div>
    </div>
  );
}
