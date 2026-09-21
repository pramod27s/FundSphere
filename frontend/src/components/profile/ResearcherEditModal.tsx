import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Building2,
  Target,
  MapPin,
  Wallet,
  Bell,
  Check,
  Plus,
  Loader2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import type { ResearcherResponse, ResearcherRequest } from '../../services/researcherService';
import { enrichFromOrcid } from '../../services/researcherService';
import { toast } from 'react-hot-toast';

interface ResearcherEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  researcher: ResearcherResponse;
  onSave: (updated: ResearcherRequest) => Promise<void>;
}

type TabType = 'organization' | 'research' | 'location' | 'funding' | 'notifications';

const USER_TYPES = [
  { value: 'ACADEMIC', label: 'Academic / Professor' },
  { value: 'STUDENT', label: 'Student / Scholar' },
  { value: 'STARTUP', label: 'Startup / Entrepreneur' },
  { value: 'NON_PROFIT', label: 'Non-Profit / NGO' },
  { value: 'INDIVIDUAL', label: 'Independent Researcher' },
];

const POSITIONS = [
  { value: 'STUDENT', label: 'Student' },
  { value: 'RESEARCH_ASSISTANT', label: 'Research Assistant' },
  { value: 'PROFESSOR', label: 'Professor / Faculty' },
  { value: 'FOUNDER', label: 'Founder / Co-founder' },
  { value: 'NGO_MEMBER', label: 'NGO Member' },
];

const INSTITUTION_TYPES = [
  { value: 'UNIVERSITY', label: 'University' },
  { value: 'RESEARCH_INSTITUTE', label: 'Research Institute' },
  { value: 'PRIVATE_LAB', label: 'Private Lab / Company' },
  { value: 'NON_PROFIT', label: 'Non-Profit Organization' },
  { value: 'STARTUP', label: 'Startup Incubator / Entity' },
];

const EDUCATION_LEVELS = [
  { value: 'UNDERGRADUATE', label: 'Undergraduate' },
  { value: 'MASTERS', label: 'Master\'s Degree' },
  { value: 'PHD', label: 'Doctorate (PhD)' },
  { value: 'POSTDOC', label: 'Postdoctoral' },
];

const PRIMARY_FIELDS = [
  { value: 'COMPUTER_SCIENCE', label: 'Computer Science & AI' },
  { value: 'BIOTECHNOLOGY', label: 'Biotechnology & Life Sciences' },
  { value: 'HEALTHCARE', label: 'Healthcare & Medicine' },
  { value: 'AGRICULTURE', label: 'Agriculture & Food Sciences' },
  { value: 'ENVIRONMENTAL_SCIENCE', label: 'Environmental & Climate' },
  { value: 'PHYSICS', label: 'Physics & Astronomy' },
  { value: 'CHEMISTRY', label: 'Chemistry & Materials' },
  { value: 'ENGINEERING', label: 'Engineering & Robotics' },
  { value: 'SOCIAL_SCIENCES', label: 'Social Sciences & Humanities' },
];

const GRANT_TYPES = [
  { value: 'RESEARCH_GRANT', label: 'Research Grant' },
  { value: 'FELLOWSHIP', label: 'Fellowship / Scholarship' },
  { value: 'TRAVEL_GRANT', label: 'Travel & Conference Grant' },
  { value: 'STARTUP_SEED', label: 'Startup Seed / Innovation Grant' },
  { value: 'EQUIPMENT_GRANT', label: 'Equipment & Infrastructure' },
];

