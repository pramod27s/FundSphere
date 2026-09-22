import type { LucideIcon } from 'lucide-react';
import { Bell, Clock, Calendar, Globe2, Sparkles } from 'lucide-react';

export type StagePreferencesProps = {
  country: string;
  state: string;
  city: string;
  citizenship: string;
  notifyNewGrants: boolean;
  notifyDeadlines: boolean;
  notifyWeekly: boolean;
  updateFields: (fields: Partial<{
    country: string;
    state: string;
    city: string;
    citizenship: string;
    notifyNewGrants: boolean;
    notifyDeadlines: boolean;
    notifyWeekly: boolean;
  }>) => void;
};

const countryOptions = [
  'India',
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'Switzerland',
  'Singapore',
  'Japan',
  'Other',
];

type ToggleRowProps = {
  checked: boolean;
  onChange: () => void;
  label: string;
  sublabel: string;
  icon: LucideIcon;
};

function ToggleRow({ checked, onChange, label, sublabel, icon: Icon }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between p-3.5 rounded-xl border border-brand-200 bg-white/80 hover:border-primary-300 transition-all">
      <div className="flex gap-3 items-center">
        <div className="p-2 rounded-lg bg-brand-50 text-brand-600">
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-semibold text-brand-900">{label}</h4>
          <p className="text-[11px] text-brand-500">{sublabel}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onChange}
        className={`relative inline-flex h-5 w-10 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
          checked ? 'bg-primary-600' : 'bg-brand-200'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

export default function StagePreferences({
  country,
  state,
  city,
  citizenship,
  notifyNewGrants,
  notifyDeadlines,
  notifyWeekly,
  updateFields,
}: StagePreferencesProps) {
  const inputClass =
    'w-full px-4 py-2.5 rounded-xl border border-brand-200 bg-white/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all text-sm text-brand-900 placeholder:text-brand-400';
  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-brand-700 mb-1.5';

  return (
    <div className="space-y-6">
      {/* Location Section */}
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <Globe2 className="w-4 h-4 text-primary-600" />
          <h3 className="text-base font-semibold text-brand-900">
            Geographic Eligibility & Residency
          </h3>
        </div>
        <p className="text-xs text-brand-500 mb-4">
          Many funding bodies restrict eligibility based on current host country or legal citizenship.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              Country of Residence / Lab Location <span className="text-primary-600">*</span>
            </label>
            <select
              value={country}
              onChange={(e) => updateFields({ country: e.target.value })}
              className={inputClass}
            >
              <option value="" disabled>
                Select your host country
              </option>
              {countryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Citizenship / Nationality</label>
            <select
              value={citizenship}
              onChange={(e) => updateFields({ citizenship: e.target.value })}
              className={inputClass}
            >
              <option value="">Same as host country</option>
              {countryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-brand-400 mt-1 block">
              Leave blank if same as country of residence.
            </span>
          </div>

          <div>
            <label className={labelClass}>State / Province / Region</label>
            <input
              type="text"
              placeholder="e.g. Karnataka or California"
              value={state}
              onChange={(e) => updateFields({ state: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>City</label>
            <input
              type="text"
              placeholder="e.g. Bengaluru or Boston"
              value={city}
              onChange={(e) => updateFields({ city: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="pt-2 border-t border-brand-100">
        <h3 className="text-base font-semibold text-brand-900 mb-1">
          Notification & Alert Preferences
        </h3>
        <p className="text-xs text-brand-500 mb-4">
          Manage how and when FundSphere alerts you to relevant opportunities.
        </p>

        <div className="space-y-2.5">
          <ToggleRow
            checked={notifyNewGrants}
            onChange={() => updateFields({ notifyNewGrants: !notifyNewGrants })}
            label="Instant email alerts for top grant matches"
            sublabel="Get notified when newly published grants match your research profile."
            icon={Bell}
          />

          <ToggleRow
            checked={notifyDeadlines}
            onChange={() => updateFields({ notifyDeadlines: !notifyDeadlines })}
            label="Application deadline reminders"
            sublabel="Receive automated alerts 30, 14, and 7 days before RFPs close."
            icon={Clock}
          />

          <ToggleRow
            checked={notifyWeekly}
            onChange={() => updateFields({ notifyWeekly: !notifyWeekly })}
            label="Weekly curated grant digest"
            sublabel="A weekly summary of high-affinity opportunities tailored to your domain."
            icon={Calendar}
          />
        </div>
      </div>

      {/* Completion Banner */}
      <div className="p-4 rounded-xl border border-primary-200/70 bg-gradient-to-r from-primary-50/70 to-brand-50/50 flex items-start gap-3 text-xs text-brand-700">
        <div className="p-1.5 rounded-lg bg-primary-600 text-white shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <h5 className="font-semibold text-brand-900">Ready to Discover Grants</h5>
          <p className="text-brand-600 mt-0.5">
            Once you click Complete Setup, FundSphere's AI indexing engine will immediately personalize your recommendations and match you with active grant opportunities.
          </p>
        </div>
      </div>
    </div>
  );
}
