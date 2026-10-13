import { motion, useReducedMotion } from 'framer-motion';
import { CalendarCheck, FilePenLine, Landmark, TriangleAlert } from 'lucide-react';
import { EASE, inViewOnce, stagger } from './motion';

const DEADLINES = [
  { label: 'UC and statement of expenditure', detail: '2025–26', due: 'Due in 6 days', tone: 'red' },
  { label: 'Progress report', detail: 'Year 2', due: 'Due in 24 days', tone: 'amber' },
  { label: 'Equipment list', detail: 'Year 2', due: 'In 3 months', tone: 'green' },
] as const;

const TONE_CHIP = {
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  green: 'bg-primary-50 text-primary-700 ring-primary-200',
};

/** Share of each budget head spent so far this financial year. */
const HEADS = [
  { label: 'Equipment', spent: 92 },
  { label: 'Manpower', spent: 58 },
  { label: 'Consumables', spent: 21, behind: true },
  { label: 'Travel', spent: 44 },
];

/** How far through the financial year we are, drawn as a marker on each bar. */
const YEAR_ELAPSED = 54;

const rowVariants = {
  hidden: { opacity: 0, x: -14 },
  show: { opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE } },
};

/** The Manage chapter's preview: an awarded grant's deadlines, spending and report draft. */
export default function GrantManagerPreview() {
  const reduceMotion = useReducedMotion();
  const pulseFirst = (index: number) => index === 0 && !reduceMotion;

  return (
    <motion.div
      {...inViewOnce}
      className="rounded-2xl border border-brand-200 bg-white p-5 sm:p-6 shadow-elevated"
      aria-hidden="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 pb-4">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
            <Landmark className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-brand-900">ANRF Core Research Grant</span>
            <span className="block text-xs text-brand-500">₹48.6 lakh · Year 2 of 3</span>
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">
          <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
          Active
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Reporting deadlines */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Reporting deadlines</p>
          <motion.ul variants={stagger(0.18, 0.2)} className="mt-2 space-y-2">
            {DEADLINES.map((deadline, index) => (
              <motion.li key={deadline.label} variants={rowVariants} className="rounded-lg border border-brand-200 px-3 py-2">
                <p className="text-sm font-medium text-brand-900 leading-snug">{deadline.label}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-brand-500">{deadline.detail}</span>
                  <motion.span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${TONE_CHIP[deadline.tone]}`}
                    animate={pulseFirst(index) ? { scale: [1, 1.08, 1] } : undefined}
                    transition={pulseFirst(index) ? { duration: 1.6, repeat: Infinity, repeatDelay: 1.2 } : undefined}
                  >
                    {deadline.due}
                  </motion.span>
                </div>
              </motion.li>
            ))}
          </motion.ul>
          <motion.p
            variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { delay: 1 } } }}
            className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-primary-700"
          >
            <CalendarCheck className="h-3.5 w-3.5" />
            Synced to Google Calendar
          </motion.p>
        </div>

        {/* Spend check */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">Spend check · FY 2026–27</p>
          <ul className="mt-2 space-y-3">
            {HEADS.map((head, index) => (
              <li key={head.label}>
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-brand-700">{head.label}</span>
                  <span className={`font-bold tabular-nums ${head.behind ? 'text-amber-700' : 'text-brand-900'}`}>{head.spent}%</span>
                </div>
                <div className="relative mt-1 h-2 rounded-full bg-brand-100">
                  <motion.div
                    className={`h-full origin-left rounded-full ${head.behind ? 'bg-amber-400' : 'bg-linear-to-r from-primary-400 to-primary-600'}`}
                    variants={{
                      hidden: { scaleX: 0 },
                      show: { scaleX: head.spent / 100, transition: { duration: 1.2, delay: 0.3 + index * 0.12, ease: EASE } },
                    }}
                  />
                  <span className="absolute -top-0.5 h-3 w-px bg-brand-400" style={{ left: `${YEAR_ELAPSED}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <motion.p
            variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { delay: 1.5, duration: 0.5 } } }}
            className="mt-3 flex gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800"
          >
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            Consumables is behind the year. Unspent money lapses on 31 March.
          </motion.p>
        </div>
      </div>

      {/* Report draft */}
      <motion.div
        variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { delay: 1.8, duration: 0.6, ease: EASE } } }}
        className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary-700 ring-1 ring-brand-200">
          <FilePenLine className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-brand-900">Year 2 progress report: draft ready</span>
          <span className="block text-xs text-brand-500">Every claim checked against your recorded outputs</span>
        </span>
        <span className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white">Export to Word</span>
      </motion.div>
    </motion.div>
  );
}
