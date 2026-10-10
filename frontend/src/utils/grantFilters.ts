/**
 * Discovery filters: the sidebar's options and the rules behind them.
 *
 * The browse list is filtered on the server (GrantFilter.java), which is
 * sent each option's key. AI results arrive as one list and are filtered
 * here by applyFilters with the same rules, so both lists behave the same.
 * Keep the two in step.
 */
import type { DiscoveryGrant } from '../services/discoveryService';

/** The sidebar's selections, by option label. */
export interface FilterState {
  grantTypes: string[];
  applicantTypes: string[];
  fundingRanges: string[];
  deadlineRanges: string[];
  funders: string[];
}

export const EMPTY_FILTERS: FilterState = {
  grantTypes: [],
  applicantTypes: [],
  fundingRanges: [],
  deadlineRanges: [],
  funders: [],
};

interface KeywordOption {
  label: string;
  key: string;
  pattern: RegExp;
}

interface RangeOption {
  label: string;
  key: string;
}

/** Matched in the title, description, grant type and tags (which include the grant's field). */
export const GRANT_TYPE_OPTIONS: KeywordOption[] = [
  { label: 'Research Projects', key: 'RESEARCH', pattern: /research|project/i },
  { label: 'Fellowships', key: 'FELLOWSHIP', pattern: /fellowship/i },
  { label: 'Travel Grants', key: 'TRAVEL', pattern: /travel/i },
  { label: 'Equipment / Lab', key: 'EQUIPMENT', pattern: /equipment|instrument|apparatus|\blab(s|oratory|oratories)?\b/i },
];

/** Matched in the eligibility text, description, career stages and tags (which include the grant's field). */
export const APPLICANT_TYPE_OPTIONS: KeywordOption[] = [
  { label: 'Early Career', key: 'EARLY_CAREER', pattern: /early.?career|early.?stage|postdoc|young (researcher|scientist|investigator)|junior/i },
  { label: 'Students (PhD/MSc)', key: 'STUDENT', pattern: /ph\.?d|m\.?sc|student|doctoral|graduate/i },
  { label: 'Senior Researchers', key: 'SENIOR', pattern: /senior|faculty|professor|principal investigator|\bpi\b/i },
  { label: 'Startups / Industry', key: 'INDUSTRY', pattern: /start.?ups?|industry|industrial|compan(y|ies)|\bsmes?\b|msmes?|enterprise|commercial/i },
];

/** The larger amount in rupees; grants with no amount or an unknown currency don't match. */
export const FUNDING_RANGE_OPTIONS: RangeOption[] = [
  { label: '< ₹5 Lakh', key: 'UNDER_5_LAKH' },
  { label: '₹5L - ₹25L', key: 'FROM_5_TO_25_LAKH' },
  { label: '₹25L - ₹1 Cr', key: 'FROM_25_LAKH_TO_1_CRORE' },
  { label: '> ₹1 Cr', key: 'OVER_1_CRORE' },
];

/** Time left until the deadline; grants with no deadline don't match. */
export const DEADLINE_RANGE_OPTIONS: RangeOption[] = [
  { label: 'Closing in < 30 days', key: 'WITHIN_30_DAYS' },
  { label: 'Closing in 1-3 months', key: 'IN_1_TO_3_MONTHS' },
  { label: 'Closing in > 3 months', key: 'AFTER_3_MONTHS' },
];

const INR_RATE: Record<string, number> = { INR: 1, USD: 83, EUR: 90, GBP: 105, AUD: 55, CAD: 62 };
const DAY_MS = 86_400_000;

export function countActiveFilters(f: FilterState): number {
  return f.grantTypes.length + f.applicantTypes.length + f.fundingRanges.length + f.deadlineRanges.length + f.funders.length;
}

/** The grant's larger (or only) amount in rupees, or null when unknown. */
export function grantInrAmount(g: DiscoveryGrant): number | null {
  const amount = g.fundingAmountMaxRaw ?? g.fundingAmountMinRaw;
  const rate = INR_RATE[(g.fundingCurrencyRaw ?? '').toUpperCase()];
  return typeof amount === 'number' && rate ? amount * rate : null;
}

