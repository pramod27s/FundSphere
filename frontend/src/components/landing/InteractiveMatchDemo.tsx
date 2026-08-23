import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  ShieldCheck, 
  Calendar, 
  ChevronRight, 
  Bookmark, 
  BookmarkCheck,
  Check,
  Zap,
  SlidersHorizontal,
  Layers,
  Clock
} from 'lucide-react';

interface Persona {
  id: string;
  name: string;
  role: string;
  institution: string;
  badge: string;
  researchFocus: string;
  grant: {
    id: number;
    title: string;
    funder: string;
    grantType: string;
    amount: string;
    deadlineLabel: string;
    deadlineTone: 'normal' | 'warn' | 'urgent';
    lastVerified: string;
    matchScore: number;
    eligibility: 'Eligible' | 'Check Eligibility';
    tags: string[];
    rationale: string;
    signals: {
      semantic: number;
      eligibility: number;
      keyword: number;
      fundingFit: number;
      deadline: number;
    };
    criteria: Array<{
      label: string;
      verdict: 'match' | 'warn';
      detail: string;
    }>;
  };
}

const PERSONAS: Persona[] = [
  {
    id: 'bio-postdoc',
    name: 'Dr. Elena Rostova',
    role: 'Postdoctoral Fellow in Oncology',
    institution: 'Stanford School of Medicine',
    badge: 'Early Career',
    researchFocus: 'Targeted mRNA nanocarriers for drug-resistant triple-negative breast cancer immunotherapy.',
    grant: {
      id: 101,
      title: 'NIH NCI Early-Stage Investigator R01 Innovator Award in Immuno-Oncology',
      funder: 'NIH / NCI',
      grantType: 'Research Project Grant (R01)',
      amount: '$1,250,000 ($250k / yr)',
      deadlineLabel: '52 days left (Oct 15, 2026)',
      deadlineTone: 'normal',
      lastVerified: 'Verified 2 days ago',
      matchScore: 96,
      eligibility: 'Eligible',
      tags: ['Oncology', 'mRNA Therapeutics', 'Early Stage Investigator', 'Immunotherapy'],
      rationale: 'Exceptional semantic alignment with NCI immuno-oncology priorities. The candidate meets all Early-Stage Investigator (ESI) window criteria (<5 yrs post-PhD). mRNA targeted delivery directly fulfills Section 4.2 priority areas.',
      signals: {
        semantic: 98,
        eligibility: 100,
        keyword: 92,
        fundingFit: 95,
        deadline: 94,
      },
      criteria: [
        { label: 'Field of Research', verdict: 'match', detail: 'Direct match with NCI cancer immunotherapy focus vector' },
        { label: 'Degree Requirement', verdict: 'match', detail: 'PhD completed in 2023 (satisfies post-doc qualification)' },
        { label: 'Career Stage Window', verdict: 'match', detail: 'ESI status (<5 yrs post-PhD) satisfies eligibility rules' },
        { label: 'Budget Request', verdict: 'match', detail: 'Proposed direct cost conforms with standard $250k/yr slab' },
      ],
    },
  },
  {
    id: 'cleantech-startup',
    name: 'Aravind Swaminathan',
    role: 'Co-Founder & CTO',
    institution: 'Aetheris CleanTech Labs',
    badge: 'DeepTech Startup',
    researchFocus: 'High-temperature solid oxide electrolyzers for low-cost green hydrogen generation at industrial scale.',
    grant: {
      id: 102,
      title: 'SERB-DST DeepTech Energy Transition & National Green Hydrogen Mission',
      funder: 'SERB / DST',
      grantType: 'Commercialization Grant',
      amount: '₹1.85 Crore ($220k)',
      deadlineLabel: '98 days left (Nov 30, 2026)',
      deadlineTone: 'normal',
      lastVerified: 'Verified 1 day ago',
      matchScore: 92,
      eligibility: 'Eligible',
      tags: ['Green Hydrogen', 'Electrolyzers', 'CleanTech', 'DPIIT Startup'],
      rationale: 'Strong alignment with National Green Hydrogen Mission directives. DPIIT startup status satisfies consortium eligibility. Direct match with high-yield electrolyzer R&D parameters.',
      signals: {
        semantic: 94,
        eligibility: 90,
        keyword: 95,
        fundingFit: 90,
        deadline: 91,
      },
      criteria: [
        { label: 'Domain & Themes', verdict: 'match', detail: 'Matches "Green Hydrogen", "CleanTech", and "Electrolyzers"' },
        { label: 'Applicant Eligibility', verdict: 'match', detail: 'Recognized DPIIT startup satisfies commercialization track' },
        { label: 'Budget Fit', verdict: 'match', detail: '₹1.85 Cr falls safely within the ₹2 Cr max allocated ceiling' },
        { label: 'Consortium Model', verdict: 'match', detail: 'Allows startup-led applied research and prototype trials' },
      ],
    },
  },
  {
    id: 'ai-quantum',
    name: 'Prof. Marcus Thorne',
    role: 'Associate Professor of Computer Science',
    institution: 'ETH Zürich / Cambridge',
    badge: 'Tenured PI',
    researchFocus: 'Fault-tolerant quantum error mitigation algorithms on NISQ hardware architectures.',
    grant: {
      id: 103,
      title: 'Horizon Europe ERC Consolidator Grant in Quantum Error Mitigation',
      funder: 'Horizon Europe (ERC)',
      grantType: 'Consolidator Grant',
      amount: '€2,000,000 (5 Years)',
      deadlineLabel: 'Closing soon (28 days left)',
      deadlineTone: 'warn',
      lastVerified: 'Verified today',
      matchScore: 95,
      eligibility: 'Eligible',
      tags: ['Quantum Computing', 'NISQ Architecture', 'Horizon Europe', 'ERC'],
      rationale: 'Direct match for the ERC 7-12 years post-PhD tenure bracket. Research proposal keywords match Horizon Europe Quantum Flagship Pillar 2 objectives with zero eligibility conflicts.',
      signals: {
        semantic: 96,
        eligibility: 100,
        keyword: 94,
        fundingFit: 96,
        deadline: 88,
      },
      criteria: [
        { label: 'Consolidator Window', verdict: 'match', detail: '8 years post-PhD precisely fits ERC 7-12 yrs window' },
        { label: 'EU Flagship Alignment', verdict: 'match', detail: 'NISQ error mitigation directly matches Pillar 2 priority' },
        { label: 'Institutional Track', verdict: 'match', detail: 'Host institution qualifies under Horizon Europe framework' },
        { label: 'Funding Slab', verdict: 'match', detail: '€2.0M requested conforms with max allowable threshold' },
      ],
    },
  },
];

