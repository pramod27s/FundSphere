/**
 * Choices for a researcher profile, with the labels people see. Every value
 * matches CoreBackend's enum of the same name, so a value picked here always
 * saves; onboarding, Edit profile and the profile page all read these lists.
 */

export interface ProfileOption {
  value: string;
  label: string;
}

/** CoreBackend UserType. */
export const USER_TYPE_OPTIONS: ProfileOption[] = [
  { value: 'RESEARCHER', label: 'Researcher' },
  { value: 'STUDENT', label: 'Student / Scholar' },
  { value: 'PROFESSOR_FACULTY', label: 'Professor / Faculty' },
  { value: 'STARTUP_COMPANY', label: 'Startup / Founder' },
  { value: 'NONPROFIT_ORGANIZATION', label: 'Non-profit / NGO' },
];

/** CoreBackend Position. */
export const POSITION_OPTIONS: ProfileOption[] = [
  { value: 'PROFESSOR', label: 'Professor / Faculty' },
  { value: 'RESEARCH_ASSISTANT', label: 'Research Assistant / Fellow' },
  { value: 'STUDENT', label: 'Student / Scholar' },
  { value: 'FOUNDER', label: 'Founder / Entrepreneur' },
  { value: 'NGO_MEMBER', label: 'NGO / Non-profit member' },
];

/** CoreBackend InstitutionType. */
export const INSTITUTION_TYPE_OPTIONS: ProfileOption[] = [
  { value: 'UNIVERSITY', label: 'University' },
  { value: 'COLLEGE', label: 'College' },
  { value: 'RESEARCH_INSTITUTE', label: 'Research institute' },
  { value: 'GOVERNMENT_LAB', label: 'Government lab or agency' },
  { value: 'HOSPITAL', label: 'Hospital or medical centre' },
  { value: 'STARTUP', label: 'Startup or incubator' },
  { value: 'INDUSTRY', label: 'Private industry' },
  { value: 'NGO', label: 'NGO / Non-profit' },
  { value: 'OTHER', label: 'Other' },
];

/** CoreBackend EducationLevel. */
export const EDUCATION_LEVEL_OPTIONS: ProfileOption[] = [
  { value: 'UNDERGRADUATE', label: 'Undergraduate' },
  { value: 'MASTERS', label: "Master's degree" },
  { value: 'PHD', label: 'PhD' },
];

/** CoreBackend GrantType. */
export const GRANT_TYPE_OPTIONS: ProfileOption[] = [
  { value: 'RESEARCH_GRANT', label: 'Research grant' },
  { value: 'FELLOWSHIP', label: 'Fellowship / Stipend' },
  { value: 'TRAVEL_GRANT', label: 'Travel and mobility' },
  { value: 'STARTUP_FUNDING', label: 'Commercial / Seed R&D' },
  { value: 'NGO_FUNDING', label: 'NGO / Community impact' },
];

/** CoreBackend PrimaryField, in the order onboarding shows them. */
export const RESEARCH_FIELD_OPTIONS: ProfileOption[] = [
  { value: 'ARTIFICIAL_INTELLIGENCE', label: 'Artificial Intelligence & ML' },
  { value: 'COMPUTER_SCIENCE', label: 'Computer Science & IT' },
  { value: 'DATA_SCIENCE', label: 'Data Science & Analytics' },
  { value: 'ENGINEERING', label: 'Engineering & Technology' },
  { value: 'PHYSICS', label: 'Physics & Astronomy' },
  { value: 'CHEMISTRY', label: 'Chemistry' },
  { value: 'MATERIALS_SCIENCE', label: 'Materials & Nanotechnology' },
  { value: 'MATHEMATICS', label: 'Mathematics & Statistics' },
  { value: 'LIFE_SCIENCES', label: 'Life Sciences & Biotechnology' },
  { value: 'HEALTHCARE', label: 'Healthcare & Medicine' },
  { value: 'AGRICULTURE', label: 'Agriculture & Food Systems' },
  { value: 'ENVIRONMENT', label: 'Environment & Climate' },
  { value: 'ENERGY', label: 'Energy & Renewables' },
  { value: 'EARTH_SCIENCES', label: 'Earth, Ocean & Space Sciences' },
  { value: 'ROBOTICS', label: 'Robotics & Autonomous Systems' },
  { value: 'EDUCATION', label: 'Education & Learning Sciences' },
  { value: 'SOCIAL_SCIENCES', label: 'Social Sciences & Humanities' },
  { value: 'SOCIAL_IMPACT', label: 'Social Impact & Public Policy' },
];

/** The label for `value`, or null when it's empty or not in the list. */
export function optionLabel(options: ProfileOption[], value: string | null | undefined): string | null {
  if (!value) return null;
  return options.find((option) => option.value === value)?.label ?? null;
}

/** Profile budget presets, in lakh; they match the Discovery funding filter. */
export const BUDGET_PRESETS: Array<{ label: string; minLakh: number | null; maxLakh: number | null }> = [
  { label: 'Under ₹5 lakh', minLakh: null, maxLakh: 5 },
  { label: '₹5–25 lakh', minLakh: 5, maxLakh: 25 },
  { label: '₹25 lakh–₹1 crore', minLakh: 25, maxLakh: 100 },
  { label: 'Over ₹1 crore', minLakh: 100, maxLakh: null },
];