/** Same rule as the deadline label: closed once the deadline has passed. */
export function isClosed(g: DiscoveryGrant, now: number = Date.now()): boolean {
  if (!g.deadlineRaw) return false;
  const t = new Date(g.deadlineRaw).getTime();
  return !Number.isNaN(t) && t < now;
}

/** Query parameters for the server-side browse list (GET /api/grants). */
export function filterParams(f: FilterState, includeClosed: boolean): [string, string][] {
  const params: [string, string][] = [['includeClosed', String(includeClosed)]];
  f.funders.forEach((funder) => params.push(['funder', funder]));
  keysOf(GRANT_TYPE_OPTIONS, f.grantTypes).forEach((key) => params.push(['grantType', key]));
  keysOf(APPLICANT_TYPE_OPTIONS, f.applicantTypes).forEach((key) => params.push(['applicantType', key]));
  keysOf(FUNDING_RANGE_OPTIONS, f.fundingRanges).forEach((key) => params.push(['fundingRange', key]));
  keysOf(DEADLINE_RANGE_OPTIONS, f.deadlineRanges).forEach((key) => params.push(['deadlineRange', key]));
  return params;
}

/** Filters a list of AI results with the server's rules. */
export function applyFilters(grants: DiscoveryGrant[], f: FilterState, includeClosed: boolean): DiscoveryGrant[] {
  const now = Date.now();
  const grantTypes = GRANT_TYPE_OPTIONS.filter((o) => f.grantTypes.includes(o.label));
  const applicantTypes = APPLICANT_TYPE_OPTIONS.filter((o) => f.applicantTypes.includes(o.label));
  const fundingRanges = keysOf(FUNDING_RANGE_OPTIONS, f.fundingRanges);
  const deadlineRanges = keysOf(DEADLINE_RANGE_OPTIONS, f.deadlineRanges);

  return grants.filter((g) => {
    if (!includeClosed && isClosed(g, now)) return false;
    if (f.funders.length > 0 && !f.funders.includes(g.funder)) return false;

    const tags = g.searchTags ?? g.tags;
    if (grantTypes.length > 0 && !matchesAny(grantTypes, [g.title, g.description, g.grantType, ...tags])) {
      return false;
    }
    if (applicantTypes.length > 0
      && !matchesAny(applicantTypes, [g.eligibilityCriteria, g.description, ...(g.targetCareerStages ?? []), ...tags])) {
      return false;
    }

    if (fundingRanges.length > 0) {
      const inr = grantInrAmount(g);
      if (inr === null || !fundingRanges.some((key) => inFundingRange(key, inr))) return false;
    }

    if (deadlineRanges.length > 0) {
      const t = g.deadlineRaw ? new Date(g.deadlineRaw).getTime() : NaN;
      if (Number.isNaN(t)) return false;
      const daysLeft = (t - now) / DAY_MS;
      if (!deadlineRanges.some((key) => inDeadlineRange(key, daysLeft))) return false;
    }

    return true;
  });
}

function keysOf(options: RangeOption[], labels: string[]): string[] {
  return options.filter((o) => labels.includes(o.label)).map((o) => o.key);
}

function matchesAny(options: KeywordOption[], texts: (string | undefined)[]): boolean {
  return options.some((o) => texts.some((text) => text && o.pattern.test(text)));
}

function inFundingRange(key: string, inr: number): boolean {
  switch (key) {
    case 'UNDER_5_LAKH': return inr < 500_000;
    case 'FROM_5_TO_25_LAKH': return inr >= 500_000 && inr <= 2_500_000;
    case 'FROM_25_LAKH_TO_1_CRORE': return inr > 2_500_000 && inr <= 10_000_000;
    case 'OVER_1_CRORE': return inr > 10_000_000;
    default: return false;
  }
}

function inDeadlineRange(key: string, daysLeft: number): boolean {
  switch (key) {
    case 'WITHIN_30_DAYS': return daysLeft >= 0 && daysLeft < 30;
    case 'IN_1_TO_3_MONTHS': return daysLeft >= 30 && daysLeft <= 90;
    case 'AFTER_3_MONTHS': return daysLeft > 90;
    default: return false;
  }
}