export default function InteractiveMatchDemo() {
  const [selectedId, setSelectedId] = useState<string>('bio-postdoc');
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [showSignals, setShowSignals] = useState<boolean>(false);

  const persona = PERSONAS.find((p) => p.id === selectedId) ?? PERSONAS[0];
  const grant = persona.grant;

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
      
      {/* 1. Persona Switcher Header */}
      <div className="bg-white border border-brand-200/80 rounded-2xl p-4 sm:p-5 shadow-soft">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary-600 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Researcher Profile Selector
            </span>
            <p className="text-xs text-brand-500 mt-0.5">
              Select a persona to see how the dashboard ranks, explains, and renders the match:
            </p>
          </div>
          <button
            onClick={() => setShowSignals(!showSignals)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 shrink-0 ${
              showSignals 
                ? 'bg-primary-50 text-primary-700 border-primary-300' 
                : 'bg-white text-brand-600 border-brand-200 hover:bg-brand-50'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-primary-600" />
            <span>{showSignals ? 'Hide Scoring Signals' : 'View 5-Signal Breakdown'}</span>
          </button>
        </div>

        {/* Persona Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {PERSONAS.map((p) => {
            const isSelected = p.id === selectedId;
            return (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedId(p.id);
                  setIsSaved(false);
                }}
                className={`text-left p-3 rounded-xl border transition-all text-xs ${
                  isSelected
                    ? 'bg-primary-50/80 border-primary-400 text-brand-900 shadow-sm ring-1 ring-primary-400/30'
                    : 'bg-white border-brand-200/70 hover:border-brand-300 text-brand-700 hover:bg-brand-50/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                    isSelected ? 'bg-primary-100 text-primary-800' : 'bg-brand-100 text-brand-600'
                  }`}>
                    {p.badge}
                  </span>
                  {isSelected && <Zap className="w-3.5 h-3.5 text-primary-600 fill-primary-600" />}
                </div>
                <div className="font-bold text-brand-900 truncate">{p.name}</div>
                <div className="text-[11px] text-brand-500 truncate">{p.role}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Optional 5-Signal Weights Panel */}
      <AnimatePresence>
        {showSignals && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-white border border-primary-200 rounded-2xl p-5 shadow-soft">
              <div className="flex items-center justify-between text-xs font-bold text-brand-800 mb-3 pb-2 border-b border-brand-100">
                <span className="flex items-center gap-1.5 text-primary-700">
                  <Layers className="w-4 h-4 text-primary-600" />
                  Calibrated Scoring Vector Weights (0–100%)
                </span>
                <span className="text-[11px] text-brand-500 font-normal">Cross-Encoder & RRF Active</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs">
                <div className="bg-brand-50 p-2.5 rounded-xl border border-brand-200/60">
                  <div className="flex justify-between text-[11px] text-brand-600 mb-1">
                    <span>Semantic (35%)</span>
                    <span className="font-bold text-primary-700">{grant.signals.semantic}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-brand-200 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-600 rounded-full" style={{ width: `${grant.signals.semantic}%` }} />
                  </div>
                </div>

                <div className="bg-brand-50 p-2.5 rounded-xl border border-brand-200/60">
                  <div className="flex justify-between text-[11px] text-brand-600 mb-1">
                    <span>Eligibility (25%)</span>
                    <span className="font-bold text-emerald-700">{grant.signals.eligibility}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-brand-200 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${grant.signals.eligibility}%` }} />
                  </div>
                </div>

                <div className="bg-brand-50 p-2.5 rounded-xl border border-brand-200/60">
                  <div className="flex justify-between text-[11px] text-brand-600 mb-1">
                    <span>Keywords (15%)</span>
                    <span className="font-bold text-cyan-700">{grant.signals.keyword}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-brand-200 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-600 rounded-full" style={{ width: `${grant.signals.keyword}%` }} />
                  </div>
                </div>

                <div className="bg-brand-50 p-2.5 rounded-xl border border-brand-200/60">
                  <div className="flex justify-between text-[11px] text-brand-600 mb-1">
                    <span>Funding Fit (15%)</span>
                    <span className="font-bold text-blue-700">{grant.signals.fundingFit}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-brand-200 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${grant.signals.fundingFit}%` }} />
                  </div>
                </div>

                <div className="bg-brand-50 p-2.5 rounded-xl border border-brand-200/60">
                  <div className="flex justify-between text-[11px] text-brand-600 mb-1">
                    <span>Freshness (10%)</span>
                    <span className="font-bold text-indigo-700">{grant.signals.deadline}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-brand-200 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${grant.signals.deadline}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Authentic Dashboard Grant Card (Exact renderAiCard UI) */}
      <AnimatePresence mode="wait">
        <motion.article
          key={persona.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="relative bg-white/95 backdrop-blur-sm border border-brand-200/70 rounded-2xl p-6 shadow-soft hover:shadow-medium hover:border-primary-300/70 transition-all duration-200"
        >
          {/* Top Pill Badges Row */}
          <div className="flex justify-between items-start gap-4 mb-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2.5">
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-brand-100 text-brand-700 uppercase tracking-widest">
                  {grant.funder}
                </span>

                {grant.grantType && (
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-primary-50 text-primary-700 border border-primary-200 uppercase tracking-widest">
                    {grant.grantType}
                  </span>
                )}

                {/* Match Score Badge */}
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold shadow-sm tabular-nums ${
                  grant.matchScore > 85 ? 'bg-gradient-to-r from-primary-50 to-primary-100/70 text-primary-700 border border-primary-200' : 'bg-brand-50 text-brand-700 border border-brand-200'
                }`}>
                  <Sparkles className="w-3.5 h-3.5 text-primary-500" />
                  <span>{grant.matchScore}% Match</span>
                  <div className="w-12 h-1.5 bg-white/80 rounded-full ml-1 overflow-hidden border border-brand-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600"
                      style={{ width: `${grant.matchScore}%` }}
                    />
                  </div>
                </div>

                {/* Eligibility Status */}
                <div className="flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-md">
                  <ShieldCheck className="w-3.5 h-3.5" /> Eligible
                </div>
              </div>

              {/* Freshness Timestamp */}
              <div className="flex flex-wrap items-center gap-2 mb-2 text-xs text-brand-500">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-50 border border-brand-200/60 text-[11px] font-medium text-brand-600">
                  <Clock className="w-3 h-3 text-brand-400" />
                  {grant.lastVerified}
                </span>
              </div>

              {/* Grant Title */}
              <h3 className="text-lg sm:text-xl font-bold text-brand-900 tracking-tight leading-snug">
                {grant.title}
              </h3>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {grant.tags.map((tag) => (
                  <span key={tag} className="text-xs px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-600 border border-brand-200/70 font-medium">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Bookmark Action */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsSaved(!isSaved)}
                className={`p-2 rounded-lg transition-colors shrink-0 ${
                  isSaved
                    ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
                    : 'text-brand-400 hover:text-primary-500 hover:bg-primary-50'
                }`}
                title={isSaved ? 'Remove from saved' : 'Save grant'}
              >
                {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* AI Reasoning Box (Exact FundSphere gradient + vertical left accent bar) */}
          <div className="mb-4 relative overflow-hidden bg-gradient-to-br from-primary-50/80 via-primary-50/40 to-white border border-primary-100/70 rounded-xl p-4 text-sm text-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary-400 to-primary-600" />
            <p className="flex items-start gap-2 pl-1 leading-relaxed text-xs sm:text-sm">
              <Sparkles className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" />
              <span>
                <strong className="font-semibold text-primary-900 mr-1">AI Reasoning:</strong>
                {grant.rationale}
              </span>
            </p>
          </div>

          {/* Why this match criteria breakdown (MatchBreakdown style) */}
          <div className="mb-4 rounded-xl border border-brand-200/70 bg-brand-50/40 p-3.5">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-brand-500 mb-2.5">
              Why this match ({persona.name})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {grant.criteria.map((c) => (
                <div
                  key={c.label}
                  className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs"
                >
                  <span className="shrink-0 mt-0.5 text-green-700">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-green-800 leading-tight">{c.label}</div>
                    <div className="text-[11px] text-brand-600 leading-snug mt-0.5">
                      {c.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card Footer: Deadline, Amount & Details Button */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-brand-100 pt-4 mt-2">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              
              {/* Deadline Badge */}
              <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs font-medium ${
                grant.deadlineTone === 'warn'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-brand-50 text-brand-700 border-brand-200'
              }`}>
                <Calendar className="w-3.5 h-3.5 opacity-80" />
                <span className="whitespace-nowrap">{grant.deadlineLabel}</span>
              </div>

              {/* Amount Badge */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 rounded-lg text-green-700 text-xs font-bold whitespace-nowrap tabular-nums">
                {grant.amount}
              </div>
            </div>

            <div className="flex items-center gap-1 text-primary-600 font-semibold text-xs transition-colors">
              <span>Interactive Preview</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>

        </motion.article>
      </AnimatePresence>

    </div>
  );
}
