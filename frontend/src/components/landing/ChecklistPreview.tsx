import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { CalendarPlus, Check, ClipboardCheck, LoaderCircle, MessageCircle } from 'lucide-react';
import { CountUp } from './MotionPrimitives';
import { EASE, stagger } from './motion';

const ITEMS = [
  {
    text: 'Endorsement from the Head of Institution',
    category: 'Documents',
    page: 3,
    owner: 'AR',
    done: true,
    quote: 'The proposal must be forwarded through the Head of the Institution.',
  },
  { text: 'Project description within 10 pages, 11-pt font', category: 'Format', page: 5, owner: 'AR', done: true },
  { text: 'PhD degree certificate', category: 'Eligibility', page: 2, owner: 'SK', done: true },
  { text: 'Three quotations for equipment over ₹10 lakh', category: 'Budget', page: 7, owner: 'PM', done: false, due: 'Due in 9 days' },
  { text: 'Hard copy forwarded by the Registrar', category: 'Submission', page: 8, owner: 'PM', done: false, due: 'Due in 14 days' },
];

const DONE_COUNT = ITEMS.filter((entry) => entry.done).length;
const READINESS = Math.round((DONE_COUNT / ITEMS.length) * 100);

/** How long the "reading the guidelines" phase lasts before items appear. */
const READING_MS = 1500;

const rowVariants = {
  hidden: { opacity: 0, x: 24 },
  show: { opacity: 1, x: 0, transition: { duration: 0.55, ease: EASE } },
};

/** The Apply chapter's preview: guidelines turned into a checklist with owners and readiness. */
export default function ChecklistPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-120px' });
  const reduceMotion = useReducedMotion();
  const [extracted, setExtracted] = useState(false);

  useEffect(() => {
    if (!inView) return;
    const timer = setTimeout(() => setExtracted(true), reduceMotion ? 0 : READING_MS);
    return () => clearTimeout(timer);
  }, [inView, reduceMotion]);

  return (
    <div
      ref={ref}
      className="relative rounded-2xl border border-brand-200 bg-white p-5 sm:p-6 shadow-elevated"
      aria-hidden="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-100 pb-4">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-brand-900">ANRF Core Research Grant</span>
            <span className="block text-xs text-brand-500">Checklist from the call guidelines</span>
          </span>
        </span>
        <AnimatePresence mode="wait" initial={false}>
          {extracted ? (
            <motion.span
              key="done"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700"
            >
              <Check className="h-3.5 w-3.5" />
              {ITEMS.length} items found
            </motion.span>
          ) : (
            <motion.span
              key="reading"
              exit={{ opacity: 0, y: -4 }}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-600"
            >
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              Reading guidelines
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold text-brand-800">Readiness</span>
          <span className="font-bold tabular-nums text-primary-700">
            <CountUp to={READINESS} start={extracted} duration={2.2} />%
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-100">
          <motion.div
            className="h-full origin-left rounded-full bg-linear-to-r from-primary-400 to-primary-600"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: extracted ? READINESS / 100 : 0 }}
            transition={{ duration: 2.2, ease: EASE, delay: 0.2 }}
          />
        </div>
      </div>

      <motion.ul
        initial="hidden"
        animate={extracted ? 'show' : 'hidden'}
        variants={stagger(0.14, 0.05)}
        className="mt-5 space-y-2.5"
      >
        {ITEMS.map((entry, index) => (
          <motion.li key={entry.text} variants={rowVariants} className="rounded-xl border border-brand-200 bg-brand-50/60 px-3.5 py-3">
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  entry.done ? 'border-primary-600 bg-primary-600 text-white' : 'border-brand-300 bg-white'
                }`}
              >
                {entry.done && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: extracted ? 1 : 0 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.9 + index * 0.25 }}
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </motion.span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${entry.done ? 'text-brand-500 line-through decoration-brand-300' : 'text-brand-900'}`}>
                  {entry.text}
                </p>
                {entry.quote && (
                  <p className="mt-1 border-l-2 border-primary-300 pl-2 text-xs italic text-brand-500">“{entry.quote}”</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                  <span className="rounded bg-white px-1.5 py-0.5 text-brand-600 ring-1 ring-brand-200">{entry.category}</span>
                  <span className="rounded bg-primary-50 px-1.5 py-0.5 text-primary-700">p. {entry.page}</span>
                  {entry.due && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">{entry.due}</span>}
                </div>
              </div>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-900 text-[10px] font-bold text-white">
                {entry.owner}
              </span>
            </div>
          </motion.li>
        ))}
      </motion.ul>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: extracted ? 1 : 0 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="mt-4 flex flex-wrap gap-2 border-t border-brand-100 pt-4 text-xs font-semibold"
      >
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-2.5 py-1.5 text-brand-700">
          <MessageCircle className="h-3.5 w-3.5 text-primary-600" />
          Send pending items on WhatsApp
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-2.5 py-1.5 text-brand-700">
          <CalendarPlus className="h-3.5 w-3.5 text-primary-600" />
          Add due dates to calendar
        </span>
      </motion.div>
    </div>
  );
}
