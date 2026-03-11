import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import AnimatedLogo from '../common/AnimatedLogo';

import StepAccountInfo from './steps/StepAccountInfo.tsx';
import StepUserType from './steps/StepUserType.tsx';
import StepOrganization from './steps/StepOrganization.tsx';
import StepResearchArea from './steps/StepResearchArea.tsx';
import StepLocation from './steps/StepLocation.tsx';
import StepFundingPrefs from './steps/StepFundingPrefs.tsx';
import StepExperience from './steps/StepExperience.tsx';
import StepNotifications from './steps/StepNotifications.tsx';

export type FormData = {
  // Step 1
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phoneNumber: string;
  // Step 2
  userType: string;
  // Step 3
  orgName: string;
  department: string;
  role: string;
  // Step 4
  primaryField: string;
  keywords: string;
  // Step 5
  country: string;
  state: string;
  city: string;
  // Step 6
  minFunding: string;
  maxFunding: string;
  grantType: string;
  // Step 7
  yearsExperience: string;
  educationLevel: string;
  previousGrants: string;
  // Step 8
  notifyNewGrants: boolean;
  notifyDeadlines: boolean;
  notifyWeekly: boolean;
};

const initialData: FormData = {
  fullName: '', email: '', password: '', confirmPassword: '', phoneNumber: '',
  userType: '', orgName: '', department: '', role: '',
  primaryField: '', keywords: '', country: '', state: '', city: '',
  minFunding: '', maxFunding: '', grantType: '',
  yearsExperience: '', educationLevel: '', previousGrants: '',
  notifyNewGrants: true, notifyDeadlines: true, notifyWeekly: true,
};

const stepsConfig = [
  { title: "Account Info", component: StepAccountInfo },
  { title: "User Type", component: StepUserType },
  { title: "Organization", component: StepOrganization },
  { title: "Research Area", component: StepResearchArea },
  { title: "Location", component: StepLocation },
  { title: "Funding Preferences", component: StepFundingPrefs },
  { title: "Experience", component: StepExperience },
  { title: "Notifications", component: StepNotifications },
];

export default function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<FormData>(initialData);
  const [direction, setDirection] = useState(0);

  const updateFields = (fields: Partial<FormData>) => {
    setFormData(prev => ({ ...prev, ...fields }));
  };

  const currentStepData = stepsConfig[currentStep];
  const StepComponent = currentStepData.component;
  const isLastStep = currentStep === stepsConfig.length - 1;

  const handleNext = () => {
    if (currentStep < stepsConfig.length - 1) {
      setDirection(1);
      setCurrentStep(prev => prev + 1);
    } else {
      console.log("Submit Form Data: ", formData);
      alert("Onboarding complete! Check console for payload.");
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep(prev => prev - 1);
    }
  };

  // Variants for Framer Motion sliding effect
  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 300 : -300,
      opacity: 0
    })
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl border border-brand-100 overflow-hidden min-h-[500px] flex flex-col relative">
      {/* Header / Progress bar */}
      <div className="bg-brand-50/50 border-b border-brand-100 px-8 py-6">
        <div className="flex items-center justify-between mb-4">
          <AnimatedLogo className="w-9 h-9" textClassName="text-xl" showText={true} />
          <span className="text-sm font-medium text-brand-500">
            Step {currentStep + 1} of {stepsConfig.length}
          </span>
        </div>
        
        {/* Progress tracks */}
        <div className="w-full flex gap-2">
          {stepsConfig.map((_, idx) => (
            <div 
              key={idx} 
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                idx <= currentStep ? 'bg-primary-500' : 'bg-brand-200'
              }`}
            />
          ))}
        </div>
        <h2 className="mt-4 text-lg font-semibold text-brand-900">
          {currentStepData.title}
        </h2>
      </div>

      {/* Form Content Area */}
      <div className="flex-1 p-8 relative overflow-x-hidden">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 }
            }}
            className="w-full"
          >
            {/* The individual step injects form fields and binds values to formData using updateFields */}
            <StepComponent 
              {...formData} 
              updateFields={updateFields} 
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer Controls */}
      <div className="px-8 py-5 border-t border-brand-100 bg-brand-50/30 flex justify-between items-center mt-auto">
        {currentStep > 0 ? (
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-brand-600 hover:bg-brand-100 transition-colors font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        ) : <div />}

        <button
          onClick={handleNext}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white shadow-md shadow-primary-500/20 transition-all active:scale-95 font-medium ml-auto"
        >
          {isLastStep ? 'Complete Setup' : 'Continue'}
          {isLastStep ? <Check className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
