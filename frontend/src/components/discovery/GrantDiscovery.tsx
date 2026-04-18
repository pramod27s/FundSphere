import { Search, Menu } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import GrantList from './GrantList.tsx';
import FilterSidebar from './FilterSidebar.tsx';
import AnimatedLogo from '../common/AnimatedLogo.tsx';
import type { ResearcherResponse } from '../../services/researcherService';
import { getDiscoveryGrants, type DiscoveryGrant } from '../../services/discoveryService';

interface GrantDiscoveryProps {
  researcher: ResearcherResponse | null;
}

export default function GrantDiscovery({ researcher }: GrantDiscoveryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('match');
  const [topK, setTopK] = useState(12);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [grants, setGrants] = useState<DiscoveryGrant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'ai' | 'core' | null>(null);

  const loadGrants = async (queryOverride?: string, useRerank = false) => {
    if (!researcher) {
      setErrorMessage('Researcher profile is missing. Please complete onboarding first.');
      setGrants([]);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setWarningMessage(null);

    try {
      const { grants: fetchedGrants, source, aiError } = await getDiscoveryGrants({
        userQuery: queryOverride ?? searchQuery,
        topK,
        useRerank,
      });
      setGrants(fetchedGrants);
      setDataSource(source);

      if (useRerank && source === 'core' && aiError) {
        setWarningMessage('AI matching is currently unavailable, showing fallback grants from CoreBackend.');
      }
    } catch (error) {
      setGrants([]);
      setDataSource(null);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load grants.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadGrants('', false);
  }, [researcher, topK]);

  const sortedGrants = useMemo(() => {
    const copy = [...grants];
    if (sortBy === 'deadline') {
      return copy.sort((a, b) => a.deadline.localeCompare(b.deadline));
    }
    if (sortBy === 'funding') {
      return copy.sort((a, b) => b.amount.localeCompare(a.amount));
    }
    if (sortBy === 'recent') {
      return copy.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    }
    return copy.sort((a, b) => b.matchScore - a.matchScore);
  }, [grants, sortBy]);

  return (
    <div className="flex h-screen bg-brand-50 w-full overflow-hidden relative">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className={`fixed inset-y-0 left-0 z-50 transform w-72 bg-white ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } md:relative md:translate-x-0 transition-transform duration-300 ease-in-out md:block h-full shrink-0 shadow-2xl md:shadow-none`}>
        <FilterSidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="px-4 md:px-8 py-4 md:py-6 bg-white border-b border-brand-100 shrink-0 z-10">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="md:hidden p-2 -ml-2 text-brand-600 hover:text-brand-900"
                aria-label="Open sidebar"
              >
                <Menu className="w-6 h-6" />
              </button>
              <AnimatedLogo className="w-8 h-8 md:w-10 md:h-10" />
              <h1 className="text-xl md:text-2xl font-bold text-brand-900">FundSphere</h1>
            </div>

            <div className="relative flex flex-col sm:flex-row items-center w-full group gap-2 sm:gap-0">
              <div className="hidden sm:block absolute left-4 text-brand-400 group-focus-within:text-primary-500 transition-colors z-10">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder="Describe your research project..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:pl-12 sm:pr-56 px-4 py-3 sm:py-4 bg-brand-50 border-2 border-brand-100 rounded-xl focus:outline-none focus:border-primary-500 focus:bg-white text-brand-900 placeholder:text-brand-400 text-base md:text-lg transition-all shadow-sm"
              />
              <div className="flex w-full sm:w-auto sm:absolute sm:right-2 gap-2">
                {dataSource === 'ai' && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      void loadGrants('', false);
                    }}
                    className="w-full sm:w-auto px-4 py-3 sm:py-2 bg-white text-brand-600 border border-brand-200 hover:bg-brand-50 hover:text-brand-900 rounded-xl sm:rounded-lg font-medium transition-colors shadow-sm"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => void loadGrants(searchQuery, true)}
                  className="w-full sm:w-auto px-6 py-3 sm:py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl sm:rounded-lg font-medium transition-colors shadow-md shadow-primary-500/20 active:scale-95"
                >
                  AI Match
                </button>
              </div>
            </div>

            <div className="flex gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide">
              <span className="text-xs font-semibold text-brand-500 py-1.5 uppercase tracking-wider">Suggested:</span>
              {['Climate Tech Startups', 'Postdoc Healthcare Grants', 'AI in Education Fellowships'].map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setSearchQuery(tag);
                  }}
                  className="px-3 py-1.5 bg-white border border-brand-200 rounded-full text-sm text-brand-600 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-colors whitespace-nowrap"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 sm:gap-0 mb-6">
              <div>
                <h2 className="text-lg md:text-xl font-semibold text-brand-800">Top Matches for Your Profile</h2>
                <p className="text-xs md:text-sm text-brand-500 mt-1">
                  {isLoading ? 'Fetching opportunities...' : `Found ${sortedGrants.length} opportunities from ${dataSource === 'core' ? 'CoreBackend fallback' : 'AI ranking'}.`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-brand-500">Top results:</span>
                <select
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="bg-white border border-brand-200 text-brand-700 text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2 outline-none"
                >
                  <option value={6}>6</option>
                  <option value={12}>12</option>
                  <option value={20}>20</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-brand-500">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-white border border-brand-200 text-brand-700 text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2 outline-none"
                >
                  <option value="match">Match Score (Highest)</option>
                  <option value="deadline">Deadline (Closing Soon)</option>
                  <option value="funding">Funding Amount (Highest)</option>
                  <option value="recent">Recently Updated</option>
                </select>
              </div>
            </div>

            {errorMessage && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-4">
                <span>{errorMessage}</span>
                <button onClick={() => void loadGrants(searchQuery)} className="px-3 py-1 rounded-md bg-white border border-red-200 text-red-700">
                  Retry
                </button>
              </div>
            )}

            {warningMessage && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {warningMessage}
              </div>
            )}

            <GrantList grants={sortedGrants} isLoading={isLoading} />
            
            {!isLoading && sortedGrants.length === 0 && (
              <div className="rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50 p-12 flex flex-col items-center justify-center text-center mt-4">
                <div className="bg-white p-4 rounded-full shadow-sm border border-brand-100 mb-4">
                  <Search className="w-8 h-8 text-brand-400" />
                </div>
                <h3 className="text-lg font-bold text-brand-900 mb-2">No exact matches found</h3>
                <p className="text-brand-500 max-w-sm mb-6">
                  We couldn't find any grants matching this specific profile and query. Try adjusting your research tags or broadening your search terms.
                </p>
                <button 
                  onClick={() => {
                    setSearchQuery('');
                    void loadGrants('', false);
                  }}
                  className="px-6 py-2.5 bg-white border border-brand-200 hover:border-primary-300 hover:text-primary-600 text-brand-700 font-medium rounded-lg shadow-sm transition-all"
                >
                  Clear Search & View All
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
