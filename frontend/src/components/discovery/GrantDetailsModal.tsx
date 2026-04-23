import { X, ShieldCheck, ShieldAlert, Calendar, TrendingUp, ExternalLink, BookmarkPlus } from 'lucide-react';
import type { DiscoveryGrant } from '../../services/discoveryService';

interface GrantDetailsModalProps {
  grant: DiscoveryGrant;
  onClose: () => void;
}

export default function GrantDetailsModal({ grant, onClose }: GrantDetailsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      {/* Modal Content */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col relative z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-brand-100 bg-brand-50/50">
          <div className="pr-10">
            <span className="text-xs font-bold px-3 py-1 rounded-md bg-brand-100 text-brand-600 uppercase tracking-widest mb-3 inline-block">
              {grant.funder}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-brand-900 leading-tight">
              {grant.title}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 text-brand-400 hover:text-brand-600 hover:bg-brand-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
            <div className="flex flex-wrap gap-4 mb-8">
              {/* Stats Row */}
              <div className="flex-1 min-w-[200px] p-4 bg-brand-50 rounded-xl border border-brand-100">
                  <div className="flex items-center gap-2 text-brand-600 mb-1">
                      <TrendingUp className="w-4 h-4" />
                      <span className="text-sm font-medium">Match Score</span>
                  </div>
                  <div className={`text-2xl font-bold ${grant.matchScore > 90 ? 'text-green-600' : 'text-primary-600'}`}>
                      {grant.matchScore}%
                  </div>
              </div>
              <div className="flex-1 min-w-[200px] p-4 bg-brand-50 rounded-xl border border-brand-100">
                  <div className="flex items-center gap-2 text-brand-600 mb-1">
                      <Calendar className="w-4 h-4" />
                      <span className="text-sm font-medium">Deadline</span>
                  </div>
                  <div className="text-2xl font-bold text-brand-900">
                      {grant.deadline}
                  </div>
              </div>
            </div>

            <div className="mb-8">
                <h3 className="text-lg font-bold text-brand-900 mb-3">Funding Amount</h3>
                <p className="text-3xl font-bold text-green-600">{grant.amount}</p>
            </div>

            <div className="mb-8">
                <h3 className="text-lg font-bold text-brand-900 mb-3">AI Match Rationale</h3>
                <div className="bg-primary-50 border border-primary-100 rounded-xl p-5 text-primary-900 shadow-sm">
                    {grant.rationale}
                </div>
            </div>

            <div className="mb-8">
                <h3 className="text-lg font-bold text-brand-900 mb-3">Eligibility Status</h3>
                {grant.eligibility === 'Eligible' ? (
                  <div className="flex items-center gap-3 text-green-700 bg-green-50 px-5 py-4 rounded-xl border border-green-200">
                    <ShieldCheck className="w-6 h-6 shrink-0" /> 
                    <span className="font-medium">You appear to meet all core eligibility criteria based on your profile.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-amber-700 bg-amber-50 px-5 py-4 rounded-xl border border-amber-200">
                    <ShieldAlert className="w-6 h-6 shrink-0" /> 
                    <span className="font-medium">Unverified constraints. Please review the full guidelines.</span>
                  </div>
                )}
            </div>

            <div className="mb-6">
                <h3 className="text-lg font-bold text-brand-900 mb-3">Tags & Keywords</h3>
                <div className="flex flex-wrap gap-2">
                    {grant.tags.map(tag => (
                      <span key={tag} className="px-3 py-1.5 bg-brand-100 text-brand-700 rounded-lg text-sm font-medium">
                          {tag}
                      </span>
                    ))}
                    {grant.researchThemes && grant.researchThemes.length > 0 && grant.researchThemes.map(theme => (
                      <span key={theme} className="px-3 py-1.5 bg-primary-50 border border-primary-100 text-primary-700 rounded-lg text-sm font-medium flex items-center">
                          <TrendingUp className="w-3.5 h-3.5 mr-1 text-primary-400" />
                          {theme}
                      </span>
                    ))}
                </div>
            </div>

            <div className="mt-8 border-t border-brand-100 pt-8">
                <h3 className="text-lg font-bold text-brand-900 mb-3">Objectives</h3>
                <div className="prose prose-sm md:prose-base text-brand-600">
                  <p>{grant.objectives || 'Objectives not explicitly specified. Review the description or guidelines for details.'}</p>
                </div>
            </div>

            <div className="mt-8 border-t border-brand-100 pt-8">
                <h3 className="text-lg font-bold text-brand-900 mb-3">Grant Description</h3>
                <div className="prose prose-sm md:prose-base text-brand-600">
                  <p>
                      {grant.description}
                  </p>
                </div>
            </div>

            <div className="mt-8 border-t border-brand-100 pt-8 flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-brand-900 mb-3">Funding Scope</h3>
                    <div className="prose prose-sm text-brand-600">
                        <p>{grant.fundingScope || 'Not specified. Please check provider site.'}</p>
                    </div>
                </div>
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-brand-900 mb-3">Duration</h3>
                    <div className="prose prose-sm text-brand-600">
                        <p>{grant.grantDuration || 'Not specified'}</p>
                    </div>
                </div>
            </div>

            <div className="mt-8 border-t border-brand-100 pt-8 flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-brand-900 mb-3">Eligibility Criteria</h3>
                    <div className="prose prose-sm text-brand-600">
                        <p>{grant.eligibilityCriteria || 'Not fully detailed here. Please check provider site.'}</p>
                    </div>
                </div>
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-brand-900 mb-3">Selection Process</h3>
                    <div className="prose prose-sm text-brand-600">
                        <p>{grant.selectionCriteria || 'Not explicitly specified.'}</p>
                    </div>
                </div>
            </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 sm:p-6 border-t border-brand-100 bg-brand-50/50 flex flex-col-reverse sm:flex-row gap-3 justify-end items-center">
            <button className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-medium text-brand-700 bg-white border border-brand-200 hover:bg-brand-50 transition-colors flex items-center justify-center gap-2">
                <BookmarkPlus className="w-5 h-5" /> Save
            </button>
            <button
                onClick={() => {
                  const target = grant.applicationLink || grant.grantUrl;
                  if (target) {
                    window.open(target, '_blank', 'noopener,noreferrer');
                  }
                }}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-medium text-white bg-primary-600 hover:bg-primary-700 shadow-md shadow-primary-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
                Apply on provider site <ExternalLink className="w-4 h-4" />
            </button>
        </div>
      </div>
    </div>
  );
}
