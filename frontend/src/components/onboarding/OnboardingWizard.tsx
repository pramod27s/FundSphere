import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Check, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import AnimatedLogo from '../common/AnimatedLogo';
import { createResearcher, type ResearcherRequest, type ResearcherResponse } from '../../services/researcherService';

import StageIdentity from './stages/StageIdentity';
import StageResearch from './stages/StageResearch';
import StageFundingEligibility from './stages/StageFundingEligibility';
import StagePreferences from './stages/StagePreferences';

export type OnboardingFormData = {
  // Stage 1: Identity & Affiliation
  userType: string;
  orgName: string;
  department: string;
  role: string;
  institutionType: string;

  // Stage 2: Research Focus & ORCID
  primaryField: string;
  additionalFields: string[];
  keywords: string;
  researchSummary: string;
  orcidId: string;

  // Stage 3: Funding & Eligibility
  minFunding: string;
  maxFunding: string;
  grantType: string;
  yearsExperience: string;
  educationLevel: string;
  hasCompletedPhd: string;
  previousGrants: string;

  // Stage 4: Location & Preferences
  country: string;
  state: string;
  city: string;
  citizenship: string;
  notifyNewGrants: boolean;
  notifyDeadlines: boolean;
  notifyWeekly: boolean;
};

const initialData: OnboardingFormData = {
  userType: 'Researcher',
  orgName: '',
  department: '',
  role: 'Research Assistant',
  institutionType: 'UNIVERSITY',

  primaryField: 'ARTIFICIAL_INTELLIGENCE',
  additionalFields: [],
  keywords: '',
  researchSummary: '',
  orcidId: '',

  minFunding: '',
  maxFunding: '',
  grantType: 'Research grant',
  yearsExperience: '0-2',
  educationLevel: 'Masters',
  hasCompletedPhd: 'No',
  previousGrants: 'No',

  country: 'India',
  state: '',
  city: '',
  citizenship: '',
  notifyNewGrants: true,
  notifyDeadlines: true,
  notifyWeekly: true,
};

const stagesConfig = [
  { id: 'identity', title: 'Identity & Role', subtitle: 'Who you are & your affiliation' },
  { id: 'research', title: 'Research Focus', subtitle: 'Your domains, bio & keywords' },
  { id: 'funding', title: 'Funding & Eligibility', subtitle: 'Target grants & career background' },
  { id: 'preferences', title: 'Location & Alerts', subtitle: 'Residency & notification settings' },
];

const userTypeMap: Record<string, string> = {
  'Researcher': 'RESEARCHER',
  'Student': 'STUDENT',
  'Nonprofit Organization': 'NONPROFIT_ORGANIZATION',
  'Startup / Company': 'STARTUP_COMPANY',
  'Professor / Faculty': 'PROFESSOR_FACULTY',
};

const positionMap: Record<string, string> = {
  'Professor': 'PROFESSOR',
  'Research Assistant': 'RESEARCH_ASSISTANT',
  'Student': 'STUDENT',
  'Founder': 'FOUNDER',
  'NGO Member': 'NGO_MEMBER',
  'Other': 'RESEARCH_ASSISTANT', // Safe fallback so DB NOT NULL constraint never fails
};

const grantTypeMap: Record<string, string> = {
  'Research grant': 'RESEARCH_GRANT',
  'Travel grant': 'TRAVEL_GRANT',
  'Fellowship': 'FELLOWSHIP',
  'Startup funding': 'STARTUP_FUNDING',
  'NGO funding': 'NGO_FUNDING',
};

const validFields = [
  'ARTIFICIAL_INTELLIGENCE',
  'DATA_SCIENCE',
  'HEALTHCARE',
  'ENVIRONMENT',
  'AGRICULTURE',
  'ROBOTICS',
  'EDUCATION',
  'SOCIAL_IMPACT',
];

