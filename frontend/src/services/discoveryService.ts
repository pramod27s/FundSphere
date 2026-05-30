import { apiFetch } from './apiClient';
import { formatFundingRange } from '../utils/formatFunding';

export interface DiscoveryGrant {
  id: number;
  title: string;
  funder: string;
  matchScore: number;
  amount: string;
  deadline: string;
  tags: string[];
  eligibility: 'Eligible' | 'Warning';
  rationale: string;
  description: string;
  objectives?: string;
  fundingScope?: string;
  eligibilityCriteria?: string;
  selectionCriteria?: string;
  grantDuration?: string;
  researchThemes?: string[];
  /** Funding mechanism, e.g. "Fellowship". */
  grantType?: string;
  /** Career stages the grant targets, e.g. ["Early Career", "Postdoc"]. */
  targetCareerStages?: string[];
  applicationLink: string;
  grantUrl: string;
  /** Additional key dates (ISO strings) for the application timeline. */
  openingDate?: string;
  loiDeadline?: string;
  decisionDate?: string;
  projectStartDate?: string;
  updatedAt?: string;
  /** When the provider last changed the source page (Firecrawl re-extracted). */
  lastScrapedAt?: string;
  /** When our scraper last visited this URL — bumped on every hash check. */
  lastVerifiedAt?: string;
  fundingAmountMinRaw?: number;
  fundingAmountMaxRaw?: number;
  fundingCurrencyRaw?: string;
  deadlineRaw?: string;
}

export interface DiscoveryResult {
  grants: DiscoveryGrant[];
  source: 'ai' | 'core';
  aiError?: string;
}

interface RecommendationRequest {
  userId?: number;
  userQuery?: string;
  topK?: number;
  useRerank?: boolean;
}

interface RecommendationResponse {
  queryText: string;
  results: RecommendationItem[];
}

interface RecommendationItem {
  grantId: number;
  finalScore: number;
  eligibilityScore: number;
  title?: string;
  fundingAgency?: string;
  reason?: string;
  fields?: Record<string, unknown>;
}

interface CoreGrantResponse {
  id: number;
  grantTitle: string;
  fundingAgency: string;
  description: string;
  objectives?: string;
  fundingScope?: string;
  eligibilityCriteria?: string;
  selectionCriteria?: string;
  grantDuration?: string;
  researchThemes?: string;
  grantType?: string;
  targetCareerStages?: string;
  grantUrl: string;
  applicationDeadline?: string;
  openingDate?: string;
  loiDeadline?: string;
  decisionDate?: string;
  projectStartDate?: string;
  fundingAmountMin?: number;
  fundingAmountMax?: number;
  fundingCurrency?: string;
  field?: string;
  tags?: string[];
  applicationLink?: string;
  updatedAt?: string;
  lastScrapedAt?: string;
  lastVerifiedAt?: string;
}

export async function getDiscoveryGrants(request: RecommendationRequest): Promise<DiscoveryResult> {
  if (request.useRerank !== true) {
    const coreGrants = await fetchCoreGrantList();
    return { grants: coreGrants, source: 'core' };
  }

  let aiError: string | undefined;

  try {
    const aiGrants = await fetchAiRecommendations(request);
    if (aiGrants.length > 0) {
      return { grants: aiGrants, source: 'ai' };
    }
  } catch (error) {
    aiError = error instanceof Error ? error.message : 'Unknown AI recommendation error';
    console.warn('AI recommendation failed, trying CoreBackend grant list fallback.', error);
  }

  const coreGrants = await fetchCoreGrantList();
  return { grants: coreGrants, source: 'core', aiError };
}

async function fetchAiRecommendations(request: RecommendationRequest): Promise<DiscoveryGrant[]> {
  const response = await apiFetch('/api/researchers/me/matches', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userQuery: request.userQuery,
      // Sanitize: JSON.stringify(Infinity) → null, which the backend then
      // treats as missing and falls back to its default (12). The "Show All"
      // UI option sends Infinity; map it to 50 (CoreBackend's maxTopK). The
      // actual returned count is then dictated by the AI service's
      // RERANK_TOP_K env (tune there, not here).
      topK: request.topK == null || !Number.isFinite(request.topK) ? 50 : request.topK,
      useRerank: request.useRerank === true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI recommendation failed: ${response.status} ${response.statusText} ${errorText}`);
  }

  const payload: RecommendationResponse = await response.json();
  return payload.results.map(mapRecommendationToGrant);
}

async function fetchCoreGrantList(): Promise<DiscoveryGrant[]> {
  const response = await apiFetch('/api/grants');

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Core grant list failed: ${response.status} ${response.statusText} ${errorText}`);
  }

  const grants: CoreGrantResponse[] = await response.json();
  return grants.map(mapCoreGrantToDiscoveryGrant);
}

