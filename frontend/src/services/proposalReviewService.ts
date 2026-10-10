/**
 * Proposal Assistant (v2) client. Reviews run in the background on the
 * server: starting one returns at once with status RUNNING, and
 * `waitForReview` polls until it finishes.
 */
import { apiFetch } from './apiClient';

export type ReviewLevel = 'INSTANT' | 'FULL';
export type ReviewStatus = 'RUNNING' | 'DONE' | 'PARTIAL' | 'FAILED';
export type Verdict = 'pass' | 'partial' | 'fail' | 'manual' | 'not_evaluated';
export type Severity = 'critical' | 'important' | 'minor';

export interface RuleResult {
  id: string;
  text: string;
  severity: Severity;
  kind: string;
  checked_by: 'code' | 'ai';
  verdict: Verdict;
  evidence: string;
  section: string | null;
  source_quote: string;
  source_page: number | null;
}

export interface CriterionResult {
  id: string;
  name: string;
  marks: number | null;
  is_default: boolean;
  score: number | null;
  reason: string;
  fix: string;
}

export interface ConsistencyIssue {
  issue: string;
  sections_involved: string[];
  severity: Severity;
  suggestion: string;
  found_by: 'code' | 'ai';
}

export interface ReviewSection {
  key: string;
  canonical: string | null;
  title: string;
  page_start: number;
  page_end: number;
  words: number;
}

export interface SectionNote {
  key: string;
  summary: string;
  strength: string;
  improvement: string;
}

export interface ReviewResult {
  level: 'instant' | 'full';
  status: 'complete' | 'partial';
  document: {
    page_count: number;
    words: number;
    paper: string | null;
    line_spacing: number | null;
    font: { family: string | null; size: number | null };
    sections: ReviewSection[];
  };
  rules: RuleResult[];
  criteria: CriterionResult[];
  consistency_issues: ConsistencyIssue[];
  section_notes: SectionNote[];
  summary: string;
  top_fixes: string[];
  not_evaluated: string[];
  reused: Record<string, boolean>;
  usage: { calls?: number; input_tokens?: number; output_tokens?: number };
}

export interface ProposalReview {
  id: number;
  applicationId: number | null;
  versionNo: number;
  proposalFileName: string | null;
  guidelinesFileName: string | null;
  grantTitle: string | null;
  level: ReviewLevel;
  status: ReviewStatus;
  stage: 'READING_GUIDELINES' | 'REVIEWING' | null;
  errorMessage: string | null;
  overallScore: number | null;
  qualityScore: number | null;
  rulesMet: number | null;
  rulesTotal: number | null;
  criticalFailed: number | null;
  scoreCapped: boolean | null;
  aiCalls: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
  completedAt: string | null;
  /** Only on GET /api/proposal-reviews/{id}. */
  result: ReviewResult | null;
}

export async function reviewDraftForApplication(applicationId: number, proposalPdf: File, level: ReviewLevel): Promise<ProposalReview> {
  const form = new FormData();
  form.append('proposalPdf', proposalPdf);
  form.append('level', level.toLowerCase());
  const response = await apiFetch(`/api/applications/${applicationId}/proposal-reviews`, { method: 'POST', body: form });
  await ensureOk(response, 'Could not start the review');
  return (await response.json()) as ProposalReview;
}

export async function fetchApplicationReviews(applicationId: number): Promise<ProposalReview[]> {
  const response = await apiFetch(`/api/applications/${applicationId}/proposal-reviews`);
  await ensureOk(response, 'Could not load the reviews');
  return (await response.json()) as ProposalReview[];
}

/** Every application's reviews in one call (newest version first), for the Proposals overview. */
export async function fetchAllApplicationReviews(): Promise<ProposalReview[]> {
  const response = await apiFetch('/api/applications/proposal-reviews');
  await ensureOk(response, 'Could not load the reviews');
  return (await response.json()) as ProposalReview[];
}

export async function reviewStandalone(
  proposalPdf: File,
  guidelinesPdf: File,
  options: { grantTitle?: string; level: ReviewLevel },
): Promise<ProposalReview> {
  const form = new FormData();
  form.append('proposalPdf', proposalPdf);
  form.append('guidelinesPdf', guidelinesPdf);
  form.append('grantTitle', options.grantTitle ?? '');
  form.append('level', options.level.toLowerCase());
  const response = await apiFetch('/api/proposal-reviews', { method: 'POST', body: form });
  await ensureOk(response, 'Could not start the review');
  return (await response.json()) as ProposalReview;
}

export async function fetchStandaloneReviews(): Promise<ProposalReview[]> {
  const response = await apiFetch('/api/proposal-reviews');
  await ensureOk(response, 'Could not load your reviews');
  return (await response.json()) as ProposalReview[];
}

export async function fetchReview(reviewId: number): Promise<ProposalReview> {
  const response = await apiFetch(`/api/proposal-reviews/${reviewId}`);
  await ensureOk(response, 'Could not load the review');
  return (await response.json()) as ProposalReview;
}

/** Upgrade an Instant check to a Full review, or retry a partial or failed one. */
export async function runFullReview(reviewId: number): Promise<ProposalReview> {
  const response = await apiFetch(`/api/proposal-reviews/${reviewId}/full`, { method: 'POST' });
  await ensureOk(response, 'Could not start the AI review');
  return (await response.json()) as ProposalReview;
}

export async function deleteReview(reviewId: number): Promise<void> {
  const response = await apiFetch(`/api/proposal-reviews/${reviewId}`, { method: 'DELETE' });
  await ensureOk(response, 'Could not delete the review');
}

/**
 * Polls until the review is no longer RUNNING. `onUpdate` sees every poll so
 * the page can show the current stage. Stops when `signal` is aborted.
 */
export async function waitForReview(
  reviewId: number,
  onUpdate: (review: ProposalReview) => void,
  signal: AbortSignal,
  intervalMs = 2000,
): Promise<ProposalReview | null> {
  while (!signal.aborted) {
    const review = await fetchReview(reviewId);
    if (signal.aborted) return null;
    onUpdate(review);
    if (review.status !== 'RUNNING') return review;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

async function ensureOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  let message = `${fallback} (${response.status})`;
  try {
    const payload = (await response.clone().json()) as { message?: string; detail?: string; error?: string };
    const detail = payload.message ?? payload.detail ?? payload.error;
    if (detail) message = detail;
  } catch {
    // not JSON — keep the fallback
  }
  throw new Error(message);
}
