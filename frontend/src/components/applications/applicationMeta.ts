import type { ApplicationStatus, ChecklistCategory } from '../../services/applicationsService';

export const STATUS_ORDER: ApplicationStatus[] = ['PREPARING', 'SUBMITTED', 'AWARDED', 'NOT_FUNDED'];

export const STATUS_META: Record<ApplicationStatus, { label: string; chip: string; dot: string }> = {
  PREPARING: { label: 'Preparing', chip: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  SUBMITTED: { label: 'Submitted', chip: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  AWARDED: { label: 'Awarded', chip: 'bg-primary-50 text-primary-700 border-primary-200', dot: 'bg-primary-500' },
  NOT_FUNDED: { label: 'Not funded', chip: 'bg-brand-100 text-brand-700 border-brand-200', dot: 'bg-brand-400' },
};

export const CATEGORY_ORDER: ChecklistCategory[] = ['DOCUMENTS', 'FORMAT', 'ELIGIBILITY', 'BUDGET', 'SUBMISSION', 'KEY_DATES'];

export const CATEGORY_META: Record<ChecklistCategory, { label: string; hint: string }> = {
  DOCUMENTS: { label: 'Documents & annexures', hint: 'Letters, certificates, CVs and undertakings to attach' },
  FORMAT: { label: 'Format limits', hint: 'Pages, fonts, word counts, file type and size' },
  ELIGIBILITY: { label: 'Eligibility proofs', hint: 'Who can apply, and the proof needed' },
  BUDGET: { label: 'Budget rules', hint: 'Caps, allowed items and overhead' },
  SUBMISSION: { label: 'Submission details', hint: 'Portal, hard copies and forwarding' },
  KEY_DATES: { label: 'Key dates', hint: 'Dates other than the final deadline' },
};
