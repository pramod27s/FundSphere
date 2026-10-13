import { useRef, useState } from 'react';
import { motion, AnimatePresence, useInView, useReducedMotion } from 'framer-motion';
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
  Pause,
} from 'lucide-react';
import MatchScoreDial from '../common/MatchScoreDial';
import { EASE } from './motion';

/** Seconds each example stays on screen while the demo plays itself. */
const TOUR_SECONDS = 7;

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
    eligibility: 'Eligible' | 'Check eligibility';
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
    id: 'early-career',
    name: 'Dr. Ananya Rao',
    role: 'Assistant Professor, Molecular Biology',
    institution: 'IISER Pune',
    badge: 'Early career',
    researchFocus: 'CRISPR-based diagnostics for drug-resistant tuberculosis in low-resource clinics.',
    grant: {
      id: 101,
      title: 'ANRF Start-up Research Grant in Life Sciences',
      funder: 'ANRF (formerly SERB)',
      grantType: 'Early-career research grant',
      amount: '₹30 lakh over 2 years',
      deadlineLabel: '38 days left',
      deadlineTone: 'normal',
      lastVerified: 'Verified today',
      matchScore: 94,
      eligibility: 'Eligible',
      tags: ['Infectious disease', 'Diagnostics', 'CRISPR', 'Early career'],
      rationale:
        "Close match with the call's infectious-disease diagnostics priority. Your faculty position and years since PhD fall inside the early-career window, and the planned budget sits under the cap.",
      signals: { semantic: 96, eligibility: 100, keyword: 90, fundingFit: 92, deadline: 88 },
      criteria: [
        { label: 'Research area', verdict: 'match', detail: 'Diagnostics for drug-resistant TB is a listed priority' },
        { label: 'Degree', verdict: 'match', detail: 'PhD completed in 2021' },
        { label: 'Career stage', verdict: 'match', detail: 'Within two years of a first regular faculty post' },
        { label: 'Budget', verdict: 'match', detail: 'A ₹28 lakh plan is under the ₹30 lakh cap' },
      ],
    },
  },
  {
    id: 'deep-tech',
    name: 'Aravind Swaminathan',
    role: 'Co-founder and CTO',
    institution: 'Aetheris Biologics',
    badge: 'Deep-tech startup',
    researchFocus: 'A low-cost point-of-care biosensor for early detection of sepsis in neonatal ICUs.',
    grant: {
      id: 102,
      title: 'BIRAC Biotechnology Ignition Grant (BIG)',
      funder: 'BIRAC',
      grantType: 'Proof-of-concept grant',
      amount: 'Up to ₹50 lakh over 18 months',
      deadlineLabel: 'Closing soon: 21 days left',
      deadlineTone: 'warn',
      lastVerified: 'Verified yesterday',
      matchScore: 91,
      eligibility: 'Check eligibility',
      tags: ['Medical devices', 'Biosensors', 'Neonatal care', 'Startup'],
      rationale:
        'Strong fit with the call\'s focus on early-stage healthcare innovation, and your proof-of-concept stage matches the grant\'s purpose. One requirement needs a document from you before you apply.',
      signals: { semantic: 95, eligibility: 80, keyword: 92, fundingFit: 94, deadline: 82 },
      criteria: [
        { label: 'Applicant type', verdict: 'match', detail: 'DPIIT-recognised startup' },
        { label: 'Stage', verdict: 'match', detail: 'Prototype ready for proof-of-concept validation' },
        { label: 'Budget', verdict: 'match', detail: 'A ₹46 lakh plan fits under the ₹50 lakh ceiling' },
        { label: 'Shareholding', verdict: 'warn', detail: 'Proof of majority Indian ownership is needed' },
      ],
    },
  },
  {
    id: 'senior-pi',
    name: 'Prof. Rajesh Iyer',
    role: 'Professor of Physics',
    institution: 'IIT Madras',
    badge: 'Senior PI',
    researchFocus: 'Error mitigation for superconducting qubits on noisy intermediate-scale quantum hardware.',
    grant: {
      id: 103,
      title: 'ANRF Core Research Grant in Physical Sciences',
      funder: 'ANRF (formerly SERB)',
      grantType: 'Core research grant',
      amount: '₹60 lakh over 3 years',
      deadlineLabel: '52 days left',
      deadlineTone: 'normal',
      lastVerified: 'Verified 2 days ago',
      matchScore: 95,
      eligibility: 'Eligible',
      tags: ['Quantum computing', 'Superconducting qubits', 'Physics', 'Core research'],
      rationale:
        'Your error-mitigation work matches the quantum technologies theme of the call. A regular faculty post at a recognised institution meets the PI rules, and the three-year plan fits the budget limit.',
      signals: { semantic: 97, eligibility: 100, keyword: 93, fundingFit: 90, deadline: 92 },
      criteria: [
        { label: 'Research area', verdict: 'match', detail: 'Quantum technologies is a listed theme' },
        { label: 'PI position', verdict: 'match', detail: 'Regular faculty at a recognised institution' },
        { label: 'Running projects', verdict: 'match', detail: 'Under the limit on concurrent grants' },
        { label: 'Budget', verdict: 'match', detail: 'A ₹58 lakh plan is within the scheme limit' },
      ],
    },
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 12, filter: 'blur(4px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.45, ease: EASE, staggerChildren: 0.06, delayChildren: 0.15 },
  },
  exit: { opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.2 } },
};

const childVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
};

export default function InteractiveMatchDemo() {
  const [selectedId, setSelectedId] = useState<string>(PERSONAS[0].id);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [showSignals, setShowSignals] = useState<boolean>(false);

  // The demo plays through the examples by itself until the visitor
  // interacts. It pauses on hover, on keyboard focus and when off screen.
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { amount: 0.35 });
  const reduceMotion = useReducedMotion();
  const [touring, setTouring] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const playing = touring && !hovering && !focused && inView && !reduceMotion;

  const persona = PERSONAS.find((p) => p.id === selectedId) ?? PERSONAS[0];
  const grant = persona.grant;

  const showNext = () => {
    setSelectedId((current) => {
      const index = PERSONAS.findIndex((p) => p.id === current);
      return PERSONAS[(index + 1) % PERSONAS.length].id;
    });
    setIsSaved(false);
  };

  const signals = [
    { label: 'Research fit', weight: 50, value: grant.signals.semantic },
    { label: 'Eligibility', weight: 20, value: grant.signals.eligibility },
    { label: 'Keywords', weight: 10, value: grant.signals.keyword },
    { label: 'Budget fit', weight: 10, value: grant.signals.fundingFit },
    { label: 'Deadline', weight: 10, value: grant.signals.deadline },
  ];

  return (
    <div
      ref={rootRef}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      className="w-full max-w-4xl mx-auto flex flex-col gap-5 text-left"
    >

      {/* 1. Persona switcher */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <p id="persona-label" className="text-sm font-semibold text-brand-800">
              Choose a researcher
            </p>
            {touring && !reduceMotion && (
              <button
                type="button"
                onClick={() => setTouring(false)}
                className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-brand-500 hover:text-brand-800 hover:border-brand-300"
              >
                <Pause className="w-3 h-3" aria-hidden="true" />
                Stop auto-play
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setTouring(false);
              setShowSignals(!showSignals);
            }}
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
                  setTouring(false);
                  setSelectedId(p.id);
                  setIsSaved(false);
                }}
                className={`relative overflow-hidden text-left px-4 py-3 rounded-xl border transition-[border-color,box-shadow] duration-300 ${
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
                {isSelected && playing && (
                  <motion.span
                    key={`${p.id}-tour`}
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary-500"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: TOUR_SECONDS, ease: 'linear' }}
                    onAnimationComplete={showNext}
                  />
                )}
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
            transition={{ duration: 0.25, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="bg-white border border-brand-200 rounded-xl p-5 shadow-soft">
              <p className="text-sm text-brand-600 mb-4">
                The match score combines five signals. The number in brackets is how much each one counts.
              </p>
              <dl className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                {signals.map((signal, index) => (
                  <div key={signal.label}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <dt className="text-brand-600">
                        {signal.label} <span className="text-brand-500">({signal.weight}%)</span>
                      </dt>
                      <dd className="font-bold text-brand-900 tabular-nums">{signal.value}</dd>
                    </div>
                    <div className="h-1.5 w-full bg-brand-100 rounded-full overflow-hidden" aria-hidden="true">
                      <motion.div
                        key={`${persona.id}-${signal.label}`}
                        className="h-full origin-left bg-linear-to-r from-primary-400 to-primary-600 rounded-full"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: signal.value / 100 }}
                        transition={{ duration: 0.9, delay: 0.05 * index, ease: EASE }}
                      />
                    </div>
                  </div>
                ))}
              </dl>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Grant card, mirroring the real discovery card */}
      <AnimatePresence mode="wait">
        <motion.article
          key={persona.id}
          variants={cardVariants}
          initial="hidden"
          animate="show"
          exit="exit"
          aria-live={touring ? 'off' : 'polite'}
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
              <p className="mt-1 text-sm text-brand-500">
                For {persona.name}, {persona.institution}: <span className="italic">{persona.researchFocus}</span>
              </p>
            </div>

            <div className="flex items-start gap-1 shrink-0">
              <motion.div
                variants={{
                  hidden: { opacity: 0, scale: 0.8, rotate: -20 },
                  show: { opacity: 1, scale: 1, rotate: 0, transition: { type: 'spring', stiffness: 260, damping: 18 } },
                }}
              >
                <MatchScoreDial score={grant.matchScore} />
              </motion.div>
              <button
                type="button"
                onClick={() => {
                  setTouring(false);
                  setIsSaved(!isSaved);
                }}
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

          <motion.ul variants={childVariants} className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            <li
              className={`flex items-center gap-1.5 font-semibold ${
                grant.eligibility === 'Eligible' ? 'text-primary-700' : 'text-amber-700'
              }`}
            >
              {grant.eligibility === 'Eligible' ? (
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              ) : (
                <TriangleAlert className="w-4 h-4" aria-hidden="true" />
              )}
              {grant.eligibility}
            </li>
            <li className={`flex items-center gap-1.5 ${grant.deadlineTone === 'warn' ? 'font-semibold text-amber-700' : 'text-brand-700'}`}>
              <Calendar className="w-4 h-4 opacity-70" aria-hidden="true" /> {grant.deadlineLabel}
            </li>
            <li className="font-semibold text-brand-800 tabular-nums">{grant.amount}</li>
            <li className="flex items-center gap-1.5 text-brand-500">
              <Clock className="w-4 h-4 text-brand-500" aria-hidden="true" /> {grant.lastVerified}
            </li>
          </motion.ul>

          <motion.p variants={childVariants} className="mt-4 flex gap-2.5 rounded-lg bg-primary-50 px-4 py-3 text-sm text-brand-700 leading-relaxed">
            <Sparkles className="w-4 h-4 text-primary-600 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              <span className="font-semibold text-primary-900">Why it fits: </span>
              {grant.rationale}
            </span>
          </motion.p>

          <div className="mt-4">
            <motion.h4 variants={childVariants} className="text-sm font-semibold text-brand-800 mb-2">
              Eligibility checks
            </motion.h4>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
              {grant.criteria.map((c) => (
                <motion.li key={c.label} variants={childVariants} className="flex items-start gap-2 text-sm">
                  {c.verdict === 'match' ? (
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-primary-600" aria-label="Meets requirement" />
                  ) : (
                    <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" aria-label="Needs checking" />
                  )}
                  <span>
                    <span className="font-semibold text-brand-800">{c.label}.</span>{' '}
                    <span className="text-brand-600">{c.detail}</span>
                  </span>
                </motion.li>
              ))}
            </ul>
          </div>

          <div className="mt-5 flex flex-wrap gap-1.5">
            {grant.tags.map((tag) => (
              <motion.span
                key={tag}
                variants={childVariants}
                className="text-xs font-medium px-2.5 py-1 rounded-full bg-brand-100 text-brand-600"
              >
                {tag}
              </motion.span>
            ))}
          </div>
        </motion.article>
      </AnimatePresence>

    </div>
  );
}
