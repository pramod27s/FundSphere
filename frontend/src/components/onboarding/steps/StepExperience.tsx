

type StepProps = {
  yearsExperience: string;
  educationLevel: string;
  previousGrants: string;
  updateFields: (fields: Partial<StepProps>) => void;
};

const eduLevels = [
  "Undergraduate",
  "Masters",
  "PhD",
  "Postdoc",
  "Other"
];

export default function StepExperience({
  yearsExperience, educationLevel, previousGrants, updateFields
}: StepProps) {
  const inputClass = "w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-colors bg-white/50";
  const labelClass = "block text-sm font-medium text-brand-700 mb-1.5";

  return (
    <div className="flex flex-col gap-5">
      <p className="text-brand-500 mb-1">Your background directly influences eligibility requirements.</p>
      
      <div>
        <label className={labelClass}>Years of Experience in Field</label>
        <select
          value={yearsExperience}
          onChange={e => updateFields({ yearsExperience: e.target.value })}
          className={inputClass}
        >
          <option value="" disabled>Select years</option>
          <option value="0-2">0 - 2 years</option>
          <option value="3-5">3 - 5 years</option>
          <option value="6-10">6 - 10 years</option>
          <option value="10+">10+ years</option>
        </select>
      </div>

      <div>
        <label className={labelClass}>Current Education Level</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
          {eduLevels.map(level => {
            const isSelected = educationLevel === level;
            return (
              <button
                key={level}
                onClick={() => updateFields({ educationLevel: level })}
                className={`py-2 px-3 text-sm rounded-lg border transition-all ${
                  isSelected 
                    ? 'bg-primary-500 text-white border-primary-500 shadow-sm' 
                    : 'bg-white border-brand-200 text-brand-700 hover:border-primary-300'
                }`}
              >
                {level}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4">
        <label className={labelClass}>Have you previously received a grant?</label>
        <div className="flex gap-4 mt-2">
          {["Yes", "No"].map(opt => (
            <button
              key={opt}
              onClick={() => updateFields({ previousGrants: opt })}
              className={`flex-1 py-2.5 rounded-lg border transition-all font-medium ${
                previousGrants === opt 
                  ? 'bg-primary-50 text-primary-700 border-primary-500 shadow-sm' 
                  : 'bg-white border-brand-200 text-brand-700 hover:border-primary-300'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
