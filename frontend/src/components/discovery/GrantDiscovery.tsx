import { Search, Menu, SlidersHorizontal, X, ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import GrantList from './GrantList.tsx';
import FilterSidebar from './FilterSidebar.tsx';
import AnimatedLogo from '../common/AnimatedLogo.tsx';
import CustomSelect from '../common/CustomSelect.tsx';
import UserAvatarMenu from '../common/UserAvatarMenu.tsx';
import ScrollToTopButton from '../common/ScrollToTopButton.tsx';
import TopLoadingBar from '../common/TopLoadingBar.tsx';
import type { ResearcherResponse } from '../../services/researcherService';
import { fetchGrantAgencies, getDiscoveryGrants, type DiscoveryGrant } from '../../services/discoveryService';
import { applyFilters, countActiveFilters, EMPTY_FILTERS, grantInrAmount, type FilterState } from '../../utils/grantFilters';

/**
 * Sort key for "deadline (closing soonest)" on AI results. Grants without a
 * parsable deadline sink to the bottom; past deadlines also bury after
 * future ones so the user always sees actionable rows first. The server
 * sorts the browse list the same way.
 */
function deadlineMs(g: DiscoveryGrant): number {
  if (!g.deadlineRaw) return Number.POSITIVE_INFINITY;
  const t = new Date(g.deadlineRaw).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  if (t < Date.now()) return t + 1e15;
  return t;
}

interface GrantDiscoveryProps {
  researcher: ResearcherResponse | null;
}

export default function GrantDiscovery({ researcher }: GrantDiscoveryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [aiTopK, setAiTopK] = useState<number>(12);
  const [pageSize, setPageSize] = useState(12);
  const [page, setPage] = useState(0);
  const [pagination, setPagination] = useState({
    page: 0,
    size: 12,
    totalElements: 0,
    totalPages: 0,
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const mainScrollRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [grants, setGrants] = useState<DiscoveryGrant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'ai' | 'core' | null>(null);
  const [filterState, setFilterState] = useState<FilterState>(EMPTY_FILTERS);
  const [showClosed, setShowClosed] = useState(false);
  const [agencies, setAgencies] = useState<string[]>([]);
  // Only the newest load may update the list, so a slow response to an
  // older filter change can't replace newer results.
  const loadSeq = useRef(0);

  const loadGrants = async (queryOverride?: string, useRerank = false, pageOverride = page) => {
    if (!researcher) {
      setErrorMessage('Researcher profile is missing. Please complete onboarding first.');
      setGrants([]);
      return;
    }

    const seq = ++loadSeq.current;
    setIsLoading(true);
    setErrorMessage(null);
    setWarningMessage(null);

    try {
      const { grants: fetchedGrants, source, aiError, pagination: fetchedPagination } = await getDiscoveryGrants({
        userQuery: queryOverride ?? searchQuery,
        topK: aiTopK,
        useRerank,
        page: pageOverride,
        pageSize,
        sortBy,
        filters: filterState,
        includeClosed: showClosed,
      });
      if (seq !== loadSeq.current) return;
      setGrants(fetchedGrants);
      setDataSource(source);
      setPagination(fetchedPagination ?? {
        page: 0,
        size: fetchedGrants.length,
        totalElements: fetchedGrants.length,
        totalPages: fetchedGrants.length > 0 ? 1 : 0,
      });
      if (source === 'core' && fetchedPagination) {
        setPage(fetchedPagination.page);
      }

      if (useRerank && source === 'core' && aiError) {
        setWarningMessage(`AI matching is currently unavailable (${aiError}), showing fallback grants from CoreBackend.`);
      }
    } catch (error) {
      if (seq !== loadSeq.current) return;
      setGrants([]);
      setDataSource(null);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load grants.');
    } finally {
      if (seq === loadSeq.current) setIsLoading(false);
    }
  };

  // Initial load (and on profile change): fetch the unranked browse list.
  useEffect(() => {
    setPage(0);
    void loadGrants('', false, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [researcher]);

  // Browse page-size changes restart at page 1 because the old page number
  // may no longer point at the same result range.
  useEffect(() => {
    if (dataSource === 'core') {
      setPage(0);
      void loadGrants(searchQuery, false, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  // AI result-count changes re-run AI ranking. Browse pagination is not
  // affected by this control.
  useEffect(() => {
    if (dataSource === 'ai') {
      void loadGrants(searchQuery, true, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiTopK]);

  useEffect(() => {
    if (dataSource === 'core') {
      setPage(0);
      void loadGrants(searchQuery, false, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy]);

  // In browse mode the server applies the filters and the closed-grants
  // switch across every page, so a change reloads from page 1. AI results
  // are filtered in place below.
  useEffect(() => {
    if (dataSource === 'core') {
      setPage(0);
      void loadGrants(searchQuery, false, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterState, showClosed]);

  // The agency filter lists every agency, not just the ones on this page.
  useEffect(() => {
    let cancelled = false;
    fetchGrantAgencies(showClosed)
      .then((list) => !cancelled && setAgencies(list))
      .catch(() => !cancelled && setAgencies([]));
    return () => {
      cancelled = true;
    };
  }, [showClosed]);

  // Clamp AI result count to the normal AI cap when transitioning into AI
  // mode. The "All" sentinel (Infinity) is allowed through; the backend caps
  // it at 50.
  useEffect(() => {
    if (dataSource === 'ai' && Number.isFinite(aiTopK) && aiTopK > 20) {
      setAiTopK(20);
    }
    if (dataSource === 'ai') {
      setSortBy('match');
    } else if (sortBy === 'match') {
      setSortBy('recent');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource]);

  // Global keyboard shortcuts: Ctrl/Cmd + K or '/' to jump to the search box
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't yank focus to the search box from behind an open dialog.
      if (document.querySelector('[aria-modal="true"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // The server sorts and filters the browse list; AI results are sorted
  // and filtered here, with the same rules.
  const sortedGrants = useMemo(() => {
    if (dataSource === 'core') return grants;
    const copy = [...grants];
    if (sortBy === 'deadline') {
      copy.sort((a, b) => deadlineMs(a) - deadlineMs(b));
    } else if (sortBy === 'funding') {
      // Sort on raw INR-normalized amounts, not the formatted string.
      copy.sort((a, b) => (grantInrAmount(b) ?? -1) - (grantInrAmount(a) ?? -1));
    } else if (sortBy === 'recent') {
      copy.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    } else {
      copy.sort((a, b) => b.matchScore - a.matchScore);
    }
    return copy;
  }, [grants, sortBy, dataSource]);

  const filteredGrants = useMemo(
    () => (dataSource === 'core' ? sortedGrants : applyFilters(sortedGrants, filterState, showClosed)),
    [dataSource, sortedGrants, filterState, showClosed],
  );

  // Searchable Funding Agency filter in the sidebar: every agency when
  // browsing, the agencies in the results for AI ranking.
  const availableFunders = useMemo(() => {
    if (dataSource !== 'ai' && agencies.length > 0) return agencies;
    const set = new Set<string>();
    grants.forEach((g) => {
      if (g.funder && g.funder !== 'Unknown Agency') set.add(g.funder);
    });
    return Array.from(set);
  }, [dataSource, agencies, grants]);

  // Nothing to show because of the filters or the closed-grants switch,
  // rather than because there are no grants at all.
  const narrowedAway = dataSource === 'core'
    ? countActiveFilters(filterState) > 0 || !showClosed
    : sortedGrants.length > 0;

  // Browse mode is already paginated by the backend. AI mode may still use
  // the local slice when "All" is not selected.
  const displayedGrants = useMemo(
    () => dataSource === 'core' ? filteredGrants : filteredGrants.slice(0, aiTopK),
    [dataSource, filteredGrants, aiTopK],
  );

  const canGoPrevious = dataSource === 'core' && page > 0 && !isLoading;
  const canGoNext = dataSource === 'core' && page + 1 < pagination.totalPages && !isLoading;

  const goToPage = (nextPage: number) => {
    const lastPage = Math.max(pagination.totalPages - 1, 0);
    const safePage = Math.max(0, Math.min(nextPage, lastPage));
    setPage(safePage);
    void loadGrants(searchQuery, false, safePage);
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex h-screen w-full overflow-hidden relative bg-brand-50">
      <TopLoadingBar visible={isLoading} />

      {/* Pinned to viewport but listens to main's internal scroll. The
          RootLayout's window-scroll button never shows here because the
          window itself doesn't scroll on /discovery. */}
      <ScrollToTopButton scrollTarget={mainScrollRef} positionClassName="fixed bottom-6 right-6 md:right-26" />

      {researcher && (
        <div className="md:hidden absolute top-4 right-4 z-50">
          <UserAvatarMenu researcherId={researcher.id} />
        </div>
      )}

      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-brand-900/40 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className={`fixed inset-y-0 left-0 z-50 transform w-72 ${
        isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
      } md:relative md:translate-x-0 transition-transform duration-300 ease-in-out md:block h-full shrink-0 md:shadow-none`}>
        <FilterSidebar
          filters={filterState}
          onChange={setFilterState}
          onClose={() => setIsSidebarOpen(false)}
          availableFunders={availableFunders}
        />
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Search header: 64px on desktop, matching the sidebar and nav rail top rows */}
        <header className="px-4 md:px-8 py-3 md:py-0 md:h-16 md:flex md:items-center bg-white border-b border-brand-200 shrink-0 z-10">
          <div className="w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto">
            <div
              className={`md:hidden flex items-center gap-3 mb-4 transition-opacity duration-200 ${
                isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              aria-hidden={isSidebarOpen}
            >
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 -ml-2 text-brand-600 hover:text-brand-900 hover:bg-brand-100 rounded-lg transition-colors"
                aria-label="Open sidebar"
              >
                <Menu className="w-6 h-6" />
              </button>
              <AnimatedLogo className="w-8 h-8" />
              <div className="flex items-baseline gap-2">
                <h1 className="text-xl font-bold tracking-tight">
                  <span className="text-primary-600">Fund</span>
                  <span className="text-brand-900">Sphere</span>
                </h1>
              </div>
            </div>

            <div className="relative flex flex-col sm:flex-row items-center w-full group gap-2 sm:gap-0">
              <div className="hidden sm:block absolute left-4 text-brand-500 group-focus-within:text-primary-500 transition-colors z-10">
                <Search className="w-5 h-5" />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Describe your research, then hit AI Match"
                maxLength={2000}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setPage(0);
                    void loadGrants(searchQuery, true, 0);
                  }
                }}
                className="w-full sm:pl-11 sm:pr-56 px-4 py-2 bg-white border border-brand-300 rounded-lg focus:outline-none focus:border-primary-600 focus:ring-3 focus:ring-primary-600/15 text-brand-900 placeholder:text-brand-500 text-sm md:text-base transition-colors hover:border-brand-400"
              />
              {!searchQuery && (
                <div className="hidden md:flex items-center gap-1 absolute right-36 sm:right-40 pointer-events-none text-[11px] font-medium text-brand-500 bg-brand-50 border border-brand-200 px-1.5 py-0.5 rounded">
                  <kbd className="font-sans">Ctrl</kbd>
                  <span>K</span>
                </div>
              )}
              <div className="flex w-full sm:w-auto sm:absolute sm:right-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setPage(0);
                    void loadGrants('', false, 0);
                  }}
                  aria-hidden={dataSource !== 'ai'}
                  tabIndex={dataSource === 'ai' ? 0 : -1}
                  className={`w-full sm:w-auto px-3 py-2 sm:py-1.5 text-sm bg-white text-brand-600 border border-brand-200 hover:bg-brand-50 hover:text-brand-900 hover:border-brand-300 rounded-lg font-medium transition-opacity shadow-xs ${
                    dataSource === 'ai'
                      ? 'opacity-100 pointer-events-auto'
                      : 'opacity-0 pointer-events-none'
                  }`}
                >
                  Clear
                </button>
                <button
                  onClick={() => {
                    setPage(0);
                    void loadGrants(searchQuery, true, 0);
                  }}
                  disabled={isLoading}
                  className="w-full sm:w-auto px-5 py-2 sm:py-1.5 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-semibold transition-colors shadow-xs active:scale-[0.97] flex items-center justify-center gap-1.5 disabled:opacity-85 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isLoading && dataSource === 'ai' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Matching...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>AI Match</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Feed Container: Widescreen Responsive & Compact Vertical Padding */}
        <main
          ref={mainScrollRef}
          className="flex-1 overflow-y-auto px-4 md:px-8 pt-4 md:pt-5 pb-4 md:pb-8 relative overscroll-contain"
        >
          <div className="max-w-4xl xl:max-w-5xl 2xl:max-w-6xl mx-auto">
            <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide items-center">
              <span className="text-xs font-semibold text-brand-600 shrink-0">Suggested</span>
              <span className="h-3 w-px bg-brand-300 shrink-0" />
              {[
                'SERB CRG',
                'INSPIRE Faculty',
                'BIRAC BIG',
                'DST Climate',
                'ICMR Adhoc',
                'Women in Science (WOS-A)',
              ].map((tag) => {
                const isActive = dataSource === 'ai' && searchQuery === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    disabled={isLoading}
                    aria-pressed={isActive}
                    onClick={() => {
                      // Fill the box AND run the match: a chip that only
                      // pre-fills the input reads as broken.
                      setSearchQuery(tag);
                      setPage(0);
                      void loadGrants(tag, true, 0);
                    }}
                    className={`px-2.5 py-1 border rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-wait disabled:opacity-60 ${
                      isActive
                        ? 'bg-primary-600 border-primary-600 text-white'
                        : 'bg-white border-brand-300 text-brand-800 hover:border-primary-500 hover:text-primary-700'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 sm:gap-4 mb-3">
              <div>
                <p className="text-xs md:text-sm text-brand-600 tabular-nums">
                  {isLoading
                    ? 'Fetching opportunities...'
                    : dataSource === 'core'
                      ? <>Showing <span className="font-semibold text-brand-900">{displayedGrants.length}</span> of <span className="font-semibold text-brand-900">{pagination.totalElements}</span> {showClosed ? '' : 'open '}opportunities</>
                      : <>Showing <span className="font-semibold text-brand-900">{displayedGrants.length}</span>{displayedGrants.length !== filteredGrants.length ? <> of <span className="font-semibold text-brand-900">{filteredGrants.length}</span></> : null} {showClosed ? '' : 'open '}opportunities {dataSource === 'ai' && <>· <span className="text-primary-600 font-medium">AI ranking</span></>}</>}
                </p>
              </div>

              <div className="flex items-center gap-3 sm:gap-3.5 flex-wrap">
                <button
                  type="button"
                  role="switch"
                  aria-checked={showClosed}
                  onClick={() => setShowClosed((v) => !v)}
                  className="inline-flex items-center gap-2 h-7.5 text-xs font-medium text-brand-600 hover:text-brand-900 transition-colors"
                >
                  <span className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${showClosed ? 'bg-primary-600' : 'bg-brand-300'}`}>
                    <span className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow-xs transition-transform ${showClosed ? 'translate-x-3' : ''}`} />
                  </span>
                  Show closed
                </button>

                <div className="flex items-center gap-1.5 h-7.5">
                  <span className="text-xs font-medium text-brand-500 hidden sm:inline-block leading-none">
                    {dataSource === 'core' ? 'Per page' : 'Show'}
                  </span>
                  <CustomSelect
                    value={dataSource === 'ai' ? aiTopK : pageSize}
                    onChange={(val) => {
                      if (dataSource === 'ai') {
                        setAiTopK(Number(val));
                      } else {
                        setPageSize(Number(val));
                      }
                    }}
                    width="w-[66px]"
                    size="sm"
                    options={
                      dataSource === 'ai'
                        ? [
                            { value: 6, label: '6' },
                            { value: 12, label: '12' },
                            { value: 20, label: '20' },
                            { value: Infinity, label: 'All' },
                          ]
                        : [
                            { value: 6, label: '6' },
                            { value: 12, label: '12' },
                            { value: 20, label: '20' },
                            { value: 50, label: '50' },
                          ]
                    }
                  />
                </div>

                <div className="flex items-center gap-1.5 h-7.5">
                  <span className="text-xs font-medium text-brand-500 hidden sm:inline-block leading-none">Sort</span>
                  <CustomSelect
                    value={sortBy}
                    onChange={(val) => setSortBy(String(val))}
                    width="w-[155px]"
                    size="sm"
                    options={[
                      ...(dataSource === 'ai' ? [{ value: 'match', label: 'Match Score' }] : []),
                      { value: 'deadline', label: 'Closing Soon' },
                      { value: 'funding', label: 'Highest Amount' },
                      { value: 'recent', label: 'Recently Updated' },
                    ]}
                  />
                </div>
              </div>
            </div>

            {errorMessage && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-4 shadow-sm">
                <span className="font-medium">{errorMessage}</span>
                <button onClick={() => void loadGrants(searchQuery, dataSource === 'ai', page)} className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-700 font-medium hover:bg-red-50 transition-colors shadow-sm">
                  Retry
                </button>
              </div>
            )}

            {warningMessage && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
                {warningMessage}
              </div>
            )}

            <GrantList grants={displayedGrants} isLoading={isLoading} source={dataSource} profile={researcher} />

            {dataSource === 'core' && pagination.totalPages > 1 && (
              <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-lg border border-brand-200 bg-white px-4 py-3 shadow-xs">
                <p className="text-sm text-brand-500 tabular-nums">
                  Page <span className="font-semibold text-brand-800">{page + 1}</span> of{' '}
                  <span className="font-semibold text-brand-800">{pagination.totalPages}</span>
                  <span className="hidden sm:inline"> · {pagination.size} per page</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canGoPrevious}
                    onClick={() => goToPage(page - 1)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-brand-200 bg-white text-sm font-semibold text-brand-700 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50 disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-brand-700 disabled:hover:border-brand-200 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!canGoNext}
                    onClick={() => goToPage(page + 1)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-brand-200 bg-white text-sm font-semibold text-brand-700 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50 disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-brand-700 disabled:hover:border-brand-200 transition-colors"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {!isLoading && !errorMessage && displayedGrants.length === 0 && narrowedAway && (
              <FilteredEmptyState
                filters={filterState}
                closedHidden={!showClosed}
                onShowClosed={() => setShowClosed(true)}
                onRemoveFilter={(key, value) =>
                  setFilterState({ ...filterState, [key]: filterState[key].filter((v) => v !== value) })
                }
                onClearAll={() => setFilterState(EMPTY_FILTERS)}
              />
            )}

            {!isLoading && !errorMessage && displayedGrants.length === 0 && !narrowedAway && (
              <NoResultsEmptyState
                searchQuery={searchQuery}
                onClearSearch={() => {
                  setSearchQuery('');
                  setPage(0);
                  void loadGrants('', false, 0);
                }}
                onSelectSuggestion={(sug) => {
                  setSearchQuery(sug);
                  setPage(0);
                  void loadGrants(sug, true, 0);
                }}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

const FILTER_LABELS: Record<keyof FilterState, string> = {
  grantTypes: 'Type',
  applicantTypes: 'Applicant',
  fundingRanges: 'Funding',
  deadlineRanges: 'Deadline',
  funders: 'Agency',
};

function FilteredEmptyState({
  filters,
  closedHidden,
  onShowClosed,
  onRemoveFilter,
  onClearAll,
}: {
  filters: FilterState;
  closedHidden: boolean;
  onShowClosed: () => void;
  onRemoveFilter: (key: keyof FilterState, value: string) => void;
  onClearAll: () => void;
}) {
  const activeChips: Array<{ key: keyof FilterState; value: string }> = (
    Object.keys(filters) as Array<keyof FilterState>
  ).flatMap((key) => filters[key].map((value) => ({ key, value })));
  const filtered = activeChips.length > 0;

  return (
    <div className="rounded-xl border border-brand-200 bg-white p-10 flex flex-col items-center justify-center text-center mt-4 shadow-medium">
      <div className="bg-brand-50 p-5 rounded-xl border border-brand-100 mb-4">
        <SlidersHorizontal className="w-8 h-8 text-brand-500" />
      </div>
      <h3 className="text-lg font-bold text-brand-900 mb-2 tracking-tight">
        {filtered ? 'No grants match your filters' : 'No open grants right now'}
      </h3>
      <p className="text-brand-500 max-w-md mb-5 text-sm">
        {filtered
          ? `Remove a filter to widen your results${closedHidden ? ', or include closed grants' : ''}:`
          : 'All the grants here have closed. Show closed grants to see past calls.'}
      </p>
      {filtered && (
        <div className="flex flex-wrap gap-2 justify-center max-w-xl mb-6">
          {activeChips.map(({ key, value }) => (
            <button
              key={`${key}-${value}`}
              type="button"
              onClick={() => onRemoveFilter(key, value)}
              className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-brand-200 text-brand-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700 transition-all shadow-sm"
              aria-label={`Remove ${FILTER_LABELS[key]} filter ${value}`}
            >
              <span className="text-xs text-brand-500 group-hover:text-red-400 font-medium">
                {FILTER_LABELS[key]}
              </span>
              <span>{value}</span>
              <X className="w-3 h-3 opacity-50 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-3 justify-center">
        {closedHidden && (
          <button
            onClick={onShowClosed}
            className="px-6 py-2.5 bg-white border border-brand-200 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50 text-brand-700 font-semibold rounded-lg shadow-xs transition-colors text-sm"
          >
            Show closed grants
          </button>
        )}
        {filtered && (
          <button
            onClick={onClearAll}
            className="px-6 py-2.5 bg-white border border-brand-200 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50 text-brand-700 font-semibold rounded-lg shadow-xs transition-colors text-sm"
          >
            Clear all filters
          </button>
        )}
      </div>
    </div>
  );
}

function NoResultsEmptyState({
  searchQuery,
  onClearSearch,
  onSelectSuggestion,
}: {
  searchQuery: string;
  onClearSearch: () => void;
  onSelectSuggestion?: (query: string) => void;
}) {
  const suggestions = [
    'Artificial Intelligence & Deep Learning',
    'Cancer Diagnostics & Therapeutics',
    'Climate Change & Agriculture',
    'Renewable Energy & Battery Storage',
    'Postdoctoral Fellowship',
  ];

  return (
    <div className="rounded-xl border border-brand-200 bg-white p-10 sm:p-12 flex flex-col items-center justify-center text-center mt-4 shadow-medium">
      <div className="bg-primary-50 p-5 rounded-xl border border-primary-200 mb-4">
        <Search className="w-8 h-8 text-primary-400" />
      </div>
      <h3 className="text-lg font-bold text-brand-900 mb-2 tracking-tight">
        No grants found
      </h3>
      <p className="text-brand-500 max-w-md mb-5 text-sm">
        {searchQuery
          ? <>Nothing matched <span className="font-semibold text-brand-700">"{searchQuery}"</span>. Try a broader search or choose one of the suggested fields below:</>
          : <>We couldn't find any grants right now. Try the AI Match button with a description of your research.</>
        }
      </p>

      {onSelectSuggestion && (
        <div className="flex flex-wrap gap-2 justify-center max-w-lg mb-6">
          {suggestions.map((sug) => (
            <button
              key={sug}
              type="button"
              onClick={() => onSelectSuggestion(sug)}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-brand-200 text-brand-700 hover:border-primary-400 hover:text-primary-700 hover:bg-primary-50 transition-all shadow-xs flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary-500" />
              <span>{sug}</span>
            </button>
          ))}
        </div>
      )}

      {searchQuery && (
        <button
          onClick={onClearSearch}
          className="px-6 py-2.5 bg-white border border-brand-200 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50 text-brand-700 font-semibold rounded-lg shadow-xs transition-colors text-sm"
        >
          Clear search & view all
        </button>
      )}
    </div>
  );
}
