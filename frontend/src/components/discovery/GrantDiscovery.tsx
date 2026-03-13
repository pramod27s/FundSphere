import { Search, Sparkles } from 'lucide-react';
import { useState } from 'react';
import GrantList from './GrantList.tsx';
import FilterSidebar from './FilterSidebar.tsx';
import AnimatedLogo from '../common/AnimatedLogo.tsx';

export default function GrantDiscovery() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("match");

  return (
    <div className="flex h-screen bg-brand-50 w-full overflow-hidden">
      {/* Left Sidebar (Filters) */}
      <FilterSidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Search Header */}
        <header className="px-8 py-6 bg-white border-b border-brand-100 shrink-0 z-10">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <AnimatedLogo className="w-10 h-10" />
              <h1 className="text-2xl font-bold text-brand-900">
                FundSphere
              </h1>
            </div>
            
            {/* Search Bar */}
            <div className="relative flex items-center w-full group">
              <div className="absolute left-4 text-brand-400 group-focus-within:text-primary-500 transition-colors">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder="Describe your research project, e.g. 'Machine learning models for early cancer detection...'"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-32 py-4 bg-brand-50 border-2 border-brand-100 rounded-xl focus:outline-none focus:border-primary-500 focus:bg-white text-brand-900 placeholder:text-brand-400 text-lg transition-all shadow-sm"
              />
              <button className="absolute right-2 px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors shadow-md shadow-primary-500/20 active:scale-95">
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
        <main className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-end mb-6">
              <div>
                <h2 className="text-lg font-semibold text-brand-800">Top Matches for Your Profile</h2>
                <p className="text-sm text-brand-500 mt-1">Found 124 opportunities based on hybrid semantic search.</p>
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
