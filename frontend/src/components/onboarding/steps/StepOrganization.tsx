

type StepProps = {
  orgName: string;
  department: string;
  role: string;
  updateFields: (fields: Partial<StepProps>) => void;
};

const roles = [
  "Student",
  "Research Assistant",
  "Professor",
  "NGO Member",
  "founder",
  "Other"
];

export default function StepOrganization({
  orgName, department, role, updateFields
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
