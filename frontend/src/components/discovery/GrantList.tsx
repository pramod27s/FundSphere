import { useState } from 'react';
import { ShieldAlert, ShieldCheck, Users, TrendingUp, Calendar, ChevronRight } from 'lucide-react';
import GrantDetailsModal from './GrantDetailsModal.tsx';
import type { DiscoveryGrant } from '../../services/discoveryService';

interface GrantListProps {
  grants: DiscoveryGrant[];
}

export default function GrantList({ grants }: GrantListProps) {
  const [selectedGrant, setSelectedGrant] = useState<DiscoveryGrant | null>(null);

  return (
    <>
      <div className="flex flex-col gap-4">
        {grants.map((grant) => (
          <div
            key={grant.id} 
            className="bg-white border border-brand-200 rounded-2xl p-6 hover:shadow-lg hover:border-primary-300 transition-all group cursor-pointer"
            onClick={() => setSelectedGrant(grant)}
          >
            
            {/* Header Row */}
          <div className="flex justify-between items-start gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-brand-100 text-brand-600 uppercase tracking-widest">
                  {grant.funder}
                </span>
                
                {/* Match Score Badge */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold ${
                  grant.matchScore > 90 ? 'bg-green-100 text-green-700' : 'bg-primary-100 text-primary-700'
                }`}>
                  <TrendingUp className="w-3.5 h-3.5" />
                  {grant.matchScore}% Match
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
              
              <h3 className="text-xl font-bold text-brand-900 group-hover:text-primary-600 transition-colors cursor-pointer line-clamp-2">
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
          <div className="mb-5 bg-brand-50/50 border border-brand-100 rounded-lg p-3 text-sm text-brand-600">
            <span className="font-semibold text-brand-800">Why this matches:</span> {grant.rationale}
          </div>

          {/* Footer Metadata */}
          <div className="flex flex-wrap items-center justify-between gap-4 mt-auto">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-brand-700">
                <Calendar className="w-4 h-4 text-brand-400" />
                <span className="text-sm font-medium">Due {grant.deadline}</span>
              </div>
              <div className="flex items-center gap-2 text-brand-700">
                <span className="text-lg font-bold text-green-600">{grant.amount}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-400" />
                <span className="text-sm text-brand-500">Find Collaborator</span>
              </div>
            </div>

              <div className="text-xs text-brand-400">
                {grant.updatedAt ? `Updated: ${new Date(grant.updatedAt).toLocaleDateString()}` : ''}
                {grant.lastScrapedAt ? ` • Scraped: ${new Date(grant.lastScrapedAt).toLocaleDateString()}` : ''}
              </div>

            <button 
              className="flex items-center gap-1 text-primary-600 hover:text-primary-700 font-semibold text-sm transition-colors cursor-pointer group/btn"
              onClick={(e) => { e.stopPropagation(); setSelectedGrant(grant); }}
            >
              View Details 
              <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
            </button>
          </div>

        </div>
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
