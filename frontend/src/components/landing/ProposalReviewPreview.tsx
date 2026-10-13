import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { Check, FileText, LoaderCircle, TriangleAlert } from 'lucide-react';
import { CountUp } from './MotionPrimitives';
import { EASE, stagger } from './motion';

const SCORE = 81;

const INSTANT_CHECKS = [
  { label: 'Pages', value: '18 / 20' },
  { label: 'Font', value: '11 pt' },
  { label: 'Sections', value: '9 of 9' },
];

const CRITERIA = [
  { label: 'Scientific merit and novelty', score: 8.6, note: "Clear gap in the field and strong fit with the call's priorities." },
  { label: 'Methodology and work plan', score: 7.9, note: 'Add sample sizes for the Aim 2 field trials.' },
];

/** Version scores for the trend line: v1, v2, v3. */
const VERSIONS = [42, 63, SCORE];
const TREND_W = 132;
const TREND_H = 48;
const trendPoints = VERSIONS.map((score, index) => ({
  x: 6 + (index * (TREND_W - 12)) / (VERSIONS.length - 1),
  y: TREND_H - 6 - ((score - 30) / 70) * (TREND_H - 12),
}));
const trendPath = trendPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

/** How long the scan sweeps before the results land. */
const SCAN_MS = 1800;

const rowVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/** The Review chapter's preview: a draft being scanned, scored and tracked across versions. */
export default function ProposalReviewPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-120px' });
  const reduceMotion = useReducedMotion();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!inView) return;
    const timer = setTimeout(() => setDone(true), reduceMotion ? 0 : SCAN_MS);
    return () => clearTimeout(timer);
  }, [inView, reduceMotion]);

  return (
    <div
      ref={ref}
      className="relative isolate overflow-hidden rounded-2xl border border-brand-200 bg-white p-5 sm:p-6 shadow-elevated"
      aria-hidden="true"
    >
      {/* Scan line sweeping down the draft */}
      {inView && !reduceMotion && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-10"
          initial={{ y: '-100%' }}
          animate={{ y: '100%' }}
          transition={{ duration: SCAN_MS / 1000, ease: [0.45, 0, 0.55, 1] }}
        >
          <div className="absolute inset-x-0 bottom-0 h-28 bg-linear-to-b from-transparent to-primary-400/15" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-primary-500 shadow-[0_0_14px_3px_rgba(20,184,166,0.55)]" />
        </motion.div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 pb-4">
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-800">
          <FileText className="h-4 w-4 text-primary-600" />
          Proposal_v3.pdf
        </span>
        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.span
              key="done"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700"
            >
              <Check className="h-3.5 w-3.5" />
              Full AI review done
            </motion.span>
          ) : (
            <motion.span
              key="running"
              exit={{ opacity: 0, y: -4 }}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-600"
            >
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Checking against the call's rules
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Score and version trend */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16">
            <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
              <circle cx="32" cy="32" r="27" fill="none" strokeWidth="6" className="stroke-brand-100" />
              <motion.circle
                cx="32"
                cy="32"
                r="27"
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                className="stroke-primary-500"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={done ? { pathLength: SCORE / 100, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                transition={{ duration: 1.4, ease: EASE }}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums text-brand-900">
              <CountUp to={SCORE} start={done} duration={1.4} />
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-900">Quality score</p>
            <p className="text-xs text-brand-500">Marked like the committee</p>
          </div>
        </div>

        <div className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-500">Score by version</p>
          <svg viewBox={`0 0 ${TREND_W} ${TREND_H}`} className="mt-1 h-12 w-[8.25rem] overflow-visible">
            <motion.path
              d={trendPath}
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-primary-500"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: done ? 1 : 0 }}
              transition={{ duration: 1.2, delay: 0.3, ease: EASE }}
            />
            {trendPoints.map((point, index) => (
              <motion.circle
                key={index}
                cx={point.x}
                cy={point.y}
                r="3.5"
                className={index === trendPoints.length - 1 ? 'fill-primary-600' : 'fill-white stroke-primary-500'}
                strokeWidth="2"
                initial={{ scale: 0 }}
                animate={{ scale: done ? 1 : 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 16, delay: 0.3 + index * 0.4 }}
                style={{ transformOrigin: 'center', transformBox: 'fill-box' }}
              />
            ))}
          </svg>
          <p className="text-[11px] text-brand-500">
            v1 {VERSIONS[0]} <span aria-hidden="true">→</span> v3 <span className="font-bold text-primary-700">{SCORE}</span>
          </p>
        </div>
      </div>

      <motion.div initial="hidden" animate={done ? 'show' : 'hidden'} variants={stagger(0.12, 0.2)}>
        {/* Instant check */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          {INSTANT_CHECKS.map((check) => (
            <motion.div key={check.label} variants={rowVariants} className="rounded-lg border border-brand-200 px-3 py-2">
              <p className="flex items-center gap-1 text-[11px] font-semibold text-brand-500">
                <Check className="h-3 w-3 text-primary-600" strokeWidth={3} />
                {check.label}
              </p>
              <p className="text-sm font-bold tabular-nums text-brand-900">{check.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Criteria */}
        <ul className="mt-3 space-y-2.5 text-sm">
          {CRITERIA.map((criterion) => (
            <motion.li key={criterion.label} variants={rowVariants} className="rounded-xl border border-brand-200 bg-brand-50 p-4">
              <div className="flex justify-between gap-3 font-semibold">
                <span>{criterion.label}</span>
                <span className="tabular-nums text-primary-700">
                  <CountUp to={criterion.score} decimals={1} start={done} />
                </span>
              </div>
              <p className="mt-1 text-brand-600">{criterion.note}</p>
            </motion.li>
          ))}
          <motion.li
            variants={{
              hidden: { opacity: 0, y: 10 },
              show: {
                opacity: 1,
                y: 0,
                boxShadow: ['0 0 0 0 rgba(245,158,11,0)', '0 0 0 6px rgba(245,158,11,0.25)', '0 0 0 0 rgba(245,158,11,0)'],
                transition: { duration: 0.5, ease: EASE, boxShadow: { delay: 0.6, duration: 1.4 } },
              },
            }}
            className="rounded-xl border border-amber-200 bg-amber-50 p-4"
          >
            <div className="flex justify-between gap-3 font-semibold text-amber-900">
              <span>Budget justification</span>
              <span className="flex items-center gap-1">
                <TriangleAlert className="h-4 w-4" />
                Fix first
              </span>
            </div>
            <p className="mt-1 text-amber-800">Travel exceeds the cap in guidelines section 4.2.</p>
          </motion.li>
        </ul>
      </motion.div>
    </div>
  );
}
