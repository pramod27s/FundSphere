import { Beaker, GraduationCap, Building2, Briefcase, BookOpen } from 'lucide-react';

export type StageIdentityProps = {
  userType: string;
  orgName: string;
  department: string;
  role: string;
  institutionType: string;
  updateFields: (fields: Partial<{
    userType: string;
    orgName: string;
    department: string;
    role: string;
    institutionType: string;
  }>) => void;
};

const userTypes = [
  {
    id: 'Researcher',
    label: 'Researcher',
    icon: Beaker,
    desc: 'Independent or institutional researcher conducting scientific inquiry',
  },
  {
    id: 'Student',
    label: 'Student / Scholar',
    icon: GraduationCap,
    desc: 'Undergraduate, graduate, or doctoral candidate seeking grant support',
  },
  {
    id: 'Professor / Faculty',
    label: 'Professor / Faculty',
    icon: BookOpen,
    desc: 'Academic faculty leading lab groups, teaching, or departmental research',
  },
  {
    id: 'Startup / Company',
    label: 'Startup / Founder',
    icon: Briefcase,
    desc: 'Commercial venture, spin-off, or deep-tech startup pursuing R&D capital',
  },
  {
    id: 'Nonprofit Organization',
    label: 'Non-profit / NGO',
    icon: Building2,
    desc: 'Charitable foundation, civil society org, or public-benefit institution',
  },
];

const roles = [
  { value: 'Professor', label: 'Professor / Faculty' },
  { value: 'Research Assistant', label: 'Research Assistant / Fellow' },
  { value: 'Student', label: 'Student / Scholar' },
  { value: 'Founder', label: 'Founder / Entrepreneur' },
  { value: 'NGO Member', label: 'NGO / Non-profit Member' },
  { value: 'Other', label: 'Other Professional / Investigator' },
];

const institutionTypes = [
  { value: 'UNIVERSITY', label: 'University' },
  { value: 'COLLEGE', label: 'College' },
  { value: 'RESEARCH_INSTITUTE', label: 'Research Institute' },
  { value: 'GOVERNMENT_LAB', label: 'Government Lab / Agency' },
  { value: 'HOSPITAL', label: 'Hospital / Medical Center' },
  { value: 'STARTUP', label: 'Startup Incubator / Entity' },
  { value: 'INDUSTRY', label: 'Private Industry / Enterprise' },
  { value: 'NGO', label: 'NGO / Non-profit' },
  { value: 'OTHER', label: 'Other' },
];

export default function StageIdentity({
  userType,
  orgName,
  department,
  role,
  institutionType,
  updateFields,
}: StageIdentityProps) {
  const inputClass =
    'w-full px-4 py-2.5 rounded-xl border border-brand-200 bg-white/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all text-sm text-brand-900 placeholder:text-brand-400';
  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-brand-700 mb-1.5';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-brand-900 mb-1">
          Select Your Profile Type <span className="text-primary-600">*</span>
        </h3>
        <p className="text-xs text-brand-500 mb-3">
          This tunes recommendation filters for eligibility gates (e.g. faculty-only grants, student fellowships).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {userTypes.map((t) => {
            const Icon = t.icon;
            const isSelected = userType === t.id;

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => updateFields({ userType: t.id })}
                className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? 'border-primary-500 bg-primary-50/60 shadow-sm ring-1 ring-primary-500'
                    : 'border-brand-200 bg-white hover:border-primary-300 hover:bg-brand-50/50'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-1.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-primary-600 text-white' : 'bg-brand-100 text-brand-600'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-sm font-semibold ${isSelected ? 'text-primary-900' : 'text-brand-800'}`}>
                    {t.label}
                  </span>
                </div>
                <p className="text-xs text-brand-500 line-clamp-2">{t.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-2 border-t border-brand-100">
        <h3 className="text-base font-semibold text-brand-900 mb-1">
          Institution & Role Affiliation
        </h3>
        <p className="text-xs text-brand-500 mb-4">
          Many research grants require verified institutional backing.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              Institution or Organization Name <span className="text-primary-600">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Stanford University or MIT"
              value={orgName}
              onChange={(e) => updateFields({ orgName: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Department or Center</label>
            <input
              type="text"
              placeholder="e.g. Department of Bioengineering"
              value={department}
              onChange={(e) => updateFields({ department: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Your Position / Role <span className="text-primary-600">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => updateFields({ role: e.target.value })}
              className={inputClass}
            >
              <option value="" disabled>
                Select your current role
              </option>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Institution Type</label>
            <select
              value={institutionType}
              onChange={(e) => updateFields({ institutionType: e.target.value })}
              className={inputClass}
            >
              <option value="">Select category (optional)</option>
              {institutionTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