export default function OnboardingWizard({ onComplete }: { onComplete: (data: ResearcherResponse) => void }) {
  const [currentStage, setCurrentStage] = useState(0);
  const [formData, setFormData] = useState<OnboardingFormData>(initialData);
  const [direction, setDirection] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);

  const updateFields = (fields: Partial<OnboardingFormData>) => {
    setFormData((prev) => ({ ...prev, ...fields }));
  };

  const currentStageData = stagesConfig[currentStage];
  const isLastStage = currentStage === stagesConfig.length - 1;

  const validateCurrentStage = (): boolean => {
    switch (currentStage) {
      case 0: // Identity
        return !!formData.userType && !!formData.orgName.trim() && !!formData.role;
      case 1: // Research Focus
        return !!formData.primaryField;
      case 2: // Funding & Eligibility
        if (formData.minFunding && formData.maxFunding && Number(formData.minFunding) > Number(formData.maxFunding)) {
          return false;
        }
        return !!formData.grantType;
      case 3: // Location & Alerts
        return !!formData.country;
      default:
        return true;
    }
  };

  const canProceed = validateCurrentStage();

  const mapEducationLevel = (lvl: string): 'UNDERGRADUATE' | 'MASTERS' | 'PHD' => {
    if (lvl === 'Masters') return 'MASTERS';
    if (lvl === 'PhD' || lvl === 'Postdoc') return 'PHD';
    return 'UNDERGRADUATE';
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const yearsExp = parseInt(formData.yearsExperience.split('-')[0].replace('+', '')) || 0;
      const eduLevel = mapEducationLevel(formData.educationLevel);
      const position = positionMap[formData.role] || 'RESEARCH_ASSISTANT';

      let hasCompletedPhd: boolean | null = null;
      if (formData.hasCompletedPhd === 'Yes') hasCompletedPhd = true;
      else if (formData.hasCompletedPhd === 'No') hasCompletedPhd = false;
      else if (formData.educationLevel === 'Postdoc') hasCompletedPhd = true;

      const primaryField = validFields.includes(formData.primaryField)
        ? formData.primaryField
        : 'ARTIFICIAL_INTELLIGENCE';

      const payload: ResearcherRequest = {
        userType: userTypeMap[formData.userType] || 'RESEARCHER',
        institutionName: formData.orgName.trim(),
        department: formData.department.trim(),
        position: position,
        institutionType: formData.institutionType || 'UNIVERSITY',
        primaryField: primaryField,
        additionalFields: formData.additionalFields,
        keywords: formData.keywords
          ? formData.keywords.split(',').map((k) => k.trim()).filter(Boolean)
          : [],
        researchSummary: formData.researchSummary.trim(),
        orcidId: formData.orcidId.trim(),
        country: formData.country,
        state: formData.state.trim(),
        city: formData.city.trim(),
        citizenship: formData.citizenship.trim() || formData.country,
        minFundingAmount: Number(formData.minFunding) || 0,
        maxFundingAmount: Number(formData.maxFunding) || 0,
        preferredGrantType: grantTypeMap[formData.grantType] || 'RESEARCH_GRANT',
        yearsOfExperience: yearsExp,
        educationLevel: eduLevel,
        hasCompletedPhd: hasCompletedPhd,
        previousGrantsReceived: formData.previousGrants === 'Yes',
        emailNotifications: formData.notifyNewGrants,
        deadlineReminders: formData.notifyDeadlines,
        weeklyGrantRecommendations: formData.notifyWeekly,
      };

      const response = await createResearcher(payload);
      toast.success('Researcher profile created! Loading grant matches...');
      onComplete(response);
    } catch (error) {
      console.error('Failed to submit onboarding profile', error);
      toast.error('Could not save profile. Please check your session and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setIsSkipping(true);
    try {
      const payload: ResearcherRequest = {
        userType: userTypeMap[formData.userType] || 'RESEARCHER',
        institutionName: formData.orgName.trim() || 'Academic Institution',
        department: formData.department.trim() || '',
        position: 'RESEARCH_ASSISTANT',
        institutionType: 'UNIVERSITY',
        primaryField: validFields.includes(formData.primaryField)
          ? formData.primaryField
          : 'ARTIFICIAL_INTELLIGENCE',
        additionalFields: formData.additionalFields,
        keywords: formData.keywords
          ? formData.keywords.split(',').map((k) => k.trim()).filter(Boolean)
          : ['Research', 'Grants'],
        researchSummary:
          formData.researchSummary.trim() || 'Exploring interdisciplinary grant opportunities.',
        orcidId: formData.orcidId.trim(),
        country: formData.country || 'India',
        state: formData.state.trim() || '',
        city: formData.city.trim() || '',
        citizenship: formData.citizenship.trim() || formData.country || 'India',
        minFundingAmount: Number(formData.minFunding) || 10000,
        maxFundingAmount: Number(formData.maxFunding) || 500000,
        preferredGrantType: grantTypeMap[formData.grantType] || 'RESEARCH_GRANT',
        yearsOfExperience: 1,
        educationLevel: 'UNDERGRADUATE',
        hasCompletedPhd: null,
        previousGrantsReceived: false,
        emailNotifications: true,
        deadlineReminders: true,
        weeklyGrantRecommendations: true,
      };

      const response = await createResearcher(payload);
      toast.success('Starter profile created. You can customize it anytime!');
      onComplete(response);
    } catch (error) {
      console.error('Failed to skip onboarding', error);
      toast.error('Could not initialize starter profile. Please fill current fields.');
    } finally {
      setIsSkipping(false);
    }
  };

  const handleNext = () => {
    if (!canProceed) return;
    if (currentStage < stagesConfig.length - 1) {
      setDirection(1);
      setCurrentStage((prev) => prev + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStage > 0) {
      setDirection(-1);
      setCurrentStage((prev) => prev - 1);
    }
  };

  const handleStageJump = (targetStage: number) => {
    if (targetStage < currentStage) {
      setDirection(-1);
      setCurrentStage(targetStage);
    }
  };

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 150 : -150,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      zIndex: 0,
      x: dir < 0 ? 150 : -150,
      opacity: 0,
    }),
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-brand-200/80 overflow-hidden min-h-[560px] flex flex-col relative transition-all">
      {/* Top Header */}
      <div className="bg-gradient-to-b from-brand-50/80 to-brand-50/30 border-b border-brand-100 px-5 sm:px-8 py-5">
        <div className="flex items-center justify-between mb-4">
          <AnimatedLogo className="w-8 h-8" textClassName="text-lg" showText={true} />

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-brand-500 tracking-wide uppercase">
              Stage {currentStage + 1} of {stagesConfig.length}
            </span>
            <button
              type="button"
              onClick={handleSkip}
              disabled={isSkipping || isSubmitting}
              className="text-xs font-medium text-brand-600 hover:text-primary-700 bg-white hover:bg-primary-50/50 px-3 py-1.5 rounded-lg border border-brand-200 hover:border-primary-300 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-60"
            >
              <span>{isSkipping ? 'Setting up...' : 'Skip for now'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Interactive 4-Stage Stepper */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {stagesConfig.map((stage, idx) => {
            const isCompleted = idx < currentStage;
            const isCurrent = idx === currentStage;

            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => handleStageJump(idx)}
                disabled={!isCompleted}
                className={`text-left rounded-xl p-2 sm:p-2.5 border transition-all ${
                  isCompleted
                    ? 'border-primary-200 bg-primary-50/50 cursor-pointer hover:bg-primary-50'
                    : isCurrent
                    ? 'border-primary-500 bg-white shadow-xs ring-1 ring-primary-500 cursor-default'
                    : 'border-brand-200/60 bg-brand-50/40 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isCompleted
                        ? 'bg-primary-600 text-white'
                        : isCurrent
                        ? 'bg-primary-600 text-white'
                        : 'bg-brand-200 text-brand-600'
                    }`}
                  >
                    {isCompleted ? <Check className="w-2.5 h-2.5" /> : idx + 1}
                  </div>
                  <span
                    className={`text-xs font-semibold truncate hidden sm:inline ${
                      isCurrent ? 'text-primary-900' : isCompleted ? 'text-primary-800' : 'text-brand-500'
                    }`}
                  >
                    {stage.title}
                  </span>
                </div>
                <div
                  className={`h-1 rounded-full transition-colors ${
                    isCompleted || isCurrent ? 'bg-primary-500' : 'bg-brand-200'
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Stage Title and Subtitle */}
        <div className="mt-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-brand-900 tracking-tight">
              {currentStageData.title}
            </h2>
            <p className="text-xs text-brand-500 mt-0.5">{currentStageData.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Main Stage Content Area */}
      <div className="flex-1 p-5 sm:p-8 relative overflow-x-hidden">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={currentStage}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: 'spring', stiffness: 350, damping: 32 },
              opacity: { duration: 0.15 },
            }}
            className="w-full"
          >
            {currentStage === 0 && (
              <StageIdentity
                userType={formData.userType}
                orgName={formData.orgName}
                department={formData.department}
                role={formData.role}
                institutionType={formData.institutionType}
                updateFields={updateFields}
              />
            )}
            {currentStage === 1 && (
              <StageResearch
                primaryField={formData.primaryField}
                additionalFields={formData.additionalFields}
                keywords={formData.keywords}
                researchSummary={formData.researchSummary}
                orcidId={formData.orcidId}
                updateFields={updateFields}
              />
            )}
            {currentStage === 2 && (
              <StageFundingEligibility
                country={formData.country}
                minFunding={formData.minFunding}
                maxFunding={formData.maxFunding}
                grantType={formData.grantType}
                yearsExperience={formData.yearsExperience}
                educationLevel={formData.educationLevel}
                hasCompletedPhd={formData.hasCompletedPhd}
                previousGrants={formData.previousGrants}
                updateFields={updateFields}
              />
            )}
            {currentStage === 3 && (
              <StagePreferences
                country={formData.country}
                state={formData.state}
                city={formData.city}
                citizenship={formData.citizenship}
                notifyNewGrants={formData.notifyNewGrants}
                notifyDeadlines={formData.notifyDeadlines}
                notifyWeekly={formData.notifyWeekly}
                updateFields={updateFields}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer Navigation */}
      <div className="px-5 sm:px-8 py-4 border-t border-brand-100 bg-brand-50/40 flex justify-between items-center mt-auto">
        {currentStage > 0 ? (
          <button
            type="button"
            onClick={handleBack}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-brand-600 hover:text-brand-900 hover:bg-brand-100/80 transition-all cursor-pointer disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={handleNext}
          disabled={!canProceed || isSubmitting}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-xs shadow-sm transition-all cursor-pointer ${
            canProceed && !isSubmitting
              ? 'bg-primary-600 hover:bg-primary-700 text-white shadow-primary-500/20 active:scale-95'
              : 'bg-brand-200 text-brand-400 cursor-not-allowed shadow-none'
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving Profile...</span>
            </>
          ) : isLastStage ? (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Complete Setup & Discover</span>
            </>
          ) : (
            <>
              <span>Continue</span>
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
