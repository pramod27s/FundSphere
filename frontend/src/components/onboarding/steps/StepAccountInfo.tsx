

type StepProps = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phoneNumber: string;
  updateFields: (fields: Partial<StepProps>) => void;
};

export default function StepAccountInfo({
  fullName, email, password, confirmPassword, phoneNumber, updateFields
}: StepProps) {
  const inputClass = "w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-colors bg-white/50";
  const labelClass = "block text-sm font-medium text-brand-700 mb-1.5";
  const passwordsMatch = !confirmPassword || password === confirmPassword;

  return (
    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <p className="text-brand-500 mb-2">Please provide your basic login credentials.</p>
      
      <div>
        <label className={labelClass}>Full Name *</label>
        <input 
          autoFocus
          required
          type="text" 
          placeholder="Jane Doe"
          value={fullName} 
          onChange={e => updateFields({ fullName: e.target.value })} 
          className={inputClass} 
        />
      </div>

      <div>
        <label className={labelClass}>Email Address *</label>
        <input 
          required
          type="email" 
          placeholder="jane@example.com"
          value={email} 
          onChange={e => updateFields({ email: e.target.value })} 
          className={inputClass} 
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Password *</label>
          <input 
            required
            type="password" 
            placeholder="••••••••"
            value={password} 
            onChange={e => updateFields({ password: e.target.value })} 
            className={inputClass} 
          />
        </div>
        <div>
          <label className={labelClass}>Confirm Password *</label>
          <input 
            required
            type="password" 
            placeholder="••••••••"
            value={confirmPassword} 
            onChange={e => updateFields({ confirmPassword: e.target.value })} 
            className={`${inputClass} ${!passwordsMatch ? 'border-red-400 focus:ring-red-500/50 focus:border-red-500' : ''}`}
          />
          {!passwordsMatch && (
            <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>
          )}
        </div>
      </div>

      <div>
        <label className={labelClass}>Phone Number (Optional)</label>
        <input 
          type="tel" 
          placeholder="+1 (555) 000-0000"
          value={phoneNumber} 
          onChange={e => updateFields({ phoneNumber: e.target.value })} 
          className={inputClass} 
        />
      </div>
    </div>
  );
}
