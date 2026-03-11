
import { Beaker, GraduationCap, Building2, Briefcase, BookOpen } from 'lucide-react';

type StepProps = {
  userType: string;
  updateFields: (fields: Partial<StepProps>) => void;
};

const userTypes = [
  { id: 'Researcher', icon: Beaker, desc: 'Independent or institutional researcher' },
  { id: 'Student', icon: GraduationCap, desc: 'Undergraduate or specific scholar' },
  { id: 'Nonprofit Organization', icon: Building2, desc: 'NGO, Charity, or Foundation' },
  { id: 'Startup / Company', icon: Briefcase, desc: 'Private enterprise seeking grants' },
  { id: 'Professor / Faculty', icon: BookOpen, desc: 'Academic institution member' },
];

export default function StepUserType({ userType, updateFields }: StepProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-brand-500 mb-2">Select the profile type that best describes you.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {userTypes.map((type) => {
          const Icon = type.icon;
          const isSelected = userType === type.id;
          
          return (
            <button
              key={type.id}
              onClick={() => updateFields({ userType: type.id })}
              className={`flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                isSelected 
                  ? 'border-primary-500 bg-primary-50 shadow-md shadow-primary-500/10' 
                  : 'border-brand-100 bg-white hover:border-primary-200 hover:bg-brand-50'
              }`}
            >
              <Icon className={`w-6 h-6 mb-3 ${isSelected ? 'text-primary-600' : 'text-brand-400'}`} />
              <span className={`font-semibold mb-1 ${isSelected ? 'text-primary-900' : 'text-brand-700'}`}>
                {type.id}
              </span>
              <span className="text-xs text-brand-500">{type.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
