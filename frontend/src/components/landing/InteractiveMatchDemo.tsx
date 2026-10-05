import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  ShieldCheck,
  Calendar,
  Bookmark,
  BookmarkCheck,
  Check,
  Layers,
  Clock,
  TriangleAlert,
} from 'lucide-react';
import MatchScoreDial from '../common/MatchScoreDial';

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

  const signals = [
    { label: 'Research fit', weight: 35, value: grant.signals.semantic },
    { label: 'Eligibility', weight: 25, value: grant.signals.eligibility },
    { label: 'Keywords', weight: 15, value: grant.signals.keyword },
    { label: 'Budget fit', weight: 15, value: grant.signals.fundingFit },
    { label: 'Deadline', weight: 10, value: grant.signals.deadline },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-5 text-left">

      {/* 1. Persona switcher */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-3">
          <p id="persona-label" className="text-sm font-semibold text-brand-800">
            Choose a researcher
          </p>
          <button
            type="button"
            onClick={() => setShowSignals(!showSignals)}
            aria-expanded={showSignals}
            aria-controls="demo-signals"
            className="self-start sm:self-auto inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-800 rounded-md"
          >
            <Layers className="w-4 h-4" aria-hidden="true" />
            {showSignals ? 'Hide score breakdown' : 'How is the score calculated?'}
          </button>
        </div>

        <div role="group" aria-labelledby="persona-label" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {PERSONAS.map((p) => {
            const isSelected = p.id === selectedId;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  setSelectedId(p.id);
                  setIsSaved(false);
                }}
                className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                  isSelected
                    ? 'bg-white border-primary-500 ring-2 ring-primary-500/20 shadow-soft'
                    : 'bg-white border-brand-200 hover:border-brand-300 hover:bg-white'
                }`}
              >
                <span className={`text-xs font-semibold ${isSelected ? 'text-primary-700' : 'text-brand-500'}`}>
                  {p.badge}
                </span>
                <span className="mt-0.5 block font-bold text-brand-900 truncate">{p.name}</span>
                <span className="block text-sm text-brand-500 truncate">{p.role}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Optional score breakdown */}
      <AnimatePresence initial={false}>
        {showSignals && (
          <motion.div
            id="demo-signals"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-white border border-brand-200 rounded-xl p-5 shadow-soft">
              <p className="text-sm text-brand-600 mb-4">
                The match score combines five signals. The number in brackets is how much each one counts.
              </p>
              <dl className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                {signals.map((signal) => (
                  <div key={signal.label}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <dt className="text-brand-600">
                        {signal.label} <span className="text-brand-500">({signal.weight}%)</span>
                      </dt>
                      <dd className="font-bold text-brand-900 tabular-nums">{signal.value}</dd>
                    </div>
                    <div className="h-1.5 w-full bg-brand-100 rounded-full overflow-hidden" aria-hidden="true">
                      <div className="h-full bg-primary-500 rounded-full" style={{ width: `${signal.value}%` }} />
                    </div>
                  </div>
                ))}
              </dl>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Grant card — mirrors the real discovery card */}
      <AnimatePresence mode="wait">
        <motion.article
          key={persona.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          aria-live="polite"
          className="bg-white border border-brand-200 rounded-xl p-5 sm:p-6 shadow-medium"
        >
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-brand-500">
                <span className="font-semibold text-brand-700">{grant.funder}</span>
                <span aria-hidden="true"> · </span>
                {grant.grantType}
              </p>
              <h3 className="mt-1.5 text-lg sm:text-xl font-bold text-brand-900 tracking-tight leading-snug text-pretty">
                {grant.title}
              </h3>
            </div>

            <div className="flex items-start gap-1 shrink-0">
              <MatchScoreDial score={grant.matchScore} />
              <button
                type="button"
                onClick={() => setIsSaved(!isSaved)}
                aria-pressed={isSaved}
                aria-label={isSaved ? 'Remove from saved' : 'Save grant'}
                className={`p-2 rounded-lg transition-colors ${
                  isSaved ? 'text-primary-600 bg-primary-50' : 'text-brand-500 hover:text-primary-600 hover:bg-primary-50'
                }`}
              >
                {isSaved ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <li className="flex items-center gap-1.5 font-semibold text-primary-700">
              <ShieldCheck className="w-4 h-4" aria-hidden="true" /> {grant.eligibility}
            </li>
            <li className={`flex items-center gap-1.5 ${grant.deadlineTone === 'warn' ? 'font-semibold text-amber-700' : 'text-brand-700'}`}>
              <Calendar className="w-4 h-4 opacity-70" aria-hidden="true" /> {grant.deadlineLabel}
            </li>
            <li className="font-semibold text-brand-800 tabular-nums">{grant.amount}</li>
            <li className="flex items-center gap-1.5 text-brand-500">
              <Clock className="w-4 h-4 text-brand-500" aria-hidden="true" /> {grant.lastVerified}
            </li>
          </ul>

          <p className="mt-4 flex gap-2.5 rounded-lg bg-primary-50 px-4 py-3 text-sm text-brand-700 leading-relaxed">
            <Sparkles className="w-4 h-4 text-primary-600 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <span className="font-semibold text-primary-900">Why it fits: </span>
              {grant.rationale}
            </span>
          </p>

          <div className="mt-4">
            <h4 className="text-sm font-semibold text-brand-800 mb-2">Eligibility checks</h4>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
              {grant.criteria.map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-sm">
                  {c.verdict === 'match' ? (
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary-600" aria-label="Meets requirement" />
                  ) : (
                    <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" aria-label="Needs checking" />
                  )}
                  <span>
                    <span className="font-semibold text-brand-800">{c.label}.</span>{' '}
                    <span className="text-brand-600">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 flex flex-wrap gap-1.5">
            {grant.tags.map((tag) => (
              <span key={tag} className="text-xs font-medium px-2.5 py-1 rounded-full bg-brand-100 text-brand-600">
                {tag}
              </span>
            ))}
          </div>
        </motion.article>
      </AnimatePresence>

    </div>
  );
}