export default function ResearcherEditModal({
  isOpen,
  onClose,
  researcher,
  onSave,
}: ResearcherEditModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('organization');
  const [isSaving, setIsSaving] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form state initialized from researcher props
  const [formData, setFormData] = useState<ResearcherRequest>({
    userType: researcher.userType || 'ACADEMIC',
    institutionName: researcher.institutionName || '',
    department: researcher.department || '',
    position: researcher.position || 'PROFESSOR',
    institutionType: researcher.institutionType || 'UNIVERSITY',
    primaryField: researcher.primaryField || 'COMPUTER_SCIENCE',
    additionalFields: researcher.additionalFields || [],
    keywords: researcher.keywords || [],
    researchSummary: researcher.researchSummary || '',
    orcidId: researcher.orcidId || '',
    country: researcher.country || '',
    state: researcher.state || '',
    city: researcher.city || '',
    citizenship: researcher.citizenship || researcher.country || '',
    minFundingAmount: researcher.minFundingAmount ?? 100000,
    maxFundingAmount: researcher.maxFundingAmount ?? 5000000,
    preferredGrantType: researcher.preferredGrantType || 'RESEARCH_GRANT',
    yearsOfExperience: researcher.yearsOfExperience ?? 3,
    educationLevel: researcher.educationLevel || 'PHD',
    hasCompletedPhd: researcher.hasCompletedPhd ?? (researcher.educationLevel === 'PHD' || researcher.educationLevel === 'POSTDOC'),
    previousGrantsReceived: researcher.previousGrantsReceived ?? false,
    emailNotifications: researcher.emailNotifications ?? true,
    deadlineReminders: researcher.deadlineReminders ?? true,
    weeklyGrantRecommendations: researcher.weeklyGrantRecommendations ?? true,
  });

  if (!isOpen) return null;

  const handleFieldChange = <K extends keyof ResearcherRequest>(field: K, value: ResearcherRequest[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrorMessage(null);
  };

  const handleAddKeyword = () => {
    const trimmed = keywordInput.trim().replace(/^,+|,+$/g, '');
    if (!trimmed) return;

    const newKeywords = trimmed
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 0 && !formData.keywords.includes(k));

    if (newKeywords.length > 0) {
      setFormData((prev) => ({
        ...prev,
        keywords: [...prev.keywords, ...newKeywords],
      }));
    }
    setKeywordInput('');
  };

  const handleRemoveKeyword = (indexToRemove: number) => {
    setFormData((prev) => ({
      ...prev,
      keywords: prev.keywords.filter((_, idx) => idx !== indexToRemove),
    }));
  };

  const handleOrcidEnrich = async () => {
    if (!formData.orcidId.trim()) {
      toast.error('Please enter an ORCID iD first (e.g., 0000-0002-1825-0097)');
      return;
    }
    setIsEnriching(true);
    try {
      const enrichment = await enrichFromOrcid(formData.orcidId.trim());
      if (enrichment.found) {
        toast.success(enrichment.message || 'ORCID details imported!');
        if (enrichment.researchSummary && !formData.researchSummary.trim()) {
          handleFieldChange('researchSummary', enrichment.researchSummary);
        }
        if (enrichment.keywords && enrichment.keywords.length > 0) {
          const uniqueKeywords = Array.from(new Set([...formData.keywords, ...enrichment.keywords]));
          handleFieldChange('keywords', uniqueKeywords);
        }
      } else {
        toast.error(enrichment.message || 'No public ORCID record found');
      }
    } catch {
      toast.error('Failed to lookup ORCID');
    } finally {
      setIsEnriching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.minFundingAmount > formData.maxFundingAmount) {
      setErrorMessage('Minimum funding amount cannot exceed maximum funding amount.');
      setActiveTab('funding');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await onSave(formData);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update researcher profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: 'organization' as TabType, label: 'Organization', icon: Building2 },
    { id: 'research' as TabType, label: 'Research Focus', icon: Target },
    { id: 'location' as TabType, label: 'Location', icon: MapPin },
    { id: 'funding' as TabType, label: 'Funding & Background', icon: Wallet },
    { id: 'notifications' as TabType, label: 'Notifications', icon: Bell },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-950/60 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        className="relative w-full max-w-3xl bg-white rounded-3xl border border-brand-200/80 shadow-2xl overflow-hidden my-6 max-h-[90vh] flex flex-col"
      >
        {/* Modal Header */}
        <div className="relative px-6 py-5 border-b border-brand-100 bg-gradient-to-r from-primary-50/60 via-white to-white flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-brand-900 tracking-tight flex items-center gap-2">
              Edit Researcher Profile
            </h2>
            <p className="text-xs text-brand-500 mt-0.5">
              Update your research profile to improve grant discovery and matching accuracy
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-brand-400 hover:text-brand-700 hover:bg-brand-100/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-brand-100 px-6 bg-brand-50/40 overflow-x-auto no-scrollbar shrink-0 gap-1 pt-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition-all whitespace-nowrap border-b-2 ${
                  isActive
                    ? 'border-primary-600 text-primary-700 bg-white shadow-sm'
                    : 'border-transparent text-brand-500 hover:text-brand-800 hover:bg-brand-100/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-primary-600' : 'text-brand-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Error message banner */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700 shrink-0">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        {/* Modal Body / Scrollable Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-5">
          <AnimatePresence mode="wait">
            {activeTab === 'organization' && (
              <motion.div
                key="org"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                      User Type *
                    </label>
                    <select
                      value={formData.userType}
                      onChange={(e) => handleFieldChange('userType', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                      required
                    >
                      {USER_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                      Position / Role *
                    </label>
                    <select
                      value={formData.position || 'PROFESSOR'}
                      onChange={(e) => handleFieldChange('position', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                    >
                      {POSITIONS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                      Institution / University Name *
                    </label>
                    <input
                      type="text"
                      value={formData.institutionName}
                      onChange={(e) => handleFieldChange('institutionName', e.target.value)}
                      placeholder="e.g. Indian Institute of Science (IISc)"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                      Department / School
                    </label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => handleFieldChange('department', e.target.value)}
                      placeholder="e.g. Department of Computer Science & Automation"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                      Institution Type
                    </label>
                    <select
                      value={formData.institutionType || 'UNIVERSITY'}
                      onChange={(e) => handleFieldChange('institutionType', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                    >
                      {INSTITUTION_TYPES.map((it) => (
                        <option key={it.value} value={it.value}>{it.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                      Education Level
                    </label>
                    <select
                      value={formData.educationLevel || 'PHD'}
                      onChange={(e) => handleFieldChange('educationLevel', e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                    >
                      {EDUCATION_LEVELS.map((el) => (
                        <option key={el.value} value={el.value}>{el.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'research' && (
              <motion.div
                key="research"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                    Primary Domain / Field *
                  </label>
                  <select
                    value={formData.primaryField}
                    onChange={(e) => handleFieldChange('primaryField', e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                    required
                  >
                    {PRIMARY_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider">
                      ORCID iD (Optional)
                    </label>
                    <button
                      type="button"
                      onClick={handleOrcidEnrich}
                      disabled={isEnriching || !formData.orcidId.trim()}
                      className="inline-flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-semibold disabled:opacity-50"
                    >
                      {isEnriching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Sync from ORCID
                    </button>
                  </div>
                  <input
                    type="text"
                    value={formData.orcidId}
                    onChange={(e) => handleFieldChange('orcidId', e.target.value)}
                    placeholder="e.g. 0000-0002-1825-0097"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                    Research Summary & Focus
                  </label>
                  <textarea
                    rows={3}
                    value={formData.researchSummary}
                    onChange={(e) => handleFieldChange('researchSummary', e.target.value)}
                    placeholder="Describe your active research topics, methodologies, and target grant outcomes..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                    Research Keywords & Tags
                  </label>
                  <div className="flex gap-2 mb-2.5">
                    <input
                      type="text"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddKeyword();
                        }
                      }}
                      placeholder="Type keyword and press Enter or click Add"
                      className="flex-1 px-3.5 py-2 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddKeyword}
                      className="px-4 py-2 bg-brand-100 hover:bg-brand-200 text-brand-800 text-xs font-semibold rounded-xl transition-colors inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2.5 bg-brand-50/60 rounded-xl border border-brand-100">
                    {formData.keywords.length > 0 ? (
                      formData.keywords.map((kw, idx) => (
                        <span
                          key={`${kw}-${idx}`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-primary-200 text-primary-800 shadow-sm"
                        >
                          {kw}
                          <button
                            type="button"
                            onClick={() => handleRemoveKeyword(idx)}
                            className="text-brand-400 hover:text-red-500 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-brand-400 italic">No keywords added yet.</span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'location' && (
              <motion.div
                key="location"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                      Country *
                    </label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => handleFieldChange('country', e.target.value)}
                      placeholder="e.g. India"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                      Citizenship / Nationality
                    </label>
                    <input
                      type="text"
                      value={formData.citizenship}
                      onChange={(e) => handleFieldChange('citizenship', e.target.value)}
                      placeholder="e.g. Indian"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                      State / Province
                    </label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => handleFieldChange('state', e.target.value)}
                      placeholder="e.g. Karnataka"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                      City
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => handleFieldChange('city', e.target.value)}
                      placeholder="e.g. Bengaluru"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'funding' && (
              <motion.div
                key="funding"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                    Preferred Grant Type
                  </label>
                  <select
                    value={formData.preferredGrantType}
                    onChange={(e) => handleFieldChange('preferredGrantType', e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 bg-white"
                  >
                    {GRANT_TYPES.map((gt) => (
                      <option key={gt.value} value={gt.value}>{gt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                      Min Target Amount (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={50000}
                      value={formData.minFundingAmount}
                      onChange={(e) => handleFieldChange('minFundingAmount', Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                      Max Target Amount (₹)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={50000}
                      value={formData.maxFundingAmount}
                      onChange={(e) => handleFieldChange('maxFundingAmount', Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1.5">
                      Years of Research Experience
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={formData.yearsOfExperience}
                      onChange={(e) => handleFieldChange('yearsOfExperience', Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                    />
                  </div>

                  <div className="flex items-center pt-6">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.previousGrantsReceived}
                        onChange={(e) => handleFieldChange('previousGrantsReceived', e.target.checked)}
                        className="w-4 h-4 text-primary-600 rounded border-brand-300 focus:ring-primary-500"
                      />
                      <span className="text-sm font-medium text-brand-800">
                        Previously received competitive grants
                      </span>
                    </label>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'notifications' && (
              <motion.div
                key="notifications"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-3"
              >
                <div className="p-4 rounded-2xl border border-brand-200 bg-brand-50/40 space-y-3">
                  <label className="flex items-center justify-between cursor-pointer py-1">
                    <div>
                      <span className="text-sm font-semibold text-brand-900 block">New Grant Email Alerts</span>
                      <span className="text-xs text-brand-500 block">Get notified when new grants matching your field are indexed</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.emailNotifications}
                      onChange={(e) => handleFieldChange('emailNotifications', e.target.checked)}
                      className="w-4 h-4 text-primary-600 rounded border-brand-300 focus:ring-primary-500"
                    />
                  </label>

                  <div className="border-t border-brand-100" />

                  <label className="flex items-center justify-between cursor-pointer py-1">
                    <div>
                      <span className="text-sm font-semibold text-brand-900 block">Deadline Reminders</span>
                      <span className="text-xs text-brand-500 block">Receive reminders 14 and 3 days before saved grant deadlines</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.deadlineReminders}
                      onChange={(e) => handleFieldChange('deadlineReminders', e.target.checked)}
                      className="w-4 h-4 text-primary-600 rounded border-brand-300 focus:ring-primary-500"
                    />
                  </label>

                  <div className="border-t border-brand-100" />

                  <label className="flex items-center justify-between cursor-pointer py-1">
                    <div>
                      <span className="text-sm font-semibold text-brand-900 block">Weekly Digest Recommendations</span>
                      <span className="text-xs text-brand-500 block">Weekly curated summary of top grants scored for your profile</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.weeklyGrantRecommendations}
                      onChange={(e) => handleFieldChange('weeklyGrantRecommendations', e.target.checked)}
                      className="w-4 h-4 text-primary-600 rounded border-brand-300 focus:ring-primary-500"
                    />
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-brand-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl border border-brand-200 text-brand-700 text-sm font-medium hover:bg-brand-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 text-white text-sm font-semibold hover:from-primary-700 hover:to-primary-800 shadow-md shadow-primary-500/20 transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
