import { X, ShieldCheck, ShieldAlert, Calendar, TrendingUp, ExternalLink, BookmarkPlus, BookmarkCheck } from 'lucide-react';
import type { DiscoveryGrant } from '../../services/discoveryService';

interface GrantDetailsModalProps {
  grant: DiscoveryGrant;
  onClose: () => void;
  source?: 'ai' | 'core' | null;
  isSaved?: boolean;
  onToggleSave?: (grant: DiscoveryGrant) => void;
}

export default function GrantDetailsModal({ grant, onClose, source, isSaved = false, onToggleSave }: GrantDetailsModalProps) {
  const isAi = source === 'ai';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-brand-900/50 backdrop-blur-md transition-opacity" onClick={onClose} />

      {/* Modal Content */}
      <div className="bg-white rounded-2xl shadow-[0_25px_70px_rgba(15,23,42,0.25)] w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col relative z-10 animate-in fade-in zoom-in-95 duration-200 ring-1 ring-brand-200/50">
        {/* Header with gradient + decorative accent */}
        <div className="relative flex items-start justify-between p-6 border-b border-brand-100 bg-gradient-to-br from-primary-50/60 via-white to-brand-50/40 overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />
          <div className="pr-10 relative">
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-white text-brand-700 uppercase tracking-widest mb-3 inline-block border border-brand-200 shadow-sm">
              {grant.funder}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-brand-900 leading-tight tracking-tight">
              {grant.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 text-brand-400 hover:text-brand-700 hover:bg-white/80 rounded-full transition-all hover:shadow-sm"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-gradient-to-b from-white to-brand-50/30">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
              {/* Match Score */}
              <div className="relative p-4 bg-white rounded-xl border border-primary-100/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(13,148,136,0.06)] overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary-400 to-primary-600" />
                  <div className="flex items-center gap-2 text-brand-500 mb-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider">Match Score</span>
                  </div>
                  <div className={`text-2xl font-bold tabular-nums ${grant.matchScore > 90 ? 'text-green-600' : 'text-primary-600'}`}>
                      {grant.matchScore}%
                  </div>
              </div>
              {/* Deadline */}
              <div className="relative p-4 bg-white rounded-xl border border-brand-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.04)] overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-brand-300 to-brand-500" />
                  <div className="flex items-center gap-2 text-brand-500 mb-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider">Deadline</span>
                  </div>
                  <div className="text-xl font-bold text-brand-900 tabular-nums">
                      {grant.deadline}
                  </div>
              </div>
              {/* Funding Amount */}
              <div className="relative p-4 bg-white rounded-xl border border-green-100/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(34,197,94,0.06)] overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-green-400 to-emerald-500" />
                  <div className="flex items-center gap-2 text-brand-500 mb-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider">Funding</span>
                  </div>
                  <div className="text-xl font-bold text-green-700 tabular-nums break-words">
                      {grant.amount}
                  </div>
              </div>
            </div>

            {isAi && (
              <div className="mb-8">
                  <h3 className="text-base font-bold text-brand-900 mb-3 tracking-tight uppercase tracking-wider text-xs text-brand-500">AI Match Rationale</h3>
                  <div className="relative bg-gradient-to-br from-primary-50 via-primary-50/60 to-white border border-primary-100/80 rounded-xl p-5 text-primary-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary-400 to-primary-600" />
                      <p className="pl-2">{grant.rationale}</p>
                  </div>
              </div>
            )}

            <div className="mb-8">
                <h3 className="text-xs font-semibold text-brand-500 uppercase tracking-wider mb-3">Eligibility Status</h3>
                {grant.eligibility === 'Eligible' ? (
                  <div className="flex items-center gap-3 text-green-800 bg-gradient-to-r from-green-50 to-emerald-50/60 px-5 py-4 rounded-xl border border-green-200/80 shadow-sm">
                    <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5 text-green-700" />
                    </div>
                    <span className="font-medium text-sm">You appear to meet all core eligibility criteria based on your profile.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-amber-800 bg-gradient-to-r from-amber-50 to-amber-50/40 px-5 py-4 rounded-xl border border-amber-200/80 shadow-sm">
                    <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                      <ShieldAlert className="w-5 h-5 text-amber-700" />
                    </div>
                    <span className="font-medium text-sm">Unverified constraints. Please review the full guidelines.</span>
                  </div>
                )}
            </div>

            <div className="mb-6">
                <h3 className="text-xs font-semibold text-brand-500 uppercase tracking-wider mb-3">Tags & Keywords</h3>
                <div className="flex flex-wrap gap-2">
                    {grant.tags.map(tag => (
                      <span key={tag} className="px-3 py-1.5 bg-white border border-brand-200 text-brand-700 rounded-lg text-sm font-medium shadow-sm">
                          {tag}
                      </span>
                    ))}
                    {grant.researchThemes && grant.researchThemes.length > 0 && grant.researchThemes.map(theme => (
                      <span key={theme} className="px-3 py-1.5 bg-gradient-to-r from-primary-50 to-primary-50/40 border border-primary-200/60 text-primary-700 rounded-lg text-sm font-medium flex items-center shadow-sm">
                          <TrendingUp className="w-3.5 h-3.5 mr-1 text-primary-500" />
                          {theme}
                      </span>
                    ))}
                </div>
            </div>

            <div className="mt-8 pt-8 border-t border-brand-100/80">
                <h3 className="text-xs font-semibold text-brand-500 uppercase tracking-wider mb-3">Objectives</h3>
                <p className="text-brand-700 leading-relaxed text-sm md:text-base">{grant.objectives || 'Objectives not explicitly specified. Review the description or guidelines for details.'}</p>
            </div>

            <div className="mt-8 pt-8 border-t border-brand-100/80">
                <h3 className="text-xs font-semibold text-brand-500 uppercase tracking-wider mb-3">Grant Description</h3>
                <p className="text-brand-700 leading-relaxed text-sm md:text-base">{grant.description}</p>
            </div>

            <div className="mt-8 pt-8 border-t border-brand-100/80 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h3 className="text-xs font-semibold text-brand-500 uppercase tracking-wider mb-2">Funding Scope</h3>
                    <p className="text-brand-700 leading-relaxed text-sm">{grant.fundingScope || 'Not specified. Please check provider site.'}</p>
                </div>
                <div>
                    <h3 className="text-xs font-semibold text-brand-500 uppercase tracking-wider mb-2">Duration</h3>
                    <p className="text-brand-700 leading-relaxed text-sm">{grant.grantDuration || 'Not specified'}</p>
                </div>
            </div>

            <div className="mt-8 pt-8 border-t border-brand-100/80 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h3 className="text-xs font-semibold text-brand-500 uppercase tracking-wider mb-2">Eligibility Criteria</h3>
                    <p className="text-brand-700 leading-relaxed text-sm">{grant.eligibilityCriteria || 'Not fully detailed here. Please check provider site.'}</p>
                </div>
                <div>
                    <h3 className="text-xs font-semibold text-brand-500 uppercase tracking-wider mb-2">Selection Process</h3>
                    <p className="text-brand-700 leading-relaxed text-sm">{grant.selectionCriteria || 'Not explicitly specified.'}</p>
                </div>
            </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 sm:p-5 border-t border-brand-100 bg-white/80 backdrop-blur-md flex flex-col-reverse sm:flex-row gap-3 justify-end items-center">
            <button
                onClick={() => onToggleSave?.(grant)}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-semibold border transition-all flex items-center justify-center gap-2 active:scale-[0.98] ${
                  isSaved
                    ? 'text-primary-700 bg-primary-50 border-primary-200 hover:bg-primary-100 shadow-sm'
                    : 'text-brand-700 bg-white border-brand-200 hover:bg-brand-50 hover:border-brand-300 shadow-sm hover:shadow-md'
                }`}
            >
                {isSaved
                  ? <><BookmarkCheck className="w-4 h-4 text-primary-600" /> Saved</>
                  : <><BookmarkPlus className="w-4 h-4" /> Save</>
                }
            </button>
            <button
                onClick={() => {
                  const target = grant.applicationLink || grant.grantUrl;
                  if (target) {
                    window.open(target, '_blank', 'noopener,noreferrer');
                  }
                }}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
                Apply on provider site <ExternalLink className="w-4 h-4" />
            </button>
        </div>
      </div>
    </div>
  );
}
