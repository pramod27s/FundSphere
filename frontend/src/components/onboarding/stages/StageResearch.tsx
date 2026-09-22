import React, { useState } from 'react';
import { Sparkles, Loader2, CheckCircle2, AlertCircle, Plus, X } from 'lucide-react';
import { enrichFromOrcid } from '../../../services/researcherService';

export type StageResearchProps = {
  primaryField: string;
  additionalFields: string[];
  keywords: string;
  researchSummary: string;
  orcidId: string;
  updateFields: (fields: Partial<{
    primaryField: string;
    additionalFields: string[];
    keywords: string;
    researchSummary: string;
    orcidId: string;
  }>) => void;
};

// Values exactly map to backend PrimaryField enum
const primaryFieldOptions = [
  { value: 'ARTIFICIAL_INTELLIGENCE', label: 'Artificial Intelligence & ML' },
  { value: 'DATA_SCIENCE', label: 'Data Science & Analytics' },
  { value: 'HEALTHCARE', label: 'Healthcare & Medicine' },
  { value: 'ENVIRONMENT', label: 'Environment & Climate' },
  { value: 'AGRICULTURE', label: 'Agriculture & Food Systems' },
  { value: 'ROBOTICS', label: 'Robotics & Autonomous Systems' },
  { value: 'EDUCATION', label: 'Education & Learning Sciences' },
  { value: 'SOCIAL_IMPACT', label: 'Social Impact & Public Policy' },
];

