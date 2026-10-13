import { motion } from 'framer-motion';
import { CalendarCheck, Check, GraduationCap, ShieldCheck, TriangleAlert } from 'lucide-react';
import { CountUp, SpotlightCard } from './MotionPrimitives';
import { EASE, inViewOnce, stagger } from './motion';

const RANKED = [
  { title: 'ANRF Core Research Grant: Life Sciences', funder: 'ANRF', score: 94 },
  { title: 'DBT Ramalingaswami Re-entry Fellowship', funder: 'DBT', score: 88 },
  { title: 'ICMR Extramural Ad-hoc Research Project', funder: 'ICMR', score: 71 },
];

const ELIGIBILITY = [
  { label: 'PhD completed', ok: true },
  { label: 'Within 7 years of PhD', ok: true },
  { label: 'Host must be a recognised Indian institution', ok: false },
];

const ORCID_ID = '0000-0002-1825-0097';
const ORCID_ITEMS = ['Biography', '24 publications', '12 keywords', 'Affiliation'];

const rowVariants = {
  hidden: { opacity: 0, x: -16 },
  show: { opacity: 1, x: 0, transition: { duration: 0.6, ease: EASE } },
};

const popVariants = {
  hidden: { opacity: 0, scale: 0 },
  show: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 18 } },
} as const;

