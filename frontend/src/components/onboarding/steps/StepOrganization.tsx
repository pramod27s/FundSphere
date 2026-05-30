

type StepProps = {
  orgName: string;
  department: string;
  role: string;
  institutionType: string;
  updateFields: (fields: Partial<StepProps>) => void;
};

const roles = [
  "Student",
  "Research Assistant",
  "Professor",
  "NGO Member",
  "Founder",
  "Other"
];

// value = backend enum (InstitutionType), label = human text.
const institutionTypes = [
  { value: "UNIVERSITY", label: "University" },
  { value: "COLLEGE", label: "College" },
  { value: "RESEARCH_INSTITUTE", label: "Research Institute" },
  { value: "GOVERNMENT_LAB", label: "Government Lab" },
  { value: "HOSPITAL", label: "Hospital / Medical" },
  { value: "STARTUP", label: "Startup" },
  { value: "INDUSTRY", label: "Industry / Company" },
  { value: "NGO", label: "NGO / Non-profit" },
  { value: "OTHER", label: "Other" },
];

export default function StepOrganization({
  orgName, department, role, institutionType, updateFields
}: StepProps) {
  const inputClass = "w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-colors bg-white/50";
  const labelClass = "block text-sm font-medium text-brand-700 mb-1.5";

  return (
    <div className="flex flex-col gap-5">
      <p className="text-brand-500 mb-1">Tell us where you work or study.</p>
      
      <div>
        <label className={labelClass}>Institution / Organization Name *</label>
        <input 
          autoFocus
          required
          type="text" 
          placeholder="e.g. Stanford University"
          value={orgName} 
          onChange={e => updateFields({ orgName: e.target.value })} 
          className={inputClass} 
        />
      </div>

      <div>
        <label className={labelClass}>Department</label>
        <input 
          type="text" 
          placeholder="e.g. Computer Science"
          value={department} 
          onChange={e => updateFields({ department: e.target.value })} 
          className={inputClass} 
        />
      </div>

      <div>
        <label className={labelClass}>Institution Type</label>
        <p className="text-xs text-brand-500 mb-1.5">Helps us match grants restricted to certain organization types.</p>
        <select
          value={institutionType}
          onChange={e => updateFields({ institutionType: e.target.value })}
          className={inputClass}
        >
          <option value="">Select type (optional)</option>
          {institutionTypes.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Position / Role *</label>
        <select
          value={role}
          onChange={e => updateFields({ role: e.target.value })}
          className={inputClass}
        >
          <option value="" disabled>Select your role</option>
          {roles.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
