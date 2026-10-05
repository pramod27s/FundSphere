import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, ShieldAlert, Calendar, CalendarPlus, FileText, Gavel, Rocket, TrendingUp, ExternalLink, BookmarkPlus, BookmarkCheck } from 'lucide-react';
import { useId, useRef, type ComponentType } from 'react';
import type { DiscoveryGrant } from '../../services/discoveryService';
import type { ResearcherResponse } from '../../services/researcherService';
import FreshnessBadge from '../common/FreshnessBadge';
import ProviderUpdatedInfo from '../common/ProviderUpdatedInfo';
import MatchBreakdown from '../common/MatchBreakdown';
import { formatRelativeDeadline, formatKeyDate } from '../../utils/formatDeadline';
import GlossaryText from '../common/GlossaryText';
import WhatsAppShareButton from '../common/WhatsAppShareButton';
import { useDialog } from '../../hooks/useDialog';

interface GrantDetailsModalProps {
  grant: DiscoveryGrant;
  onClose: () => void;
  source?: 'ai' | 'core' | null;
  isSaved?: boolean;
  onToggleSave?: (grant: DiscoveryGrant) => void;
  /** Researcher profile, used to render the Why-this-match breakdown in AI mode. */
  profile?: ResearcherResponse | null;
}

export default function GrantDetailsModal({ grant, onClose, source, isSaved = false, onToggleSave, profile }: GrantDetailsModalProps) {
  const isAi = source === 'ai';
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(dialogRef, onClose);
  const deadline = formatRelativeDeadline(grant.deadlineRaw);
  const deadlineTone =
    deadline.tone === 'overdue' ? 'text-red-700'
    : deadline.tone === 'urgent' ? 'text-amber-700'
    : 'text-brand-900';

  // Application timeline — only milestones the provider actually published are
  // shown (the main deadline already has its own prominent card above).
  const timeline: { label: string; icon: ComponentType<{ className?: string }>; raw?: string }[] = [
    { label: 'Opens', icon: CalendarPlus, raw: grant.openingDate },
    { label: 'LOI Due', icon: FileText, raw: grant.loiDeadline },
    { label: 'Decision', icon: Gavel, raw: grant.decisionDate },
    { label: 'Project Start', icon: Rocket, raw: grant.projectStartDate },
  ];
  const keyDates = timeline
    .map((m) => ({ ...m, fmt: formatKeyDate(m.raw) }))
    .filter((m): m is typeof m & { fmt: NonNullable<ReturnType<typeof formatKeyDate>> } => m.fmt !== null);

  const isAmountSpecified =
    !!grant.amount &&
    !grant.amount.toLowerCase().includes('not specified') &&
    !grant.amount.toLowerCase().includes('tbd');

  const hasContent = (text?: string | null): boolean => {
    if (!text) return false;
    const t = text.trim().toLowerCase();
    return (
      t.length > 0 &&
      !t.startsWith('not specified') &&
      !t.startsWith('not explicitly') &&
      !t.startsWith('not fully detailed') &&
      !t.includes('check provider site') &&
      t !== 'none' &&
      t !== 'n/a'
    );
  };

  const hasDistinctObjectives =
    hasContent(grant.objectives) &&
    grant.objectives!.trim().toLowerCase() !== (grant.description || '').trim().toLowerCase();

  const hasScopeOrDuration = hasContent(grant.fundingScope) || hasContent(grant.grantDuration);
  const hasEligibilityOrSelection = hasContent(grant.eligibilityCriteria) || hasContent(grant.selectionCriteria);

  const hasValidStages =
    grant.targetCareerStages &&
    grant.targetCareerStages.length > 0 &&
    !grant.targetCareerStages.every((s) => s.toLowerCase() === 'any');

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-brand-950/60 transition-opacity" onClick={onClose} aria-hidden="true" />

      {/* Modal Content */}
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white rounded-xl shadow-modal w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col relative z-10 ring-1 ring-brand-200/50">
        {/* Header with gradient + decorative accent */}
        <div className="relative flex items-start justify-between p-6 border-b border-brand-100 bg-white">
          <div className="absolute top-0 left-0 w-full h-1 bg-primary-600" />
          <div className="pr-10 relative">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-white text-brand-700 inline-block border border-brand-200 shadow-sm">
                {grant.funder}
              </span>
              {grant.grantType && grant.grantType.toUpperCase() !== 'OTHER' && (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-primary-50 text-primary-700 uppercase tracking-wide inline-block border border-primary-200 shadow-sm">
                  {grant.grantType}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <FreshnessBadge timestamp={grant.lastVerifiedAt ?? grant.lastScrapedAt ?? grant.updatedAt} size="full" />
              <ProviderUpdatedInfo timestamp={grant.lastScrapedAt ?? grant.updatedAt} />
            </div>
            <h2 id={titleId} className="text-xl sm:text-2xl font-bold text-brand-900 leading-tight tracking-tight">
              {grant.title}
            </h2>
          </div>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            className="absolute top-6 right-6 p-2 text-brand-500 hover:text-brand-700 hover:bg-white rounded-full transition-all hover:shadow-sm"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-white">
            <div className={`grid grid-cols-1 gap-3 mb-8 ${isAi ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
              {/* Match Score — only shown in AI mode */}
              {isAi && (
              <div className="relative p-4 bg-white rounded-lg border border-brand-200 overflow-hidden">
                  <div className="flex items-center gap-2 text-brand-500 mb-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">Match score</span>
                  </div>
                  <div className={`text-2xl font-bold tabular-nums text-primary-700`}>
                      {grant.matchScore}%
                  </div>
              </div>
              )}

              {/* Deadline */}
              <div className="relative p-4 bg-white rounded-lg border border-brand-200 overflow-hidden" title={deadline.tooltip || undefined}>
                  <div className="flex items-center gap-2 text-brand-500 mb-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">Deadline</span>
                  </div>
                  <div className={`text-xl font-bold tabular-nums ${deadlineTone}`}>
                      {deadline.label}
                  </div>
                  {deadline.tooltip && (
                    <div className="text-[11px] text-brand-500 mt-0.5 tabular-nums">
                      {deadline.tooltip}
                    </div>
                  )}
              </div>

              {/* Funding Amount — bold if specified, muted if unstated */}
              {isAmountSpecified ? (
                <div className="relative p-4 bg-white rounded-lg border border-brand-200 overflow-hidden">
                  <div className="flex items-center gap-2 text-brand-500 mb-1.5">
                    <span className="text-xs font-medium">Funding</span>
                  </div>
                  <div className="text-xl font-bold text-brand-900 tabular-nums break-words">
                    {grant.amount}
                  </div>
                </div>
              ) : (
                <div className="relative p-4 bg-white rounded-lg border border-brand-200 overflow-hidden">
                  <div className="flex items-center gap-2 text-brand-500 mb-1.5">
                    <span className="text-xs font-medium">Funding</span>
                  </div>
                  <div className="text-base font-semibold text-brand-600 tabular-nums break-words">
                    Funding amount not specified
                  </div>
                </div>
              )}
            </div>

            {keyDates.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-brand-900 mb-3">Application timeline</h3>
                <div className="flex flex-wrap gap-3">
                  {keyDates.map(({ label, icon: Icon, fmt }) => (
                    <div
                      key={label}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-sm ${
                        fmt.isPast
                          ? 'bg-brand-50 border-brand-100 text-brand-500'
                          : 'bg-white border-brand-200 text-brand-900'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${fmt.isPast ? 'bg-brand-100' : 'bg-primary-50'}`}>
                        <Icon className={`w-4 h-4 ${fmt.isPast ? 'text-brand-500' : 'text-primary-600'}`} />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-brand-500">{label}</div>
                        <div className="text-sm font-bold tabular-nums leading-tight">{fmt.abs}</div>
                        <div className="text-[11px] text-brand-500 tabular-nums">{fmt.hint}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Match Rationale — only shown in AI mode */}
            {isAi && (
              <div className="mb-8">
                  <h3 className="text-sm font-semibold text-brand-900 mb-3">AI match rationale</h3>
                  <div className="relative bg-primary-50 border border-primary-200 rounded-lg p-5 text-primary-900 overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-primary-600" />
                      <GlossaryText as="p" className="pl-2">{grant.rationale}</GlossaryText>
                  </div>
              </div>
            )}

            {/* Match Breakdown — only shown in AI mode when profile is present */}
            {isAi && profile && (
              <div className="mb-8">
                <MatchBreakdown grant={grant} profile={profile} />
              </div>
            )}

            <div className="mb-8">
                <h3 className="text-sm font-semibold text-brand-900 mb-3">Eligibility status</h3>
                {grant.eligibility === 'Eligible' ? (
                  <div className="flex items-center gap-3 text-primary-900 bg-primary-50 px-5 py-4 rounded-lg border border-primary-200">
                    <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5 text-primary-700" />
                    </div>
                    <span className="font-medium text-sm">You appear to meet all core eligibility criteria based on your profile.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-amber-800 bg-amber-50 px-5 py-4 rounded-lg border border-amber-200">
                    <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                      <ShieldAlert className="w-5 h-5 text-amber-700" />
                    </div>
                    <span className="font-medium text-sm">Unverified constraints. Please review the full guidelines.</span>
                  </div>
                )}
            </div>

            {hasValidStages && grant.targetCareerStages && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-brand-900 mb-3">Ideal applicants</h3>
                <div className="flex flex-wrap gap-2">
                  {grant.targetCareerStages.map((stage) => (
                    <span key={stage} className="px-3 py-1.5 bg-primary-50 border border-primary-200 text-primary-700 rounded-lg text-sm font-medium shadow-sm">
                      {stage}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {grant.tags.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-brand-900 mb-3">Tags & keywords</h3>
                <div className="flex flex-wrap gap-2">
                    {grant.tags.map(tag => (
                      <span key={tag} className="px-3 py-1.5 bg-white border border-brand-200 text-brand-700 rounded-lg text-sm font-medium shadow-sm">
                          {tag}
                      </span>
                    ))}
                    {grant.researchThemes && grant.researchThemes.length > 0 && grant.researchThemes.map(theme => (
                      <span key={theme} className="px-3 py-1.5 bg-primary-50 border border-primary-200 text-primary-700 rounded-lg text-sm font-medium flex items-center shadow-sm">
                          <TrendingUp className="w-3.5 h-3.5 mr-1 text-primary-500" />
                          {theme}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {hasDistinctObjectives && (
              <div className="mt-8 pt-8 border-t border-brand-100">
                <h3 className="text-sm font-semibold text-brand-900 mb-3">Objectives</h3>
                <GlossaryText as="p" className="text-brand-700 leading-relaxed text-sm md:text-base">
                  {grant.objectives!}
                </GlossaryText>
              </div>
            )}

            {grant.description && (
              <div className="mt-8 pt-8 border-t border-brand-100">
                <h3 className="text-sm font-semibold text-brand-900 mb-3">Grant description</h3>
                <GlossaryText as="p" className="text-brand-700 leading-relaxed text-sm md:text-base">{grant.description}</GlossaryText>
              </div>
            )}

            {hasScopeOrDuration && (
              <div className="mt-8 pt-8 border-t border-brand-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                {hasContent(grant.fundingScope) && (
                  <div>
                    <h3 className="text-sm font-semibold text-brand-900 mb-2">Funding scope</h3>
                    <GlossaryText as="p" className="text-brand-700 leading-relaxed text-sm">{grant.fundingScope!}</GlossaryText>
                  </div>
                )}
                {hasContent(grant.grantDuration) && (
                  <div>
                    <h3 className="text-sm font-semibold text-brand-900 mb-2">Duration</h3>
                    <p className="text-brand-700 leading-relaxed text-sm">{grant.grantDuration!}</p>
                  </div>
                )}
              </div>
            )}

            {hasEligibilityOrSelection && (
              <div className="mt-8 pt-8 border-t border-brand-100 grid grid-cols-1 md:grid-cols-2 gap-6">
                {hasContent(grant.eligibilityCriteria) && (
                  <div>
                    <h3 className="text-sm font-semibold text-brand-900 mb-2">Eligibility criteria</h3>
                    <GlossaryText as="p" className="text-brand-700 leading-relaxed text-sm">{grant.eligibilityCriteria!}</GlossaryText>
                  </div>
                )}
                {hasContent(grant.selectionCriteria) && (
                  <div>
                    <h3 className="text-sm font-semibold text-brand-900 mb-2">Selection process</h3>
                    <GlossaryText as="p" className="text-brand-700 leading-relaxed text-sm">{grant.selectionCriteria!}</GlossaryText>
                  </div>
                )}
              </div>
            )}
        </div>

        {/* Footer actions */}
        <div className="p-4 sm:p-5 border-t border-brand-100 bg-white flex flex-col-reverse sm:flex-row gap-3 justify-end items-center">
            <WhatsAppShareButton grant={grant} size="md" showLabel />
            <button
                onClick={() => onToggleSave?.(grant)}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-lg font-semibold border transition-all flex items-center justify-center gap-2 active:scale-[0.98] ${
                  isSaved
                    ? 'text-primary-700 bg-primary-50 border-primary-200 hover:bg-primary-100 shadow-sm'
                    : 'text-brand-700 bg-white border-brand-200 hover:bg-brand-50 hover:border-brand-300 shadow-xs'
                }`}
            >
                {isSaved
                  ? <><BookmarkCheck className="w-4 h-4 text-primary-600" /> Saved</>
                  : <><BookmarkPlus className="w-4 h-4" /> Save</>
                }
            </button>
            {(() => {
              const target = grant.applicationLink || grant.grantUrl;
              const disabled = !target;
              return (
                <button
                  onClick={() => {
                    if (target) window.open(target, '_blank', 'noopener,noreferrer');
                  }}
                  disabled={disabled}
                  title={disabled ? 'Provider did not publish an application link' : undefined}
                  className={`w-full sm:w-auto px-6 py-2.5 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
                    disabled
                      ? 'bg-brand-100 text-brand-500 cursor-not-allowed border border-brand-200'
                      : 'text-white bg-primary-600 hover:bg-primary-700 shadow-xs active:scale-[0.98]'
                  }`}
                >
                  {disabled ? 'No application link available' : <>Apply on provider site <ExternalLink className="w-4 h-4" /></>}
                </button>
              );
            })()}
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
