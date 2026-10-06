import { useState, type ReactNode } from 'react';
import {
  AlertOctagon,
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  Code2,
  Eye,
  FileText,
  ListChecks,
  Loader2,
  Sparkles,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import type { ProposalReview, ReviewResult, RuleResult, Severity } from '../../services/proposalReviewService';

interface ReviewReportProps {
  review: ProposalReview;
  /** The previous finished review of the same application, to show what changed. */
  previous?: ProposalReview | null;
  onRunFull?: () => void;
  runningFull?: boolean;
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, important: 1, minor: 2 };
const SECTION_LABELS: Record<string, string> = {
  title: 'Title', abstract: 'Abstract', introduction: 'Introduction', objectives: 'Objectives',
  methodology: 'Methodology', work_plan: 'Work plan', expected_outcomes: 'Expected outcomes',
  budget: 'Budget', team: 'Investigators', references: 'References',
};

/** The full report for one review: score, problems, criteria, notes. */
export default function ReviewReport({ review, previous, onRunFull, runningFull }: ReviewReportProps) {
  const result = review.result;
  if (!result) return null;

  const rules = result.rules;
  const problems = rules
    .filter((r) => r.verdict === 'fail' || r.verdict === 'partial')
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.verdict === 'fail' ? -1 : 1));
  const manual = rules.filter((r) => r.verdict === 'manual');
  const passed = rules.filter((r) => r.verdict === 'pass');
  const notEvaluated = rules.filter((r) => r.verdict === 'not_evaluated');
  const verifiedCritical = rules.filter((r) => r.severity === 'critical' && r.verdict === 'fail' && r.checked_by === 'code');
  const outOfScope = rules.some((r) => r.kind === 'scope' && r.verdict === 'fail');
  const isInstant = result.level === 'instant';

  return (
    <div className="flex flex-col gap-5">
      <ScoreHeader review={review} result={result} previous={previous} verifiedCritical={verifiedCritical.length} outOfScope={outOfScope} />

      {result.not_evaluated.length > 0 && (
        <Callout tone="amber" icon={<TriangleAlert className="w-4 h-4" />}>
          <ul className="flex flex-col gap-1">
            {result.not_evaluated.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </Callout>
      )}

      {isInstant && onRunFull && (
        <div className="rounded-xl border border-primary-200 bg-primary-50/60 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 text-sm text-primary-900">
            <p className="font-semibold">This was the Instant check: the rules code can measure.</p>
            <p className="text-primary-800/80 mt-0.5">
              Run the AI review for the quality score (marked like the committee), the judgement rules and contradictions between sections.
            </p>
          </div>
          <button
            type="button"
            onClick={onRunFull}
            disabled={runningFull}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 shadow-xs shrink-0"
          >
            {runningFull ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Review with AI
          </button>
        </div>
      )}

      {(result.summary || result.top_fixes.length > 0) && (
        <section className="bg-white border border-brand-200 rounded-xl p-5">
          {result.summary && <p className="text-sm text-brand-800 leading-relaxed">{result.summary}</p>}
          {result.top_fixes.length > 0 && (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-500 mt-4 mb-2">Fix these first</h3>
              <ol className="flex flex-col gap-1.5 list-decimal pl-5 text-sm text-brand-800">
                {result.top_fixes.map((f) => <li key={f}>{f}</li>)}
              </ol>
            </>
          )}
        </section>
      )}

      <Panel title="Problems to fix" count={problems.length} icon={<CircleAlert className="w-4 h-4 text-red-600" />} defaultOpen>
        {problems.length === 0 ? (
          <Empty>No rule problems found.</Empty>
        ) : (
          <ul className="divide-y divide-brand-100">{problems.map((r) => <RuleRow key={r.id} rule={r} />)}</ul>
        )}
      </Panel>

      {result.consistency_issues.length > 0 && (
        <Panel title="Contradictions between sections" count={result.consistency_issues.length} icon={<AlertOctagon className="w-4 h-4 text-amber-600" />} defaultOpen>
          <ul className="divide-y divide-brand-100">
            {result.consistency_issues.map((issue) => (
              <li key={issue.issue} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  <SeverityBadge severity={issue.severity} />
                  <CheckedBy by={issue.found_by} />
                  {issue.sections_involved.map((s) => (
                    <span key={s} className="text-[11px] px-1.5 py-0.5 rounded bg-brand-100 text-brand-600">{SECTION_LABELS[s] ?? s}</span>
                  ))}
                </div>
                <p className="text-sm text-brand-900">{issue.issue}</p>
                {issue.suggestion && <p className="text-xs text-brand-600 mt-1">Fix: {issue.suggestion}</p>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {!isInstant && result.criteria.length > 0 && (
        <Panel title="Marking criteria" icon={<ListChecks className="w-4 h-4 text-primary-600" />} defaultOpen>
          {result.criteria.some((c) => c.is_default) && (
            <p className="px-4 pt-3 text-xs text-brand-500">The guidelines don't say how proposals are marked, so standard criteria were used.</p>
          )}
          <ul className="divide-y divide-brand-100">
            {result.criteria.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-brand-900">
                    {c.name}
                    {c.marks ? <span className="font-normal text-brand-500"> · {c.marks} marks</span> : null}
                  </span>
                  <ScoreDots score={c.score} />
                </div>
                {c.reason && <p className="text-xs text-brand-600 mt-1">{c.reason}</p>}
                {c.fix && <p className="text-xs text-primary-800 mt-1">Improve: {c.fix}</p>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {manual.length > 0 && (
        <Panel title="Check these yourself" count={manual.length} icon={<Eye className="w-4 h-4 text-brand-500" />}>
          <p className="px-4 pt-3 text-xs text-brand-500">These can't be judged from the PDF's text (for example margins). They're not counted in the score.</p>
          <ul className="divide-y divide-brand-100">{manual.map((r) => <RuleRow key={r.id} rule={r} />)}</ul>
        </Panel>
      )}

      {notEvaluated.length > 0 && (
        <Panel title="Not evaluated" count={notEvaluated.length} icon={<CircleHelp className="w-4 h-4 text-brand-500" />}>
          <ul className="divide-y divide-brand-100">{notEvaluated.map((r) => <RuleRow key={r.id} rule={r} />)}</ul>
        </Panel>
      )}

      <Panel title="Rules met" count={passed.length} icon={<CheckCircle2 className="w-4 h-4 text-primary-600" />}>
        <ul className="divide-y divide-brand-100">{passed.map((r) => <RuleRow key={r.id} rule={r} />)}</ul>
      </Panel>

      <Panel title="Sections" count={result.document.sections.length} icon={<FileText className="w-4 h-4 text-brand-500" />}>
        <ul className="divide-y divide-brand-100">
          {result.document.sections.map((s) => {
            const note = result.section_notes.find((n) => n.key === s.key);
            return (
              <li key={s.key} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-brand-900">{s.title}</span>
                  <span className="text-[11px] text-brand-500 tabular-nums shrink-0">
                    p. {s.page_start === s.page_end ? s.page_start : `${s.page_start}–${s.page_end}`} · {s.words} words
                  </span>
                </div>
                {note?.strength && <p className="text-xs text-brand-600 mt-1">Strength: {note.strength}</p>}
                {note?.improvement && <p className="text-xs text-primary-800 mt-0.5">Improve: {note.improvement}</p>}
              </li>
            );
          })}
        </ul>
      </Panel>

      <UsageFooter review={review} result={result} />
    </div>
  );
}

function ScoreHeader({ review, result, previous, verifiedCritical, outOfScope }: {
  review: ProposalReview; result: ReviewResult; previous?: ProposalReview | null; verifiedCritical: number; outOfScope: boolean;
}) {
  const score = review.overallScore;
  const tone = score === null ? 'text-brand-500' : score >= 75 ? 'text-primary-700' : score >= 50 ? 'text-amber-700' : 'text-red-700';
  const delta = previous && previous.overallScore !== null && score !== null ? score - previous.overallScore : null;
  const changes = previous?.result ? ruleChanges(previous.result.rules, result.rules) : null;
  const { document } = result;

  return (
    <section className="bg-white border border-brand-200 rounded-xl p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex items-baseline gap-2 shrink-0">
          {score !== null ? (
            <>
              <span className={`text-5xl font-bold tabular-nums ${tone}`}>{score}</span>
              <span className="text-sm text-brand-500">/ 100</span>
            </>
          ) : (
            // Instant check: no quality score yet, so lead with the rule count.
            <>
              <span className="text-5xl font-bold tabular-nums text-brand-800">{review.rulesMet ?? 0}</span>
              <span className="text-sm text-brand-500">/ {review.rulesTotal ?? 0} rules</span>
            </>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-brand-900">
            {score === null
              ? 'Rules met. The quality score comes with the AI review.'
              : `${review.rulesMet ?? 0} of ${review.rulesTotal ?? 0} rules met`}
            {review.qualityScore !== null && review.scoreCapped && (
              <span className="font-normal text-brand-600"> · quality alone {review.qualityScore}</span>
            )}
          </p>
          <p className="text-xs text-brand-500">
            {result.level === 'instant' ? 'Instant check' : 'Full AI review'} · {review.proposalFileName ?? 'draft'} · {document.page_count} pages,{' '}
            {document.words} words{document.font.family ? `, ${document.font.family} ${document.font.size} pt` : ''}{document.paper ? `, ${document.paper}` : ''}
          </p>
          {delta !== null && (
            <p className="text-xs font-semibold text-brand-700">
              <span className={delta > 0 ? 'text-primary-700' : delta < 0 ? 'text-red-700' : ''}>
                {delta > 0 ? '+' : ''}{delta}
              </span>{' '}
              since version {previous!.versionNo}
              {changes && (changes.fixed > 0 || changes.newProblems > 0) && (
                <span className="font-normal text-brand-600"> · {changes.fixed} fixed, {changes.newProblems} new</span>
              )}
            </p>
          )}
        </div>
      </div>

      {outOfScope ? (
        <Callout tone="red" icon={<XCircle className="w-4 h-4" />} className="mt-4">
          <strong>Outside this call's scope.</strong> The project doesn't fit what the call funds, so the score is capped at 20.
        </Callout>
      ) : verifiedCritical > 0 ? (
        <Callout tone="red" icon={<XCircle className="w-4 h-4" />} className="mt-4">
          <strong>Likely to be returned:</strong> {verifiedCritical} {verifiedCritical === 1 ? 'rule that causes' : 'rules that cause'} rejection{' '}
          {verifiedCritical === 1 ? "isn't" : "aren't"} met.{review.scoreCapped ? ' The score is capped at 49 until they are fixed.' : ''}
        </Callout>
      ) : null}
    </section>
  );
}

function RuleRow({ rule }: { rule: RuleResult }) {
  const [open, setOpen] = useState(false);
  const icon = rule.verdict === 'pass' ? <CheckCircle2 className="w-4 h-4 text-primary-600" />
    : rule.verdict === 'fail' ? <XCircle className="w-4 h-4 text-red-600" />
      : rule.verdict === 'partial' ? <CircleAlert className="w-4 h-4 text-amber-600" />
        : <CircleHelp className="w-4 h-4 text-brand-400" />;
  return (
    <li className="px-4 py-3 flex gap-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm text-brand-900 mr-1">{rule.text}</p>
          {rule.verdict !== 'pass' && <SeverityBadge severity={rule.severity} />}
          <CheckedBy by={rule.checked_by} />
        </div>
        {rule.evidence && <p className="text-xs text-brand-600 mt-1">{rule.evidence}</p>}
        {rule.source_quote && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary-700 hover:text-primary-800">
            Guidelines{rule.source_page ? `, p. ${rule.source_page}` : ''}
            <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
        {open && (
          <blockquote className="mt-1.5 text-xs text-brand-700 bg-brand-50 border-l-2 border-primary-300 pl-3 py-1.5 rounded-r">
            “{rule.source_quote}”
          </blockquote>
        )}
      </div>
    </li>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const tone = severity === 'critical' ? 'bg-red-50 text-red-700' : severity === 'important' ? 'bg-amber-50 text-amber-800' : 'bg-brand-100 text-brand-600';
  const label = severity === 'critical' ? 'Can cause rejection' : severity === 'important' ? 'Costs marks' : 'Minor';
  return <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${tone}`}>{label}</span>;
}

function CheckedBy({ by }: { by: 'code' | 'ai' }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-brand-500" title={by === 'code' ? 'Measured from the PDF' : 'Judged by the AI'}>
      {by === 'code' ? <Code2 className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
      {by === 'code' ? 'measured' : 'AI'}
    </span>
  );
}

function ScoreDots({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-brand-400">not scored</span>;
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${score} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`w-2.5 h-2.5 rounded-full ${n <= score ? 'bg-primary-600' : 'bg-brand-200'}`} />
      ))}
      <span className="ml-1 text-xs font-semibold text-brand-700 tabular-nums">{score}/5</span>
    </span>
  );
}

function Panel({ title, count, icon, defaultOpen = false, children }: {
  title: string; count?: number; icon: ReactNode; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="bg-white border border-brand-200 rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full px-4 py-3 flex items-center gap-2 text-left bg-brand-50 hover:bg-brand-100/70">
        {icon}
        <h3 className="flex-1 text-sm font-bold text-brand-900">{title}</h3>
        {count !== undefined && <span className="text-xs text-brand-500 tabular-nums">{count}</span>}
        <ChevronDown className={`w-4 h-4 text-brand-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-brand-100">{children}</div>}
    </section>
  );
}

function Callout({ tone, icon, className = '', children }: { tone: 'red' | 'amber'; icon: ReactNode; className?: string; children: ReactNode }) {
  const tones = { red: 'border-red-200 bg-red-50 text-red-900', amber: 'border-amber-200 bg-amber-50 text-amber-900' };
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm flex gap-2.5 ${tones[tone]} ${className}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-5 text-sm text-brand-500 text-center">{children}</p>;
}

function UsageFooter({ review, result }: { review: ProposalReview; result: ReviewResult }) {
  const reused = result.reused ?? {};
  const notes = [
    reused.ai_review && 'reused the AI review (nothing changed)',
    !reused.ai_review && reused.incremental && 'sent only the changed sections',
    reused.facts && 'reused the budget facts',
  ].filter(Boolean);
  return (
    <p className="text-[11px] text-brand-400 text-right">
      {review.aiCalls ?? 0} AI {review.aiCalls === 1 ? 'call' : 'calls'} · {(review.tokensIn ?? 0).toLocaleString('en-IN')} input /{' '}
      {(review.tokensOut ?? 0).toLocaleString('en-IN')} output tokens{notes.length ? ` · ${notes.join(', ')}` : ''}
    </p>
  );
}

/** Rules that went from failing to passing, and new failures, since the previous version. */
function ruleChanges(before: RuleResult[], after: RuleResult[]) {
  const bad = (r?: RuleResult) => r !== undefined && (r.verdict === 'fail' || r.verdict === 'partial');
  const old = new Map(before.map((r) => [r.id, r]));
  let fixed = 0;
  let newProblems = 0;
  for (const r of after) {
    const prev = old.get(r.id);
    if (bad(prev) && r.verdict === 'pass') fixed += 1;
    if (bad(r) && !bad(prev)) newProblems += 1;
  }
  return { fixed, newProblems };
}
