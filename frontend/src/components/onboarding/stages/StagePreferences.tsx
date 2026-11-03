import { useId } from 'react';
import { CalendarPlus, Globe2, Sparkles } from 'lucide-react';

export type StagePreferencesProps = {
  country: string;
  state: string;
  city: string;
  citizenship: string;
  updateFields: (fields: Partial<{
    country: string;
    state: string;
    city: string;
    citizenship: string;
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

export default function StagePreferences({
  country,
  state,
  city,
  citizenship,
  updateFields,
}: StagePreferencesProps) {
  const id = useId();
  const inputClass =
    'w-full px-4 py-2.5 rounded-lg border border-brand-200 bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all text-sm text-brand-900 placeholder:text-brand-400';
  const labelClass = 'block text-sm font-medium text-brand-700 mb-1.5';

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <Globe2 className="w-4 h-4 text-primary-600" />
          <h3 className="text-base font-semibold text-brand-900">
            Where you work
          </h3>
        </div>
        <p className="text-xs text-brand-500 mb-4">
          Many funding bodies only fund researchers in a particular country, or of a particular citizenship.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${id}-country`} className={labelClass}>
              Country of residence or lab location <span className="text-primary-600">*</span>
            </label>
            <select
              id={`${id}-country`}
              value={country}
              onChange={(e) => updateFields({ country: e.target.value })}
              className={inputClass}
            >
              <option value="" disabled>
                Select your country
              </option>
              {countryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${id}-citizenship`} className={labelClass}>Citizenship or nationality</label>
            <select
              id={`${id}-citizenship`}
              value={citizenship}
              onChange={(e) => updateFields({ citizenship: e.target.value })}
              className={inputClass}
            >
              <option value="">Same as country of residence</option>
              {countryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${id}-state`} className={labelClass}>State or region</label>
            <input
              id={`${id}-state`}
              type="text"
              placeholder="e.g. Karnataka or Maharashtra"
              value={state}
              onChange={(e) => updateFields({ state: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor={`${id}-city`} className={labelClass}>City</label>
            <input
              id={`${id}-city`}
              type="text"
              placeholder="e.g. Bengaluru or Pune"
              value={city}
              onChange={(e) => updateFields({ city: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* FundSphere sends no emails; deadline reminders come from the calendar feed. */}
      <div className="pt-2 border-t border-brand-100">
        <div className="flex items-center gap-1.5 mb-1">
          <CalendarPlus className="w-4 h-4 text-primary-600" />
          <h3 className="text-base font-semibold text-brand-900">Reminders</h3>
        </div>
        <p className="text-xs text-brand-500">
          FundSphere doesn't send emails. Once you start an application or add a grant you hold, you can put its
          deadlines in Google Calendar, so reminders reach your phone.
        </p>
      </div>

      <div className="p-4 rounded-lg border border-primary-200 bg-primary-50 flex items-start gap-3 text-xs text-brand-700">
        <div className="p-1.5 rounded-lg bg-primary-600 text-white shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <h4 className="font-semibold text-brand-900">Ready to find grants</h4>
          <p className="text-brand-600 mt-0.5">
            Next, describe your research in the search box and press AI Match to see the calls that fit you best.
          </p>
        </div>
      </div>
    </div>
  );
}
