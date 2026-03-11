
import { IndianRupee, Landmark, Plane, Users, Briefcase } from 'lucide-react';

type StepProps = {
  minFunding: string;
  maxFunding: string;
  grantType: string;
  updateFields: (fields: Partial<StepProps>) => void;
};

const grantTypes = [
  { id: 'Research grant', icon: Landmark },
  { id: 'Travel grant', icon: Plane },
  { id: 'Fellowship', icon: Users },
  { id: 'Startup funding', icon: Briefcase },
  { id: 'NGO funding', icon: IndianRupee },
];

export default function StepFundingPrefs({
  minFunding, maxFunding, grantType, updateFields
}: StepProps) {
  const inputClass = "w-full pl-8 pr-4 py-2.5 rounded-lg border border-brand-200 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-colors bg-white/50";
  const labelClass = "block text-sm font-medium text-brand-700 mb-1.5";
  const fundingRangeInvalid = minFunding !== '' && maxFunding !== '' && Number(minFunding) > Number(maxFunding);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-brand-500 mb-1">Set your funding targets so we recommend the right opportunities.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Min Funding Amount</label>
          <div className="relative">
            <IndianRupee className="absolute left-2.5 top-3 w-4 h-4 text-brand-400" />
            <input
              type="number" 
              min="0"
              placeholder="5,00,000"
              value={minFunding}
              onChange={e => updateFields({ minFunding: e.target.value })} 
              className={`${inputClass} ${fundingRangeInvalid ? 'border-red-400 focus:ring-red-500/50 focus:border-red-500' : ''}`}
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Max Funding Amount</label>
          <div className="relative">
            <IndianRupee className="absolute left-2.5 top-3 w-4 h-4 text-brand-400" />
            <input
              type="number" 
              min="0"
              placeholder="50,00,000"
              value={maxFunding}
              onChange={e => updateFields({ maxFunding: e.target.value })} 
              className={`${inputClass} ${fundingRangeInvalid ? 'border-red-400 focus:ring-red-500/50 focus:border-red-500' : ''}`}
            />
          </div>
        </div>
      </div>
      {fundingRangeInvalid && (
        <p className="text-xs text-red-500 -mt-3">Minimum funding cannot exceed maximum funding.</p>
      )}

      <div className="mt-4">
        <label className={labelClass}>Preferred Grant Type *</label>
        <div className="grid grid-cols-2 gap-3 mt-2">
          {grantTypes.map(type => {
            const Icon = type.icon;
            const isSelected = grantType === type.id;
            return (
              <button
                key={type.id}
                onClick={() => updateFields({ grantType: type.id })}
                className={`py-3 px-4 flex items-center gap-3 rounded-lg border transition-all text-sm font-medium ${
                  isSelected 
                    ? 'bg-primary-50 text-primary-700 border-primary-500 shadow-sm' 
                    : 'bg-white border-brand-200 text-brand-700 hover:border-primary-300'
                }`}
              >
                <Icon className={`w-5 h-5 ${isSelected ? 'text-primary-600' : 'text-brand-400'}`} />
                {type.id}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  );
}
