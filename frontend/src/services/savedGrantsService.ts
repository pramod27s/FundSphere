/**
 * Frontend client for the persisted saved-grants API on Spring Boot.
 *
 * The list endpoint returns rich entries (grant + personal notes +
 * savedAt/updatedAt). A saved grant is only a bookmark: progress on a grant
 * (preparing, submitted...) lives on its application.
 *
 * The lightweight /ids endpoint still returns a bare number[] so the
 * discovery page can do "is this grant saved?" checks cheaply without
 * fetching the full grant payload of every saved row.
 */
import { apiFetch } from './apiClient';
import type { DiscoveryGrant } from './discoveryService';
import { formatFundingRange } from '../utils/formatFunding';

export interface SavedGrantEntry {
  /** SavedGrant row id (NOT the grant id — that's nested under .grant.id). */
  id: number;
  grant: DiscoveryGrant;
  notes: string | null;
  savedAt: string;
  updatedAt: string;
}

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
  deadlineType?: string;
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

interface SavedGrantApiResponse {
  id: number;
  grant: CoreGrantResponse;
  notes: string | null;
  savedAt: string;
  updatedAt: string;
}

export async function fetchSavedGrants(): Promise<SavedGrantEntry[]> {
  const response = await apiFetch('/api/saved-grants');
  if (!response.ok) {
    throw new Error(`Failed to load saved grants: ${response.status}`);
  }
  const rows: SavedGrantApiResponse[] = await response.json();
  return rows.map(mapRow);
}

export async function fetchSavedGrantIds(): Promise<number[]> {
  const response = await apiFetch('/api/saved-grants/ids');
  if (!response.ok) {
    throw new Error(`Failed to load saved grant ids: ${response.status}`);
  }
  return (await response.json()) as number[];
}

export async function saveGrantOnServer(grantId: number): Promise<SavedGrantEntry> {
  const response = await apiFetch(`/api/saved-grants/${grantId}`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Failed to save grant: ${response.status}`);
  }
  const row: SavedGrantApiResponse = await response.json();
  return mapRow(row);
}

export async function unsaveGrantOnServer(grantId: number): Promise<void> {
  const response = await apiFetch(`/api/saved-grants/${grantId}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`Failed to unsave grant: ${response.status}`);
  }
}

/**
 * Update the notes on an existing saved grant ("" clears them).
 */
export async function updateSavedGrantOnServer(
  grantId: number,
  changes: { notes: string },
): Promise<SavedGrantEntry> {
  const response = await apiFetch(`/api/saved-grants/${grantId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  if (!response.ok) {
    throw new Error(`Failed to update saved grant: ${response.status}`);
  }
  const row: SavedGrantApiResponse = await response.json();
  return mapRow(row);
}

// =============================================================================
// Mapping helpers
// =============================================================================

function mapRow(row: SavedGrantApiResponse): SavedGrantEntry {
  return {
    id: row.id,
    grant: mapCoreGrantToDiscoveryGrant(row.grant),
    notes: row.notes,
    savedAt: row.savedAt,
    updatedAt: row.updatedAt,
  };
}

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
    lastVerifiedAt: grant.lastVerifiedAt,
    fundingAmountMinRaw: grant.fundingAmountMin,
    fundingAmountMaxRaw: grant.fundingAmountMax,
    fundingCurrencyRaw: grant.fundingCurrency,
    deadlineRaw: grant.applicationDeadline,
    deadlineType: grant.deadlineType,
  };
}

function formatDate(value?: string): string {
  if (!value) return 'Deadline not specified';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function formatFunding(min?: number, max?: number, currency?: string): string {
  return formatFundingRange(min, max, currency);
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
