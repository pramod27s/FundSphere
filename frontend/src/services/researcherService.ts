// Service to handle Researcher API calls
import { apiFetch } from './apiClient';

export interface ResearcherRequest {
  userType: string;
  institutionName: string;
  department: string;
  position: string | null;
  institutionType: string | null;
  primaryField: string;
  additionalFields: string[];
  keywords: string[];
  researchSummary: string;
  orcidId: string;
  country: string;
  state: string;
  city: string;
  citizenship: string;
  minFundingAmount: number;
  maxFundingAmount: number;
  preferredGrantType: string;
  yearsOfExperience: number;
  educationLevel: string;
  hasCompletedPhd: boolean | null;
  previousGrantsReceived: boolean;
  emailNotifications: boolean;
  deadlineReminders: boolean;
  weeklyGrantRecommendations: boolean;
}

export interface OrcidEnrichmentResponse {
  found: boolean;
  message: string;
  name?: string;
  researchSummary?: string;
  keywords?: string[];
}

export interface ResearcherResponse {
  id: number;
  userType: string;
  institutionName: string;
  department: string;
  position: string | null;
  institutionType: string | null;
  primaryField: string;
  additionalFields: string[];
  keywords: string[];
  researchSummary: string;
  orcidId: string;
  country: string;
  state: string;
  city: string;
  citizenship: string;
  minFundingAmount: number;
  maxFundingAmount: number;
  preferredGrantType: string;
  yearsOfExperience: number;
  educationLevel: string;
  hasCompletedPhd: boolean | null;
  previousGrantsReceived: boolean;
  emailNotifications: boolean;
  deadlineReminders: boolean;
  weeklyGrantRecommendations: boolean;
}

const API_PATH = '/api/researchers';

export const createResearcher = async (data: ResearcherRequest): Promise<ResearcherResponse> => {
  try {
    const response = await apiFetch(API_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to create researcher:', error);
    throw error;
  }
};

export const enrichFromOrcid = async (orcidId: string): Promise<OrcidEnrichmentResponse> => {
  const response = await apiFetch(`${API_PATH}/enrich/orcid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orcidId }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ORCID enrichment failed: ${response.status} ${response.statusText} - ${errorText}`);
  }
  return (await response.json()) as OrcidEnrichmentResponse;
};

export const getMyResearcher = async (): Promise<ResearcherResponse> => {
  const response = await apiFetch(`${API_PATH}/me`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error: ${response.status} ${response.statusText} - ${errorText}`);
  }
  return response.json() as Promise<ResearcherResponse>;
};