export default function StageResearch({
  primaryField,
  additionalFields,
  keywords,
  researchSummary,
  orcidId,
  updateFields,
}: StageResearchProps) {
  const [orcidLoading, setOrcidLoading] = useState(false);
  const [orcidMsg, setOrcidMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [keywordDraft, setKeywordDraft] = useState('');

  // Parse keywords string into array of chips
  const keywordList = keywords
    ? keywords.split(',').map((k) => k.trim()).filter(Boolean)
    : [];

  const addKeyword = (rawTag: string) => {
    const trimmed = rawTag.trim().replace(/^,+|,+$/g, '');
    if (!trimmed) return;
    if (!keywordList.some((k) => k.toLowerCase() === trimmed.toLowerCase())) {
      const updated = [...keywordList, trimmed].join(', ');
      updateFields({ keywords: updated });
    }
    setKeywordDraft('');
  };

  const removeKeyword = (tagToRemove: string) => {
    const updated = keywordList.filter((k) => k !== tagToRemove).join(', ');
    updateFields({ keywords: updated });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addKeyword(keywordDraft);
    }
  };

  const toggleAdditionalField = (fieldValue: string) => {
    const current = additionalFields || [];
    const next = current.includes(fieldValue)
      ? current.filter((f) => f !== fieldValue)
      : [...current, fieldValue];
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
        const updates: Partial<StageResearchProps> = {};
        if (res.researchSummary && !researchSummary.trim()) {
          updates.researchSummary = res.researchSummary;
        }
        if (res.keywords && res.keywords.length > 0) {
          const existing = keywords.split(',').map((k) => k.trim()).filter(Boolean);
          const merged = Array.from(new Set([...existing, ...res.keywords]));
          updates.keywords = merged.join(', ');
        }
        updateFields(updates);
        setOrcidMsg({ text: res.message || 'Imported from ORCID — review fields below.', ok: true });
      } else {
        setOrcidMsg({ text: res.message || 'No public data found for that ORCID iD.', ok: false });
      }
    } catch {
      setOrcidMsg({ text: 'Could not reach ORCID. You can fill the fields manually.', ok: false });
    } finally {
      setOrcidLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-2.5 rounded-xl border border-brand-200 bg-white/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all text-sm text-brand-900 placeholder:text-brand-400';
  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-brand-700 mb-1.5';

  return (
    <div className="space-y-6">
      {/* Optional ORCID Import banner */}
      <div className="rounded-2xl border border-primary-200/80 bg-primary-50/40 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <h4 className="text-sm font-semibold text-brand-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-primary-600" />
              Import from ORCID (Optional)
            </h4>
            <p className="text-xs text-brand-500 mt-0.5">
              Have an ORCID iD? We can automatically prefill your research summary and keywords.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <input
            type="text"
            inputMode="numeric"
            placeholder="e.g. 0000-0002-1825-0097"
            value={orcidId}
            onChange={(e) => updateFields({ orcidId: e.target.value })}
            className={`${inputClass} sm:flex-1`}
          />
          <button
            type="button"
            onClick={handleOrcidFetch}
            disabled={orcidLoading}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs shrink-0 transition-all cursor-pointer ${
              orcidLoading
                ? 'bg-brand-200 text-brand-400 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-700 text-white shadow-sm active:scale-95'
            }`}
          >
            {orcidLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {orcidLoading ? 'Connecting…' : 'Autofill via ORCID'}
          </button>
        </div>

        {orcidMsg && (
          <div className={`flex items-start gap-1.5 mt-2.5 text-xs ${orcidMsg.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
            {orcidMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
            <span>{orcidMsg.text}</span>
          </div>
        )}
      </div>

      {/* Primary Field Selection */}
      <div>
        <label className={labelClass}>
          Primary Research Field <span className="text-primary-600">*</span>
        </label>
        <p className="text-xs text-brand-500 mb-3">
          The main discipline your research falls under.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {primaryFieldOptions.map((f) => {
            const isSelected = primaryField === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => updateFields({ primaryField: f.value })}
                className={`py-2.5 px-3 rounded-xl border text-xs font-semibold text-center transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-primary-600 text-white border-primary-600 shadow-sm ring-1 ring-primary-600'
                    : 'bg-white border-brand-200 text-brand-700 hover:border-primary-300 hover:bg-brand-50/50'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Additional Fields Multi-select */}
      <div>
        <label className={labelClass}>Additional / Interdisciplinary Areas (Optional)</label>
        <p className="text-xs text-brand-500 mb-2">
          Select any cross-cutting domains to discover interdisciplinary grant programs.
        </p>
        <div className="flex flex-wrap gap-2">
          {primaryFieldOptions
            .filter((f) => f.value !== primaryField)
            .map((f) => {
              const isSelected = (additionalFields || []).includes(f.value);
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => toggleAdditionalField(f.value)}
                  className={`py-1.5 px-3 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-primary-50 text-primary-800 border-primary-400 font-semibold'
                      : 'bg-white border-brand-200 text-brand-600 hover:border-brand-300'
                  }`}
                >
                  {isSelected ? '✓ ' : '+ '}
                  {f.label}
                </button>
              );
            })}
        </div>
      </div>

      {/* Research Summary */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={labelClass}>
            Research Summary & Problem Statement <span className="text-brand-400 font-normal lowercase">(recommended)</span>
          </label>
        </div>
        <p className="text-xs text-brand-500 mb-2">
          A few sentences describing your current research questions, methodologies, and intended outcomes. FundSphere generates vector embeddings from this text to match you with grant opportunities.
        </p>
        <textarea
          rows={4}
          placeholder="e.g. Developing low-latency computer vision models for edge medical devices, with applications in early cancer screening in low-resource clinics..."
          value={researchSummary}
          onChange={(e) => updateFields({ researchSummary: e.target.value })}
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Interactive Keyword Tags */}
      <div>
        <label className={labelClass}>
          Keywords & Methodologies <span className="text-brand-400 font-normal lowercase">(optional)</span>
        </label>
        <p className="text-xs text-brand-500 mb-2">
          Add specific topics, techniques, or equipment (press Enter or comma to add).
        </p>

        <div className="p-2.5 rounded-xl border border-brand-200 bg-white/70 focus-within:bg-white focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/30 transition-all flex flex-wrap items-center gap-1.5">
          {keywordList.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 bg-primary-50 text-primary-800 border border-primary-200 text-xs font-medium px-2.5 py-1 rounded-lg"
            >
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => removeKeyword(tag)}
                className="hover:text-primary-950 p-0.5 rounded cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          <div className="flex items-center gap-1 flex-1 min-w-[160px]">
            <input
              type="text"
              placeholder={keywordList.length === 0 ? "Type keyword (e.g. 'Genomics') and press Enter..." : "Add more..."}
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full text-xs text-brand-900 placeholder:text-brand-400 bg-transparent outline-none px-1 py-1"
            />
            {keywordDraft.trim() && (
              <button
                type="button"
                onClick={() => addKeyword(keywordDraft)}
                className="p-1 text-primary-600 hover:text-primary-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
