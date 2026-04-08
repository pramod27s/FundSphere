import { Search, Sparkles, Menu } from 'lucide-react';
import { useState } from 'react';
import GrantList from './GrantList.tsx';
import FilterSidebar from './FilterSidebar.tsx';
import AnimatedLogo from '../common/AnimatedLogo.tsx';

export default function GrantDiscovery() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("match");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-brand-50 w-full overflow-hidden relative">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar (Filters) */}
      <div className={`fixed inset-y-0 left-0 z-50 transform w-72 bg-white ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } md:relative md:translate-x-0 transition-transform duration-300 ease-in-out md:block h-full shrink-0 shadow-2xl md:shadow-none`}>
        <FilterSidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Search Header */}
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
              <h1 className="text-xl md:text-2xl font-bold text-brand-900">
                FundSphere
              </h1>
            </div>
            
            {/* Search Bar */}
            <div className="relative flex flex-col sm:flex-row items-center w-full group gap-2 sm:gap-0">
              <div className="hidden sm:block absolute left-4 text-brand-400 group-focus-within:text-primary-500 transition-colors z-10">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder="Describe your research project..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:pl-12 sm:pr-32 px-4 py-3 sm:py-4 bg-brand-50 border-2 border-brand-100 rounded-xl focus:outline-none focus:border-primary-500 focus:bg-white text-brand-900 placeholder:text-brand-400 text-base md:text-lg transition-all shadow-sm"
              />
              <button className="w-full sm:w-auto sm:absolute sm:right-2 sm:px-6 py-3 sm:py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl sm:rounded-lg font-medium transition-colors shadow-md shadow-primary-500/20 active:scale-95">
                AI Match
              </button>
            </div>
            
            {/* Suggested Queries */}
            <div className="flex gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide">
              <span className="text-xs font-semibold text-brand-500 py-1.5 uppercase tracking-wider">Suggested:</span>
              {["Climate Tech Startups", "Postdoc Healthcare Grants", "AI in Education Fellowships"].map(tag => (
                <button 
                  key={tag}
                  onClick={() => setSearchQuery(tag)}
                  className="px-3 py-1.5 bg-white border border-brand-200 rounded-full text-sm text-brand-600 hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition-colors whitespace-nowrap"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Grant Feed Container */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 sm:gap-0 mb-6">
              <div>
                <h2 className="text-lg md:text-xl font-semibold text-brand-800">Top Matches for Your Profile</h2>
                <p className="text-xs md:text-sm text-brand-500 mt-1">Found 124 opportunities based on hybrid semantic search.</p>
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
                  <option value="recent">Recently Added</option>
                </select>
              </div>
            </div>

            {/* AI Reasoning Summary Banner */}
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 mb-6 flex gap-4">
              <div className="bg-white p-2 rounded-lg text-primary-600 shadow-sm border border-primary-100 h-fit">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-medium text-primary-900 mb-1">AI Reasoning Summary</h4>
                <p className="text-sm text-primary-800/80 leading-relaxed">
                  We found grants strongly matching your background in <span className="font-semibold text-primary-900">Machine Learning</span> and <span className="font-semibold text-primary-900">Healthcare</span>. Specifically prioritizing grants welcoming Early Career Researchers in India.
                </p>
              </div>
            </div>

            {/* Grant List */}
            <GrantList />
          </div>
        </main>
      </div>
    </div>
  );
}
