
import type { LucideIcon } from 'lucide-react';
import { Bell, Clock, Calendar } from 'lucide-react';

type StepProps = {
  notifyNewGrants: boolean;
  notifyDeadlines: boolean;
  notifyWeekly: boolean;
  updateFields: (fields: Partial<StepProps>) => void;
};

type ToggleSwitchProps = {
  checked: boolean;
  onChange: () => void;
  label: string;
  sublabel: string;
  icon: LucideIcon;
};

function ToggleSwitch({ checked, onChange, label, sublabel, icon: Icon }: ToggleSwitchProps) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-brand-200 bg-white hover:border-primary-300 transition-colors">
      <div className="flex gap-4 items-center">
        <div className="p-2 rounded-lg bg-brand-50 text-brand-500">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-semibold text-brand-900">{label}</h4>
          <p className="text-xs text-brand-500">{sublabel}</p>
        </div>
      </div>
      
      <button 
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? 'bg-primary-600' : 'bg-brand-200'
        }`}
      >
        <span 
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`} 
        />
      </button>
    </div>
  );
}

export default function StepNotifications({
  notifyNewGrants, notifyDeadlines, notifyWeekly, updateFields
}: StepProps) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-brand-500 mb-1">Stay updated with the latest funding matches.</p>
      
      <div className="flex flex-col gap-3">
        <ToggleSwitch 
          checked={notifyNewGrants} 
          onChange={() => updateFields({ notifyNewGrants: !notifyNewGrants })} 
          label="Email notifications for new grants" 
          sublabel="Get instantly notified when a new grant matches your profile."
          icon={Bell}
        />
        
        <ToggleSwitch 
          checked={notifyDeadlines} 
          onChange={() => updateFields({ notifyDeadlines: !notifyDeadlines })} 
          label="Deadline reminders" 
          sublabel="Receive warnings 30, 14, and 7 days before application deadlines."
          icon={Clock}
        />

        <ToggleSwitch 
          checked={notifyWeekly} 
          onChange={() => updateFields({ notifyWeekly: !notifyWeekly })} 
          label="Weekly grant recommendations" 
          sublabel="A curated digest of the top recommendations."
          icon={Calendar}
        />
      </div>

      <div className="mt-8 bg-brand-50 rounded-xl p-4 border border-brand-100 flex gap-3 text-brand-700 text-sm">
        <div className="mt-0.5 whitespace-nowrap">✨ Almost Done!</div>
        <p>By completing this setup, FundSphere's AI will begin personalizing your discovery feed immediately.</p>
      </div>
    </div>
  );
}