function RankedMatches() {
  return (
    <motion.ul {...inViewOnce} variants={stagger(0.15, 0.2)} className="mt-8 space-y-3" aria-hidden="true">
      {RANKED.map((row, index) => (
        <motion.li
          key={row.title}
          variants={rowVariants}
          className={`flex items-center gap-4 rounded-xl bg-white border px-4 py-3 shadow-soft ${
            index === 0 ? 'border-primary-300 ring-1 ring-primary-100' : 'border-brand-200'
          }`}
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
              index === 0 ? 'bg-primary-600 text-white' : 'bg-brand-100 text-brand-600'
            }`}
          >
            {index + 1}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block truncate text-sm font-semibold text-brand-800">{row.title}</span>
            <span className="block text-xs text-brand-500">{row.funder}</span>
          </span>
          <span className="hidden sm:block w-28 h-2 rounded-full bg-brand-100 overflow-hidden">
            <motion.span
              className="block h-full origin-left rounded-full bg-linear-to-r from-primary-400 to-primary-600"
              variants={{
                hidden: { scaleX: 0 },
                show: { scaleX: row.score / 100, transition: { duration: 1.2, delay: 0.25, ease: EASE } },
              }}
            />
          </span>
          <span className="w-11 text-right text-sm font-bold tabular-nums text-primary-700">
            <CountUp to={row.score} />%
          </span>
        </motion.li>
      ))}
    </motion.ul>
  );
}

function EligibilityChecks() {
  return (
    <motion.ul {...inViewOnce} variants={stagger(0.35, 0.3)} className="mt-6 space-y-2 text-sm" aria-hidden="true">
      {ELIGIBILITY.map(({ label, ok }) => (
        <motion.li
          key={label}
          variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } }}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
            ok ? 'border-brand-200 bg-white text-brand-700' : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          <motion.span variants={popVariants} className="shrink-0">
            {ok ? <Check className="w-4 h-4 text-primary-600" /> : <TriangleAlert className="w-4 h-4 text-amber-600" />}
          </motion.span>
          {label}
        </motion.li>
      ))}
    </motion.ul>
  );
}

function Freshness() {
  return (
    <motion.div {...inViewOnce} className="mt-6 space-y-2 text-sm" aria-hidden="true">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-white px-3 py-2">
        <span className="truncate font-medium text-brand-800">ANRF Core Research Grant</span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-500" />
          </span>
          Verified today
        </span>
      </div>
      <motion.div
        variants={{ hidden: { opacity: 1 }, show: { opacity: 0.5, transition: { delay: 1.4, duration: 0.6 } } }}
        className="flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-white px-3 py-2"
      >
        <span className="relative truncate text-brand-800">
          DST INSPIRE Faculty, 2025 call
          <motion.span
            className="absolute inset-x-0 top-1/2 h-px origin-left bg-brand-500"
            variants={{ hidden: { scaleX: 0 }, show: { scaleX: 1, transition: { delay: 0.7, duration: 0.6, ease: EASE } } }}
          />
        </span>
        <motion.span
          className="shrink-0 text-xs font-semibold text-brand-500"
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { delay: 1.1 } } }}
        >
          Closed, removed
        </motion.span>
      </motion.div>
    </motion.div>
  );
}

function OrcidImport() {
  return (
    <motion.div
      {...inViewOnce}
      className="sm:w-64 shrink-0 rounded-xl bg-white/10 border border-white/20 p-4 text-sm backdrop-blur"
      aria-hidden="true"
    >
      <motion.p variants={stagger(0.035, 0.2)} className="font-mono text-xs text-primary-100">
        {ORCID_ID.split('').map((char, index) => (
          <motion.span key={index} variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}>
            {char}
          </motion.span>
        ))}
        <span className="ml-0.5 inline-block h-3 w-[2px] translate-y-0.5 bg-primary-200 animate-pulse" />
      </motion.p>
      <div className="mt-3 h-1 rounded-full bg-white/15 overflow-hidden">
        <motion.div
          className="h-full origin-left rounded-full bg-white"
          variants={{ hidden: { scaleX: 0 }, show: { scaleX: 1, transition: { delay: 0.9, duration: 1.6, ease: EASE } } }}
        />
      </div>
      <motion.ul variants={stagger(0.3, 1.1)} className="mt-3 space-y-2">
        {ORCID_ITEMS.map((itemLabel) => (
          <motion.li
            key={itemLabel}
            variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0, transition: { duration: 0.4 } } }}
            className="flex items-center gap-2"
          >
            <motion.span variants={popVariants}>
              <Check className="w-4 h-4 text-primary-200" />
            </motion.span>
            {itemLabel}
          </motion.li>
        ))}
      </motion.ul>
    </motion.div>
  );
}

/** The Discover chapter: four cards, each with a small animated preview. */
export default function DiscoverBento() {
  return (
    <div className="mt-14 grid grid-cols-1 lg:grid-cols-3 gap-5">
      <SpotlightCard className="lg:col-span-2 border-brand-200 bg-white p-8 flex flex-col">
        <h3 className="text-xl font-bold">Matches ranked by how well they fit you</h3>
        <p className="mt-2 text-brand-600 leading-relaxed max-w-lg">
          Every open call is scored on research fit, eligibility, keywords, budget fit and deadline. Each match comes
          with a plain-language reason, so you can decide in seconds.
        </p>
        <RankedMatches />
      </SpotlightCard>

      <SpotlightCard delay={0.1} className="border-brand-200 bg-white p-8">
        <span className="inline-flex w-11 h-11 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
          <ShieldCheck className="w-6 h-6" aria-hidden="true" />
        </span>
        <h3 className="mt-5 text-xl font-bold">No more ineligible applications</h3>
        <p className="mt-2 text-brand-600 leading-relaxed">
          PhD, years of experience, citizenship and institution rules are checked before a call reaches you.
        </p>
        <EligibilityChecks />
      </SpotlightCard>

      <SpotlightCard className="border-brand-200 bg-white p-8">
        <span className="inline-flex w-11 h-11 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
          <CalendarCheck className="w-6 h-6" aria-hidden="true" />
        </span>
        <h3 className="mt-5 text-xl font-bold">Deadlines you can trust</h3>
        <p className="mt-2 text-brand-600 leading-relaxed">
          Agency pages are checked daily. Closed calls disappear, and every call shows when it was last verified.
        </p>
        <Freshness />
      </SpotlightCard>

      <SpotlightCard
        delay={0.1}
        glow="rgba(255, 255, 255, 0.12)"
        className="lg:col-span-2 border-primary-700 bg-primary-700 p-8 text-white flex flex-col sm:flex-row sm:items-center gap-8"
      >
        <div className="pointer-events-none absolute -right-24 -top-24 -z-10 h-72 w-72 rounded-full bg-primary-400/40 blur-3xl animate-aurora" aria-hidden="true" />
        <div className="flex-1">
          <span className="inline-flex w-11 h-11 items-center justify-center rounded-lg bg-white/15">
            <GraduationCap className="w-6 h-6" aria-hidden="true" />
          </span>
          <h3 className="mt-5 text-xl font-bold">Your profile in one click</h3>
          <p className="mt-2 text-primary-50 leading-relaxed max-w-md">
            Connect your ORCID iD to load your biography, publications, keywords and affiliation. Later, import papers
            straight into a grant's outputs.
          </p>
        </div>
        <OrcidImport />
      </SpotlightCard>
    </div>
  );
}
