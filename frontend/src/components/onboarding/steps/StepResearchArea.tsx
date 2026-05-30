import { useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { enrichFromOrcid } from '../../../services/researcherService';

type StepProps = {
  primaryField: string;
  additionalFields: string[];
  keywords: string;
  researchSummary: string;
  orcidId: string;
  updateFields: (fields: Partial<StepProps>) => void;
};

const fieldsList = [
  "Artificial Intelligence",
  "Healthcare",
  "Education",
  "Environment",
  "Agriculture",
  "Robotics",
  "Data Science",
  "Social Impact",
  "Other"
];

export default function StepResearchArea({
  primaryField, additionalFields, keywords, researchSummary, orcidId, updateFields
}: StepProps) {
  const [orcidLoading, setOrcidLoading] = useState(false);
  const [orcidMsg, setOrcidMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const toggleAdditionalField = (field: string) => {
    const current = additionalFields || [];
    const next = current.includes(field)
      ? current.filter(f => f !== field)
      : [...current, field];
    updateFields({ additionalFields: next });
  };

  const handleOrcidFetch = async () => {
    if (!orcidId.trim()) {
      setOrcidMsg({ text: 'Enter your ORCID iD first (e.g. 0000-0002-1825-0097).', ok: false });
      return;
    }
    setOrcidLoading(true);
    setOrcidMsg(null);
    try {
      const res = await enrichFromOrcid(orcidId.trim());
      if (res.found) {
        const updates: Partial<StepProps> = {};
        // Only prefill the summary if the user hasn't written one — never clobber their words.
        if (res.researchSummary && !researchSummary.trim()) {
          updates.researchSummary = res.researchSummary;
        }
        if (res.keywords && res.keywords.length > 0) {
          const existing = keywords.split(',').map(k => k.trim()).filter(Boolean);
          const merged = Array.from(new Set([...existing, ...res.keywords]));
          updates.keywords = merged.join(', ');
        }
        updateFields(updates);
        setOrcidMsg({ text: res.message || 'Imported from ORCID — review the fields below.', ok: true });
      } else {
        setOrcidMsg({ text: res.message || 'No public data found for that ORCID iD.', ok: false });
      }
    } catch {
      setOrcidMsg({ text: 'Could not reach ORCID. Please fill the fields manually.', ok: false });
    } finally {
      setOrcidLoading(false);
    }
  };
  const inputClass = "w-full px-4 py-2.5 rounded-lg border border-brand-200 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-colors bg-white/50";
  const labelClass = "block text-sm font-medium text-brand-700 mb-1.5";

  return (
    <div className="flex flex-col gap-5">
      <p className="text-brand-500 mb-1">We use this to match you with highly relevant grants.</p>

      {/* Optional ORCID import — prefills the summary & keywords below. */}
      <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-4">
        <label className={labelClass}>Have an ORCID iD? Import your profile (optional)</label>
        <p className="text-xs text-brand-500 mb-2">We’ll pull your public summary and keywords from ORCID so you don’t have to type them. You can edit everything after.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            inputMode="numeric"
            placeholder="0000-0002-1825-0097"
            value={orcidId}
            onChange={e => updateFields({ orcidId: e.target.value })}
            className={inputClass + ' sm:flex-1'}
          />
          <button
            type="button"
            onClick={handleOrcidFetch}
            disabled={orcidLoading}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium shrink-0 transition-all ${
              orcidLoading
                ? 'bg-brand-200 text-brand-500 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700 text-white shadow-md shadow-primary-500/20 active:scale-95'
            }`}
          >
            {orcidLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {orcidLoading ? 'Importing…' : 'Import from ORCID'}
          </button>
        </div>
        {orcidMsg && (
          <div className={`flex items-start gap-1.5 mt-2 text-xs ${orcidMsg.ok ? 'text-green-700' : 'text-amber-700'}`}>
            {orcidMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
            <span>{orcidMsg.text}</span>
          </div>
        )}
      </div>

      <div>
        <label className={labelClass}>Primary Field *</label>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
          {fieldsList.map(field => {
            const isSelected = primaryField === field;
            return (
              <button
                key={field}
                onClick={() => updateFields({ primaryField: field })}
                className={`py-2 px-3 text-sm rounded-lg border transition-all ${
                  isSelected 
                    ? 'bg-primary-500 text-white border-primary-500 shadow-sm' 
                    : 'bg-white border-brand-200 text-brand-700 hover:border-primary-300'
                }`}
              >
                {field}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-2">
        <label className={labelClass}>Other Fields You Work In (Optional)</label>
        <p className="text-xs text-brand-500 mb-2">Pick any additional areas — interdisciplinary work matches more grants.</p>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {fieldsList.filter(f => f !== primaryField).map(field => {
            const isSelected = (additionalFields || []).includes(field);
            return (
              <button
                key={field}
                type="button"
                onClick={() => toggleAdditionalField(field)}
                className={`py-2 px-3 text-sm rounded-lg border transition-all ${
                  isSelected
                    ? 'bg-primary-50 text-primary-700 border-primary-500 shadow-sm'
                    : 'bg-white border-brand-200 text-brand-700 hover:border-primary-300'
                }`}
              >
                {field}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-2">
        <label className={labelClass}>Describe Your Research (Recommended)</label>
        <p className="text-xs text-brand-500 mb-2">A few sentences in your own words — what you work on, the problems you solve, methods you use. This is the strongest signal our AI uses to match you with grants.</p>
        <textarea
          rows={4}
          placeholder="e.g. I develop low-power deep-learning models for on-device medical imaging, focused on early disease detection in rural clinics with limited connectivity..."
          value={researchSummary}
          onChange={e => updateFields({ researchSummary: e.target.value })}
          className={inputClass + " resize-none"}
        />
      </div>

      <div className="mt-2">
        <label className={labelClass}>Keywords / Research Interests (Optional)</label>
        <p className="text-xs text-brand-500 mb-2">Separate tags with commas. Example: Machine Learning, Climate Tech, Public Health</p>
        <textarea
          rows={3}
          placeholder="Enter keywords..."
          value={keywords}
          onChange={e => updateFields({ keywords: e.target.value })}
          className={inputClass + " resize-none"}
        />
      </div>
    </div>
  );
}
