import { Search, Menu } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import GrantList from './GrantList.tsx';
import FilterSidebar, { type FilterState, EMPTY_FILTERS } from './FilterSidebar.tsx';
import AnimatedLogo from '../common/AnimatedLogo.tsx';
import CustomSelect from '../common/CustomSelect.tsx';
import type { ResearcherResponse } from '../../services/researcherService';
import { getDiscoveryGrants, type DiscoveryGrant } from '../../services/discoveryService';

const INR_RATE: Record<string, number> = { INR: 1, USD: 83, EUR: 90, GBP: 105, AUD: 55, CAD: 62 };

function toInr(amount: number, currency?: string): number {
  const rate = INR_RATE[(currency ?? '').toUpperCase()] ?? 0;
  return rate > 0 ? amount * rate : 0;
}

function applyFilters(grants: DiscoveryGrant[], f: FilterState): DiscoveryGrant[] {
  return grants.filter((g) => {
    if (f.grantTypes.length > 0) {
      const text = `${g.title} ${g.tags.join(' ')} ${g.description}`.toLowerCase();
      const match =
        (f.grantTypes.includes('Research Projects') && /research|project/i.test(text)) ||
        (f.grantTypes.includes('Fellowships') && /fellowship/i.test(text)) ||
        (f.grantTypes.includes('Travel Grants') && /travel/i.test(text)) ||
        (f.grantTypes.includes('Equipment / Lab') && /equipment|lab\b|instrument|apparatus/i.test(text));
      if (!match) return false;
    }

    if (f.applicantTypes.length > 0) {
      const text = `${g.eligibilityCriteria ?? ''} ${g.tags.join(' ')} ${g.description}`.toLowerCase();
      const match =
        (f.applicantTypes.includes('Early Career') && /early.?career|postdoc|young researcher|junior|early stage/i.test(text)) ||
        (f.applicantTypes.includes('Students (PhD/MSc)') && /phd|m\.?sc|student|doctoral|graduate|post.?graduate/i.test(text)) ||
        (f.applicantTypes.includes('Senior Researchers') && /senior|faculty|professor|principal investigator|\bpi\b/i.test(text)) ||
        (f.applicantTypes.includes('Startups / Industry') && /startup|industry|company|sme|enterprise|commercial/i.test(text));
      if (!match) return false;
    }

    if (f.fundingRanges.length > 0) {
      const currency = g.fundingCurrencyRaw;
      const rate = INR_RATE[(currency ?? '').toUpperCase()] ?? 0;
      if (rate > 0 && (g.fundingAmountMinRaw !== undefined || g.fundingAmountMaxRaw !== undefined)) {
        const representative = toInr(g.fundingAmountMaxRaw ?? g.fundingAmountMinRaw ?? 0, currency);
        const match =
          (f.fundingRanges.includes('< ₹5 Lakh') && representative < 500_000) ||
          (f.fundingRanges.includes('₹5L - ₹25L') && representative >= 500_000 && representative <= 2_500_000) ||
          (f.fundingRanges.includes('₹25L - ₹1 Cr') && representative > 2_500_000 && representative <= 10_000_000) ||
          (f.fundingRanges.includes('> ₹1 Cr') && representative > 10_000_000);
        if (!match) return false;
      }
    }

    if (f.deadlineRanges.length > 0 && g.deadlineRaw) {
      const deadlineMs = new Date(g.deadlineRaw).getTime();
      if (!isNaN(deadlineMs)) {
        const daysUntil = Math.ceil((deadlineMs - Date.now()) / 86_400_000);
        const match =
          (f.deadlineRanges.includes('Closing in < 30 days') && daysUntil >= 0 && daysUntil < 30) ||
          (f.deadlineRanges.includes('Closing in 1-3 months') && daysUntil >= 30 && daysUntil <= 90) ||
          (f.deadlineRanges.includes('Closing in > 3 months') && daysUntil > 90);
        if (!match) return false;
      }
    }

    return true;
  });
}

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
  const [filterState, setFilterState] = useState<FilterState>(EMPTY_FILTERS);

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
        setWarningMessage(`AI matching is currently unavailable (${aiError}), showing fallback grants from CoreBackend.`);
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
      copy.sort((a, b) => a.deadline.localeCompare(b.deadline));
    } else if (sortBy === 'funding') {
      copy.sort((a, b) => b.amount.localeCompare(a.amount));
    } else if (sortBy === 'recent') {
      copy.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    } else {
      copy.sort((a, b) => b.matchScore - a.matchScore);
    }
    return copy;
  }, [grants, sortBy]);

  const filteredGrants = useMemo(() => applyFilters(sortedGrants, filterState), [sortedGrants, filterState]);

  return (
    <div className="flex h-screen w-full overflow-hidden relative bg-gradient-to-br from-brand-50 via-white to-primary-50/30">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-brand-900/40 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className={`fixed inset-y-0 left-0 z-50 transform w-72 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } md:relative md:translate-x-0 transition-transform duration-300 ease-in-out md:block h-full shrink-0 shadow-2xl md:shadow-none`}>
        <FilterSidebar
          filters={filterState}
          onChange={setFilterState}
          onClose={() => setIsSidebarOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="px-4 md:px-8 py-4 md:py-6 bg-white/80 backdrop-blur-xl border-b border-brand-100/80 shrink-0 z-10 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-5">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="md:hidden p-2 -ml-2 text-brand-600 hover:text-brand-900 hover:bg-brand-100 rounded-lg transition-colors"
                aria-label="Open sidebar"
              >
                <Menu className="w-6 h-6" />
              </button>
              <AnimatedLogo className="w-8 h-8 md:w-10 md:h-10" />
              <div className="flex items-baseline gap-2">
                <h1 className="text-xl md:text-2xl font-bold text-brand-900 tracking-tight">FundSphere</h1>
                <span className="hidden sm:inline-block text-[10px] font-semibold uppercase tracking-widest text-primary-600 bg-primary-50 px-2 py-0.5 rounded-md border border-primary-100">Discovery</span>
              </div>
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
                className="w-full sm:pl-12 sm:pr-56 px-4 py-3 sm:py-4 bg-white border border-brand-200 rounded-xl focus:outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 text-brand-900 placeholder:text-brand-400 text-base md:text-lg transition-all shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.04)] hover:border-brand-300"
              />
              <div className="flex w-full sm:w-auto sm:absolute sm:right-2 gap-2">
                {dataSource === 'ai' && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      void loadGrants('', false);
                    }}
                    className="w-full sm:w-auto px-4 py-3 sm:py-2 bg-white text-brand-600 border border-brand-200 hover:bg-brand-50 hover:text-brand-900 hover:border-brand-300 rounded-xl sm:rounded-lg font-medium transition-all shadow-sm"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => void loadGrants(searchQuery, true)}
                  className="w-full sm:w-auto px-6 py-3 sm:py-2 bg-gradient-to-br from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-xl sm:rounded-lg font-semibold transition-all shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 active:scale-[0.97]"
                >
                  AI Match
                </button>
              </div>
            </div>

            <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-hide items-center">
              <span className="text-[10px] font-semibold text-brand-500 py-1 uppercase tracking-widest shrink-0">Suggested</span>
              <span className="h-3 w-px bg-brand-200 shrink-0" />
              {['Climate Tech Startups', 'Postdoc Healthcare Grants', 'AI in Education Fellowships'].map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setSearchQuery(tag);
                  }}
                  className="px-3 py-1.5 bg-white border border-brand-200 rounded-full text-sm text-brand-600 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50 hover:shadow-sm transition-all whitespace-nowrap shrink-0"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 sm:gap-6 mb-6">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-brand-900 tracking-tight">Top Matches for Your Profile</h2>
                <p className="text-xs md:text-sm text-brand-500 mt-1.5 tabular-nums">
                  {isLoading
                    ? 'Fetching opportunities...'
                    : <>Showing <span className="font-semibold text-brand-700">{filteredGrants.length}</span>{filteredGrants.length !== sortedGrants.length ? <> of <span className="font-semibold text-brand-700">{sortedGrants.length}</span></> : null} opportunities {dataSource && <>· <span className="text-primary-600 font-medium">{dataSource === 'core' ? 'CoreBackend fallback' : 'AI ranking'}</span></>}</>}
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-brand-500 uppercase tracking-wider hidden sm:inline-block">Top</span>
                  <CustomSelect
                    value={topK}
                    onChange={(val) => setTopK(Number(val))}
                    width="w-24"
                    options={[
                      { value: 6, label: '6' },
                      { value: 12, label: '12' },
                      { value: 20, label: '20' },
                    ]}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-brand-500 uppercase tracking-wider hidden sm:inline-block">Sort</span>
                  <CustomSelect
                    value={sortBy}
                    onChange={(val) => setSortBy(String(val))}
                    width="w-56"
                    options={[
                      { value: 'match', label: 'Match Score (Highest)' },
                      { value: 'deadline', label: 'Deadline (Closing Soon)' },
                      { value: 'funding', label: 'Funding Amount (Highest)' },
                      { value: 'recent', label: 'Recently Updated' },
                    ]}
                  />
                </div>
              </div>
            </div>

            {errorMessage && (
              <div className="mb-4 rounded-xl border border-red-200/80 bg-gradient-to-r from-red-50 to-red-50/50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-4 shadow-sm">
                <span className="font-medium">{errorMessage}</span>
                <button onClick={() => void loadGrants(searchQuery)} className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 font-medium hover:bg-red-50 transition-colors shadow-sm">
                  Retry
                </button>
              </div>
            )}

            {warningMessage && (
              <div className="mb-4 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-amber-50/50 px-4 py-3 text-sm text-amber-900 shadow-sm">
                {warningMessage}
              </div>
            )}

            <GrantList grants={filteredGrants} isLoading={isLoading} source={dataSource} />

            {!isLoading && filteredGrants.length === 0 && sortedGrants.length > 0 && (
              <div className="rounded-2xl border border-brand-200/60 bg-white/60 backdrop-blur-sm p-12 flex flex-col items-center justify-center text-center mt-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)]">
                <div className="bg-gradient-to-br from-brand-50 to-white p-5 rounded-2xl shadow-inner border border-brand-100 mb-4">
                  <Search className="w-8 h-8 text-brand-400" />
                </div>
                <h3 className="text-lg font-bold text-brand-900 mb-2 tracking-tight">No grants match your filters</h3>
                <p className="text-brand-500 max-w-sm mb-6 text-sm">
                  None of the {sortedGrants.length} loaded grants pass all selected filters. Try removing a filter or widening your criteria.
                </p>
                <button
                  onClick={() => setFilterState(EMPTY_FILTERS)}
                  className="px-6 py-2.5 bg-white border border-brand-200 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50 text-brand-700 font-semibold rounded-xl shadow-sm hover:shadow-md transition-all"
                >
                  Clear All Filters
                </button>
              </div>
            )}

            {!isLoading && sortedGrants.length === 0 && (
              <div className="rounded-2xl border border-brand-200/60 bg-white/60 backdrop-blur-sm p-12 flex flex-col items-center justify-center text-center mt-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.04)]">
                <div className="bg-gradient-to-br from-primary-50 to-white p-5 rounded-2xl shadow-inner border border-primary-100 mb-4">
                  <Search className="w-8 h-8 text-primary-400" />
                </div>
                <h3 className="text-lg font-bold text-brand-900 mb-2 tracking-tight">No exact matches found</h3>
                <p className="text-brand-500 max-w-sm mb-6 text-sm">
                  We couldn't find any grants matching this specific profile and query. Try adjusting your research tags or broadening your search terms.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    void loadGrants('', false);
                  }}
                  className="px-6 py-2.5 bg-white border border-brand-200 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50 text-brand-700 font-semibold rounded-xl shadow-sm hover:shadow-md transition-all"
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
