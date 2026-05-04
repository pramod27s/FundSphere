import { apiFetch } from './apiClient';

export type SectionStatus = 'strong' | 'weak' | 'missing';
export type CitationVerdict = 'pass' | 'partial' | 'fail';
export type Severity = 'critical' | 'important' | 'minor';

export interface Citation {
  requirement: string;
  proposal_excerpt: string;
  verdict: CitationVerdict;
  severity: Severity;
}

export interface SectionFeedback {
  section_name: string;
  status: SectionStatus;
  score: number;
  feedback: string;
  suggestions: string[];
  citations?: Citation[];
}

export interface ConsistencyIssue {
  issue: string;
  sections_involved: string[];
  severity: Severity;
  suggestion: string;
}

export interface ProposalAnalysis {
  overall_score: number;
  summary: string;
  section_feedback: SectionFeedback[];
  missing_sections: string[];
  key_suggestions: string[];
  consistency_issues?: ConsistencyIssue[];
  mode: 'simple' | 'deep';
  grant_title: string;
}

export type AnalysisMode = 'simple' | 'deep';

export async function analyzeProposal(
  proposalPdf: File,
  guidelinesPdf: File,
  options: { grantTitle?: string; mode?: AnalysisMode } = {},
): Promise<ProposalAnalysis> {
  const form = new FormData();
  form.append('proposalPdf', proposalPdf);
  form.append('guidelinesPdf', guidelinesPdf);
  form.append('grantTitle', options.grantTitle ?? '');
  form.append('mode', options.mode ?? 'simple');

  const response = await apiFetch('/api/proposal/analyze', {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    let message = `Proposal analysis failed (${response.status})`;
    try {
      const payload = await response.clone().json();
      if (payload && typeof payload === 'object') {
        const detail = (payload as { error?: string; detail?: string; message?: string }).error
          ?? (payload as { detail?: string }).detail
          ?? (payload as { message?: string }).message;
        if (detail) {
          message = detail;
        }
      }
    } catch {
      try {
        const text = await response.text();
        if (text) message = text;
      } catch {
        // swallow
      }
    }
    throw new Error(message);
  }

  return (await response.json()) as ProposalAnalysis;
}

// =============================================================================
// Export / diff helpers
// =============================================================================

export function formatAnalysisAsMarkdown(analysis: ProposalAnalysis): string {
  const lines: string[] = [];
  const title = analysis.grant_title?.trim()
    ? `Proposal Compliance Report — ${analysis.grant_title.trim()}`
    : 'Proposal Compliance Report';

  lines.push(`# ${title}`, '');
  lines.push(
    `**Overall score:** ${analysis.overall_score} / 100  `,
    `**Mode:** ${analysis.mode === 'deep' ? 'Deep section-by-section' : 'Quick'}  `,
    `**Generated:** ${new Date().toLocaleString()}`,
    '',
    '## Summary',
    '',
    analysis.summary || '_No summary available._',
    '',
  );

  if (analysis.missing_sections.length > 0) {
    lines.push('## Missing required sections', '');
    analysis.missing_sections.forEach((s) => lines.push(`- ${s}`));
    lines.push('');
  }

  if (analysis.key_suggestions.length > 0) {
    lines.push('## Top recommendations', '');
    analysis.key_suggestions.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push('');
  }

  if (analysis.consistency_issues && analysis.consistency_issues.length > 0) {
    lines.push('## Cross-section consistency issues', '');
    analysis.consistency_issues.forEach((ci) => {
      const sev = ci.severity.toUpperCase();
      const sections = ci.sections_involved.length
        ? ` _(${ci.sections_involved.join(', ')})_`
        : '';
      lines.push(`- **[${sev}]** ${ci.issue}${sections}`);
      if (ci.suggestion) lines.push(`  - Fix: ${ci.suggestion}`);
    });
    lines.push('');
  }

  if (analysis.section_feedback.length > 0) {
    lines.push('## Section-by-section feedback', '');
    analysis.section_feedback.forEach((fb) => {
      const badge = fb.status === 'strong' ? '[STRONG]' : fb.status === 'weak' ? '[WEAK]' : '[MISSING]';
      lines.push(`### ${badge} ${fb.section_name} — ${fb.score} / 100`, '');
      lines.push(fb.feedback || '_No feedback._', '');
      if (fb.suggestions.length > 0) {
        lines.push('**Suggested improvements:**');
        fb.suggestions.forEach((s) => lines.push(`- ${s}`));
        lines.push('');
      }
      if (fb.citations && fb.citations.length > 0) {
        lines.push('**Compliance checklist:**');
        fb.citations.forEach((c) => {
          const mark = c.verdict === 'pass' ? '[PASS]' : c.verdict === 'partial' ? '[PARTIAL]' : '[FAIL]';
          const sev = c.severity.toUpperCase();
          lines.push(`- ${mark} _(${sev})_ ${c.requirement}`);
          if (c.proposal_excerpt) lines.push(`  - Evidence: ${c.proposal_excerpt}`);
        });
        lines.push('');
      }
    });
  }

  return lines.join('\n');
}

export function downloadAnalysisAsMarkdown(analysis: ProposalAnalysis): void {
  const md = formatAnalysisAsMarkdown(analysis);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = buildExportFilename(analysis, 'md');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildExportFilename(analysis: ProposalAnalysis, ext: string): string {
  const slug = (analysis.grant_title || 'proposal-report')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'proposal-report';
  const stamp = new Date().toISOString().slice(0, 10);
  return `${slug}-${stamp}.${ext}`;
}

// ----------------------------------------------------------------------------
// Diff between two analyses (revision compare)
// ----------------------------------------------------------------------------

export type SectionTransition =
  | 'improved'
  | 'regressed'
  | 'unchanged'
  | 'newly_added'
  | 'newly_missing';

export interface SectionDiff {
  section_name: string;
  previousStatus: SectionStatus | null;
  currentStatus: SectionStatus | null;
  previousScore: number | null;
  currentScore: number | null;
  scoreDelta: number;
  transition: SectionTransition;
}

export interface AnalysisDiff {
  scoreDelta: number;
  previousScore: number;
  currentScore: number;
  sections: SectionDiff[];
  resolvedMissing: string[];
  newlyMissing: string[];
}

export function diffAnalyses(prev: ProposalAnalysis, curr: ProposalAnalysis): AnalysisDiff {
  const prevByName = new Map(
    prev.section_feedback.map((fb) => [fb.section_name.toLowerCase(), fb]),
  );
  const currByName = new Map(
    curr.section_feedback.map((fb) => [fb.section_name.toLowerCase(), fb]),
  );

  const allKeys = new Set<string>([...prevByName.keys(), ...currByName.keys()]);
  const sections: SectionDiff[] = [];

  for (const key of allKeys) {
    const p = prevByName.get(key) ?? null;
    const c = currByName.get(key) ?? null;

    const prevScore = p ? p.score : null;
    const currScore = c ? c.score : null;
    const scoreDelta = (currScore ?? 0) - (prevScore ?? 0);

    let transition: SectionTransition;
    if (!p && c) transition = 'newly_added';
    else if (p && !c) transition = 'newly_missing';
    else if (p && c) {
      if (c.status !== p.status) {
        transition = statusRank(c.status) > statusRank(p.status) ? 'improved' : 'regressed';
      } else if (scoreDelta > 4) transition = 'improved';
      else if (scoreDelta < -4) transition = 'regressed';
      else transition = 'unchanged';
    } else {
      transition = 'unchanged';
    }

    sections.push({
      section_name: (c ?? p)!.section_name,
      previousStatus: p ? p.status : null,
      currentStatus: c ? c.status : null,
      previousScore: prevScore,
      currentScore: currScore,
      scoreDelta,
      transition,
    });
  }

  // Sort: improved/regressed first, then by absolute delta.
  sections.sort((a, b) => {
    const order: Record<SectionTransition, number> = {
      regressed: 0,
      improved: 1,
      newly_missing: 2,
      newly_added: 3,
      unchanged: 4,
    };
    const o = order[a.transition] - order[b.transition];
    if (o !== 0) return o;
    return Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta);
  });

  const prevMissing = new Set(prev.missing_sections.map((s) => s.toLowerCase()));
  const currMissing = new Set(curr.missing_sections.map((s) => s.toLowerCase()));
  const resolvedMissing = [...prevMissing]
    .filter((s) => !currMissing.has(s))
    .map((lower) => prev.missing_sections.find((s) => s.toLowerCase() === lower) || lower);
  const newlyMissing = [...currMissing]
    .filter((s) => !prevMissing.has(s))
    .map((lower) => curr.missing_sections.find((s) => s.toLowerCase() === lower) || lower);

  return {
    scoreDelta: curr.overall_score - prev.overall_score,
    previousScore: prev.overall_score,
    currentScore: curr.overall_score,
    sections,
    resolvedMissing,
    newlyMissing,
  };
}

function statusRank(status: SectionStatus): number {
  if (status === 'strong') return 2;
  if (status === 'weak') return 1;
  return 0;
}
