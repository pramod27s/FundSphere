/**
 * Frontend client for the persisted saved-grants API on Spring Boot.
 *
 * The Spring Boot endpoint returns the canonical Grant DTO; we map it
 * to the same DiscoveryGrant shape the rest of the app already uses,
 * so swap-in is invisible to consumers.
 */
import { apiFetch } from './apiClient';
import type { DiscoveryGrant } from './discoveryService';

interface CoreGrantResponse {
  id: number;
  grantTitle: string;
  fundingAgency?: string;
  description?: string;
  objectives?: string;
  fundingScope?: string;
  eligibilityCriteria?: string;
  selectionCriteria?: string;
  grantDuration?: string;
  researchThemes?: string;
  grantUrl?: string;
  applicationDeadline?: string;
  fundingAmountMin?: number;
  fundingAmountMax?: number;
  fundingCurrency?: string;
  field?: string;
  tags?: string[];
  applicationLink?: string;
  updatedAt?: string;
  lastScrapedAt?: string;
}

export async function fetchSavedGrants(): Promise<DiscoveryGrant[]> {
  const response = await apiFetch('/api/saved-grants');
  if (!response.ok) {
    throw new Error(`Failed to load saved grants: ${response.status}`);
  }
  const grants: CoreGrantResponse[] = await response.json();
  return grants.map(mapCoreGrantToDiscoveryGrant);
}

export async function fetchSavedGrantIds(): Promise<number[]> {
  const response = await apiFetch('/api/saved-grants/ids');
  if (!response.ok) {
    throw new Error(`Failed to load saved grant ids: ${response.status}`);
  }
  return (await response.json()) as number[];
}

export async function saveGrantOnServer(grantId: number): Promise<void> {
  const response = await apiFetch(`/api/saved-grants/${grantId}`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Failed to save grant: ${response.status}`);
  }
}

export async function unsaveGrantOnServer(grantId: number): Promise<void> {
  const response = await apiFetch(`/api/saved-grants/${grantId}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`Failed to unsave grant: ${response.status}`);
  }
}

// =============================================================================
// Mapping helpers (kept here to avoid a circular import with discoveryService)
// =============================================================================

function mapCoreGrantToDiscoveryGrant(grant: CoreGrantResponse): DiscoveryGrant {
  return {
    id: grant.id,
    title: grant.grantTitle,
    funder: grant.fundingAgency || 'Unknown Agency',
    matchScore: 0,
    amount: formatFunding(grant.fundingAmountMin, grant.fundingAmountMax, grant.fundingCurrency),
    deadline: formatDate(grant.applicationDeadline),
    tags: mergeTags(grant.tags ?? [], splitTextList(grant.field)),
    eligibility: 'Warning',
    rationale: 'Saved grant.',
    description: grant.description || `No detailed description available for ${grant.grantTitle}.`,
    objectives: grant.objectives,
    fundingScope: grant.fundingScope,
    eligibilityCriteria: grant.eligibilityCriteria,
    selectionCriteria: grant.selectionCriteria,
    grantDuration: grant.grantDuration,
    researchThemes: splitTextList(grant.researchThemes),
    applicationLink: grant.applicationLink || '',
    grantUrl: grant.grantUrl || '',
    updatedAt: grant.updatedAt,
    lastScrapedAt: grant.lastScrapedAt,
    fundingAmountMinRaw: grant.fundingAmountMin,
    fundingAmountMaxRaw: grant.fundingAmountMax,
    fundingCurrencyRaw: grant.fundingCurrency,
    deadlineRaw: grant.applicationDeadline,
  };
}

function formatDate(value?: string): string {
  if (!value) return 'Deadline not specified';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function formatFunding(min?: number, max?: number, currency?: string): string {
  const code = normalizeCurrencyCode(currency);
  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
  });
  if (typeof min === 'number' && typeof max === 'number') {
    return `${formatter.format(min)} - ${formatter.format(max)}`;
  }
  if (typeof min === 'number') return `From ${formatter.format(min)}`;
  if (typeof max === 'number') return `Up to ${formatter.format(max)}`;
  return 'Funding amount not specified';
}

function normalizeCurrencyCode(raw?: string): string {
  if (!raw || !raw.trim()) return 'USD';
  const value = raw.trim().toUpperCase();
  if (['RS', 'INR', 'RUPEE', 'RUPEES', '₹'].includes(value)) return 'INR';
  if (['$', 'US$', 'DOLLAR', 'DOLLARS'].includes(value)) return 'USD';
  return /^[A-Z]{3}$/.test(value) ? value : 'USD';
}

function splitTextList(value?: string): string[] {
  if (!value) return [];
  return value.split(/[,;/|]/).map((s) => s.trim()).filter(Boolean);
}

function mergeTags(...groups: string[][]): string[] {
  const set = new Set<string>();
  groups.flat().forEach((tag) => {
    const cleaned = tag.trim();
    if (cleaned) set.add(cleaned);
  });
  return Array.from(set).slice(0, 6);
}
