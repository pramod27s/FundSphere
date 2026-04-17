import { useState } from 'react';
import { ShieldAlert, ShieldCheck, Users, TrendingUp, Calendar, ChevronRight, Sparkles } from 'lucide-react';
import GrantDetailsModal from './GrantDetailsModal.tsx';
import type { DiscoveryGrant } from '../../services/discoveryService';

interface GrantListProps {
  grants: DiscoveryGrant[];
  isLoading?: boolean;
}

export function GrantSkeleton() {
  return (
    <div aria-hidden="true" className="bg-white border border-brand-200 rounded-2xl p-6 shadow-sm animate-pulse">
      <div className="flex justify-between items-start gap-4 mb-4">
        <div className="w-full">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-6 w-24 bg-brand-100 rounded-md"></div>
            <div className="h-6 w-20 bg-brand-100 rounded-md"></div>
            <div className="h-6 w-24 bg-brand-100 rounded-md"></div>
          </div>
          <div className="h-7 w-3/4 bg-brand-100 rounded-md mb-2"></div>
          <div className="h-7 w-1/2 bg-brand-100 rounded-md"></div>
          <div className="flex gap-2 mt-4">
            <div className="h-5 w-16 bg-brand-50 rounded-full"></div>
            <div className="h-5 w-20 bg-brand-50 rounded-full"></div>
            <div className="h-5 w-24 bg-brand-50 rounded-full"></div>
          </div>
        </div>
      </div>
      <div className="mb-5 h-12 w-full bg-brand-50 rounded-lg"></div>
      <div className="flex items-center justify-between mt-auto">
        <div className="flex gap-6">
          <div className="h-5 w-32 bg-brand-100 rounded-md"></div>
          <div className="h-5 w-24 bg-brand-100 rounded-md"></div>
        </div>
        <div className="h-5 w-24 bg-brand-100 rounded-md"></div>
      </div>
    </div>
  );
}

export default function GrantList({ grants, isLoading }: GrantListProps) {
  const [selectedGrant, setSelectedGrant] = useState<DiscoveryGrant | null>(null);

  const openDetails = (grant: DiscoveryGrant) => setSelectedGrant(grant);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
        <GrantSkeleton />
        <GrantSkeleton />
        <GrantSkeleton />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4" aria-live="polite">
        {grants.map((grant) => (
          <article
            key={grant.id} 
            className="bg-white border border-brand-200 rounded-2xl p-6 hover:shadow-lg hover:border-primary-300 focus-within:ring-2 focus-within:ring-primary-300 transition-all group"
            role="button"
            tabIndex={0}
            onClick={() => openDetails(grant)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openDetails(grant);
              }
            }}
            aria-label={`Open details for ${grant.title}`}
          >
            
            {/* Header Row */}
          <div className="flex justify-between items-start gap-4 mb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-brand-100 text-brand-600 uppercase tracking-widest">
                  {grant.funder}
                </span>
                
                {/* Match Score Badge */}
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold shadow-sm ${
                  grant.matchScore > 85 ? 'bg-primary-50 text-primary-700 border border-primary-200' : 'bg-brand-50 text-brand-700 border border-brand-200'
                }`}>
                   {grant.matchScore > 85 ? <Sparkles className="w-3.5 h-3.5 text-primary-500" /> : <TrendingUp className="w-3.5 h-3.5" />}
                  <span>{grant.matchScore}% Match</span>
                  {/* Mini Progress Bar inside the badge */}
                  <div className="w-12 h-1.5 bg-white rounded-full ml-1 overflow-hidden border border-brand-100">
                    <div
                      className={`h-full rounded-full ${grant.matchScore > 85 ? 'bg-primary-500' : 'bg-brand-400'}`}
                      style={{ width: `${grant.matchScore}%` }}
                    />
                  </div>
                </div>

                {/* Eligibility Status */}
                {grant.eligibility === 'Eligible' ? (
                  <div className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-md">
                    <ShieldCheck className="w-3.5 h-3.5" /> Verified
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-200/50">
                    <ShieldAlert className="w-3.5 h-3.5" /> Unverified Constraint
                  </div>
                )}
              </div>
              
              <h3 className="text-xl font-bold text-brand-900 group-hover:text-primary-600 transition-colors line-clamp-2 wrap-break-word">
                {grant.title}
              </h3>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {grant.tags.map((tag) => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 border border-brand-200">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* AI Rationale Snippet */}
          <div className="mb-5 relative overflow-hidden bg-linear-to-r from-primary-50/50 to-brand-50/50 border border-primary-100/60 rounded-lg p-4 text-sm text-brand-700 shadow-sm transition-all hover:shadow-md group-hover:border-primary-300">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary-400 opacity-50"></div>
              <p className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
                <span>
                  <span className="font-semibold text-primary-900 mr-1">AI Reasoning:</span>
                  {grant.rationale}
                </span>
              </p>
            </div>

            {/* Footer Metadata */}
            <div className="flex flex-wrap items-center justify-between gap-4 mt-auto border-t border-brand-100 pt-4">
              <div className="flex flex-wrap items-center gap-3 sm:gap-6">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-50 rounded-lg text-brand-700">
                  <Calendar className="w-4 h-4 text-brand-500" />
                  <span className="text-sm font-medium whitespace-nowrap">Due {grant.deadline}</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg text-green-700">
                  <span className="text-sm font-bold text-green-700 whitespace-nowrap">{grant.amount}</span>
                </div>
                <div className="hidden md:flex items-center gap-2 whitespace-nowrap">
                  <Users className="w-4 h-4 text-brand-400" />
                  <span className="text-sm text-brand-500">Find Collaborator</span>
                </div>
              </div>

              <div className="flex items-center w-full sm:w-auto justify-between sm:justify-end gap-6 border-t sm:border-t-0 border-brand-50 pt-2 sm:pt-0 mt-2 sm:mt-0">
                <div className="text-xs text-brand-400">
                  {grant.updatedAt && `Updated: ${new Date(grant.updatedAt).toLocaleDateString()}`}
                </div>

                <button
                  type="button"
                  className="flex items-center gap-1 text-primary-600 hover:text-primary-700 font-semibold text-sm transition-colors cursor-pointer group/btn shrink-0"
                  onClick={(e) => { e.stopPropagation(); openDetails(grant); }}
                  aria-label={`View details for ${grant.title}`}
                >
                  View Details
                  <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {selectedGrant && (
        <GrantDetailsModal 
          grant={selectedGrant} 
          onClose={() => setSelectedGrant(null)} 
        />
      )}
    </>
  );
}