function mapRecommendationToGrant(item: RecommendationItem): DiscoveryGrant {
  const fields = item.fields ?? {};
  const title = item.title ?? asString(fields.grant_title) ?? `Grant #${item.grantId}`;
  const funder = item.fundingAgency ?? asString(fields.funding_agency) ?? 'Unknown Agency';
  const deadlineRaw = asString(fields.application_deadline);
  const amount = formatFunding(
    asNumber(fields.funding_amount_min),
    asNumber(fields.funding_amount_max),
    asString(fields.funding_currency),
  );

  return {
    id: item.grantId,
    title,
    funder,
    matchScore: clampToPercentage(item.finalScore),
    amount,
    deadline: formatDate(deadlineRaw),
    tags: mergeTags(asStringArray(fields.tags), asStringArray(fields.field)),
    eligibility: item.eligibilityScore >= 0.45 ? 'Eligible' : 'Warning',
    rationale: item.reason ?? 'Matched by semantic and keyword relevance to your profile.',
    description: asString(fields.chunk_text) ?? `No detailed description available for ${title}.`,
    objectives: asString(fields.objectives),
    fundingScope: asString(fields.funding_scope),
    eligibilityCriteria: asString(fields.eligibility_criteria),
    selectionCriteria: asString(fields.selection_criteria),
    grantDuration: asString(fields.grant_duration),
    researchThemes: asStringArray(fields.research_themes),
    grantType: asString(fields.grant_type),
    targetCareerStages: asStringArray(fields.target_career_stages),
    applicationLink: asString(fields.application_link) ?? '',
    grantUrl: asString(fields.grant_url) ?? '',
    openingDate: asString(fields.opening_date),
    loiDeadline: asString(fields.loi_deadline),
    decisionDate: asString(fields.decision_date),
    projectStartDate: asString(fields.project_start_date),
    updatedAt: asString(fields.updated_at),
    lastScrapedAt: asString(fields.last_scraped_at),
    lastVerifiedAt: asString(fields.last_verified_at),
    fundingAmountMinRaw: asNumber(fields.funding_amount_min),
    fundingAmountMaxRaw: asNumber(fields.funding_amount_max),
    fundingCurrencyRaw: asString(fields.funding_currency),
    deadlineRaw,
  };
}

function mapCoreGrantToDiscoveryGrant(grant: CoreGrantResponse): DiscoveryGrant {
  return {
    id: grant.id,
    title: grant.grantTitle,
    funder: grant.fundingAgency || 'Unknown Agency',
    matchScore: 50,
    amount: formatFunding(grant.fundingAmountMin, grant.fundingAmountMax, grant.fundingCurrency),
    deadline: formatDate(grant.applicationDeadline),
    tags: mergeTags(grant.tags ?? [], splitTextList(grant.field)),
    eligibility: 'Warning',
    rationale: 'Fallback result from CoreBackend grant list while AI ranking is unavailable.',
    description: grant.description || `No detailed description available for ${grant.grantTitle}.`,
    objectives: grant.objectives,
    fundingScope: grant.fundingScope,
    eligibilityCriteria: grant.eligibilityCriteria,
    selectionCriteria: grant.selectionCriteria,
    grantDuration: grant.grantDuration,
    researchThemes: splitTextList(grant.researchThemes),
    grantType: grant.grantType,
    targetCareerStages: splitTextList(grant.targetCareerStages),
    applicationLink: grant.applicationLink || '',
    grantUrl: grant.grantUrl || '',
    openingDate: grant.openingDate,
    loiDeadline: grant.loiDeadline,
    decisionDate: grant.decisionDate,
    projectStartDate: grant.projectStartDate,
    updatedAt: grant.updatedAt,
    lastScrapedAt: grant.lastScrapedAt,
    lastVerifiedAt: grant.lastVerifiedAt,
    fundingAmountMinRaw: grant.fundingAmountMin,
    fundingAmountMaxRaw: grant.fundingAmountMax,
    fundingCurrencyRaw: grant.fundingCurrency,
    deadlineRaw: grant.applicationDeadline,
  };
}

function clampToPercentage(value: number): number {
  const normalized = Number.isFinite(value) ? value : 0;
  
  // Hybrid search scores can exceed 1.0 (typically 2.0 - 4.0 for good matches)
  // We'll scale relative to a reasonable max score of 4.0
  const maxExpectedScore = 4.0;
  let percentage = 0;
  
  if (normalized > 1) {
    // It's a hybrid score, scale it
    percentage = (normalized / maxExpectedScore) * 100;
  } else {
    // It's a normalized [0,1] score
    percentage = normalized * 100;
  }
  
  // Ensure we don't drop below 0 or exceed 99% (save 100% for exact ID matches if any)
  return Math.max(0, Math.min(99, Math.round(percentage)));
}

function formatDate(value?: string): string {
  if (!value) {
    return 'Deadline not specified';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatFunding(min?: number, max?: number, currency?: string): string {
  return formatFundingRange(min, max, currency);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function splitTextList(value?: string): string[] {
  if (!value) {
    return [];
  }
  return value.split(/[,;/|]/).map((item) => item.trim()).filter((item) => item.length > 0);
}

function mergeTags(...groups: string[][]): string[] {
  const set = new Set<string>();
  groups.flat().forEach((tag) => {
    const cleaned = tag.trim();
    if (cleaned) {
      set.add(cleaned);
    }
  });
  return Array.from(set).slice(0, 6);
}

