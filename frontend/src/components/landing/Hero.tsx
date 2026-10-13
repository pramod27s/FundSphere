import type { ReactNode } from 'react';
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import { ArrowRight, CalendarCheck, Check, ClipboardCheck, ShieldCheck } from 'lucide-react';
import InteractiveMatchDemo from './InteractiveMatchDemo';
import { buttonClasses } from '../common/buttonStyles';
import { cn } from '../../utils/cn';
import { EASE } from './motion';

const LEAD_WORDS = ['Every', 'grant,', 'from', 'first', 'search', 'to'];
const HIGHLIGHT_WORDS = ['final', 'report'];
const WORD_STEP = 0.07;
const HIGHLIGHT_DELAY = 0.15 + LEAD_WORDS.length * WORD_STEP;

const HERO_POINTS = ['Ineligible and closed calls left out', 'Every checklist item cites its page', 'Reporting deadlines from agency rules'];

/** Grid columns (see .bg-grid-dark, 48px cells centred on the page) that carry a falling light. */
const BEAMS = [
  { column: -7, delay: 0, duration: 9 },
  { column: -3, delay: 3.2, duration: 7.5 },
  { column: 4, delay: 1.4, duration: 8.5 },
  { column: 9, delay: 5, duration: 10 },
];

/** One headline word that rises out of a mask. */
function Word({ children, delay, className }: { children: ReactNode; delay: number; className?: string }) {
  return (
    <span className="inline-block overflow-hidden pb-[0.14em] -mb-[0.14em] align-bottom">
      <motion.span
        className={cn('inline-block', className)}
        initial={{ y: '110%' }}
        animate={{ y: '0%' }}
        transition={{ duration: 0.9, delay, ease: EASE }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/** A small product callout that floats beside the demo on wide screens. */
function FloatingChip({
  className,
  parallax,
  delay,
  drift,
  icon,
  title,
  detail,
}: {
  className: string;
  parallax: MotionValue<number> | number;
  delay: number;
  drift: number;
  icon: ReactNode;
  title: string;
  detail: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div aria-hidden="true" style={{ y: parallax }} className={cn('pointer-events-none absolute z-20 hidden min-[1400px]:block', className)}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ delay, duration: 0.7, ease: EASE }}
      >
        <motion.div
          animate={reduceMotion ? undefined : { y: [0, -drift, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay }}
          className="flex items-center gap-3 rounded-xl border border-brand-200 bg-white/95 px-4 py-3 shadow-[0_24px_48px_-16px_rgba(2,6,23,0.45)] backdrop-blur"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700">{icon}</span>
          <span className="text-left">
            <span className="block text-sm font-semibold text-brand-900">{title}</span>
            <span className="block text-xs text-brand-500">{detail}</span>
          </span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export default function Hero({ onPrimary, primaryLabel }: { onPrimary: () => void; primaryLabel: string }) {
  const reduceMotion = useReducedMotion();

  // Teal grid revealed under the cursor.
  const pointerX = useMotionValue(-999);
  const pointerY = useMotionValue(-999);
  const spotlight = useMotionTemplate`radial-gradient(260px circle at ${pointerX}px ${pointerY}px, black, transparent 80%)`;

  // The product frame starts tilted back and settles flat as the page scrolls.
  const { scrollY } = useScroll();
  const tilt = useSpring(useTransform(scrollY, [0, 480], [12, 0]), { stiffness: 120, damping: 30 });
  const settle = useSpring(useTransform(scrollY, [0, 480], [0.95, 1]), { stiffness: 120, damping: 30 });
  const chipRise = useTransform(scrollY, [0, 700], [0, -70]);
  const chipSink = useTransform(scrollY, [0, 700], [0, 40]);

  return (
    <>
      <section
        id="top"
        onPointerMove={(event) => {
          if (event.pointerType !== 'mouse') return;
          const rect = event.currentTarget.getBoundingClientRect();
          pointerX.set(event.clientX - rect.left);
          pointerY.set(event.clientY - rect.top);
        }}
        onPointerLeave={() => {
          pointerX.set(-999);
          pointerY.set(-999);
        }}
        className="relative isolate overflow-hidden bg-brand-950 px-4 sm:px-6 pt-32 sm:pt-40 pb-56 sm:pb-72 text-center"
      >
        {/* Backdrop */}
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
          <div className="absolute inset-0 bg-grid-dark [mask-image:radial-gradient(ellipse_70%_65%_at_50%_0%,black,transparent)]" />
          <motion.div className="absolute inset-0 bg-grid-glow" style={{ maskImage: spotlight, WebkitMaskImage: spotlight }} />
          <div className="absolute -top-48 left-1/2 h-[36rem] w-[60rem] max-w-[160vw] -translate-x-1/2 rounded-full bg-primary-600/25 blur-[120px] animate-aurora" />
          <div className="absolute top-40 -left-48 h-[28rem] w-[28rem] rounded-full bg-cyan-500/15 blur-[100px] animate-aurora [animation-delay:-7s]" />
          <div className="absolute top-24 -right-48 h-[30rem] w-[30rem] rounded-full bg-emerald-500/15 blur-[100px] animate-aurora [animation-delay:-13s]" />
          {BEAMS.map((beam) => (
            <span
              key={beam.column}
              className="absolute top-0 h-40 w-px bg-linear-to-b from-transparent via-primary-300 to-transparent animate-beam"
              style={{
                left: `calc(50% - 24px + ${beam.column * 48}px)`,
                animationDelay: `${beam.delay}s`,
                animationDuration: `${beam.duration}s`,
              }}
            />
          ))}
          <div className="absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-primary-400/40 to-transparent" />
        </div>

        <motion.p
          initial={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[13px] sm:text-sm font-medium text-brand-200 backdrop-blur"
        >
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-400" />
          </span>
          <span className="sm:hidden">Built for researchers in India</span>
          <span className="hidden sm:inline">Built for Indian researchers, labs and deep-tech founders</span>
        </motion.p>

        <h1 className="mt-7 mx-auto max-w-4xl font-display text-[2.6rem] sm:text-6xl lg:text-7xl font-semibold tracking-[-0.02em] leading-[1.06] text-white text-balance">
          <span className="sr-only">Every grant, from first search to final report.</span>
          <span aria-hidden="true">
            {LEAD_WORDS.map((word, index) => (
              <span key={word}>
                <Word delay={0.15 + index * WORD_STEP}>{word}</Word>{' '}
              </span>
            ))}
            <span className="inline-block whitespace-nowrap">
              {HIGHLIGHT_WORDS.map((word, index) => (
                <span key={word}>
                  {index > 0 && ' '}
                  <Word
                    delay={HIGHLIGHT_DELAY + index * WORD_STEP}
                    className="bg-linear-to-r from-primary-300 via-emerald-200 to-primary-300 bg-clip-text text-transparent text-shimmer"
                  >
                    {word}
                  </Word>
                </span>
              ))}
            </span>
            <Word delay={HIGHLIGHT_DELAY + 2 * WORD_STEP}>.</Word>
          </span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.8, delay: 0.75, ease: EASE }}
          className="mt-7 mx-auto max-w-2xl text-lg sm:text-xl text-brand-300 leading-relaxed text-pretty"
        >
          FundSphere matches you with open calls from ANRF, DST, DBT, ICMR and more, turns the guidelines into a
          checklist, checks your draft against the call's rules, and tracks every report and rupee once you're funded.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9, ease: EASE }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <button
            onClick={onPrimary}
            className={buttonClasses(
              'primary',
              'lg',
              'btn-shine group w-full sm:w-auto px-8 bg-primary-500 hover:bg-primary-400 text-brand-950 shadow-[0_0_0_1px_rgba(45,212,191,0.4),0_12px_32px_-8px_rgba(20,184,166,0.6)]',
            )}
          >
            {primaryLabel}
            <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
          </button>
          <a
            href="#demo"
            className={buttonClasses(
              'secondary',
              'lg',
              'w-full sm:w-auto bg-white/5 text-white border-white/15 hover:bg-white/10 hover:border-white/25 backdrop-blur',
            )}
          >
            See a live match
          </a>
        </motion.div>

        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.1 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-brand-300"
        >
          {HERO_POINTS.map((point) => (
            <li key={point} className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-primary-400" aria-hidden="true" />
              {point}
            </li>
          ))}
        </motion.ul>
      </section>

      {/* Live demo, framed as the product and overlapping the hero */}
      <section id="demo" aria-label="Live match preview" className="relative z-10 -mt-44 sm:-mt-60 px-4 sm:px-6 pb-20">
        <div className="relative mx-auto max-w-5xl" style={{ perspective: '2000px' }}>
          <div className="pointer-events-none absolute -inset-x-10 -top-10 h-72 rounded-full bg-primary-500/30 blur-3xl" aria-hidden="true" />

          <FloatingChip
            className="-left-44 top-28"
            parallax={reduceMotion ? 0 : chipRise}
            delay={1.6}
            drift={8}
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Eligibility checked"
            detail="4 of 4 rules met"
          />
          <FloatingChip
            className="-right-44 top-64"
            parallax={reduceMotion ? 0 : chipSink}
            delay={1.8}
            drift={10}
            icon={<ClipboardCheck className="h-5 w-5" />}
            title="Checklist ready"
            detail="Every item cites its page"
          />
          <FloatingChip
            className="-left-44 bottom-24"
            parallax={reduceMotion ? 0 : chipSink}
            delay={2}
            drift={7}
            icon={<CalendarCheck className="h-5 w-5" />}
            title="UC due in 12 days"
            detail="Synced to Google Calendar"
          />

          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, delay: 0.95, ease: EASE }}
            style={{ rotateX: reduceMotion ? 0 : tilt, scale: reduceMotion ? 1 : settle, transformOrigin: '50% 100%' }}
            className="relative"
          >
            {/* A light that runs around the frame's border */}
            <div className="relative overflow-hidden rounded-2xl bg-white/10 p-px shadow-[0_40px_120px_-30px_rgba(2,6,23,0.6)]">
              <div
                className="absolute -inset-[150%] animate-orbit"
                style={{
                  animationDuration: '7s',
                  background: 'conic-gradient(from 0deg, transparent 0deg, transparent 290deg, rgba(45, 212, 191, 0.95) 345deg, transparent 360deg)',
                }}
                aria-hidden="true"
              />
              <div className="relative overflow-hidden rounded-[15px] bg-white">
                <div className="flex items-center gap-2 px-4 h-11 border-b border-brand-200 bg-brand-50">
                  <span className="w-3 h-3 rounded-full bg-brand-200" aria-hidden="true" />
                  <span className="w-3 h-3 rounded-full bg-brand-200" aria-hidden="true" />
                  <span className="w-3 h-3 rounded-full bg-brand-200" aria-hidden="true" />
                  <span className="ml-3 truncate text-xs font-medium text-brand-500">
                    Try it: pick a researcher and see how a grant is matched
                  </span>
                  <span className="ml-auto hidden sm:inline-flex shrink-0 rounded-full border border-brand-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-brand-500">
                    Example data
                  </span>
                </div>
                <div className="p-4 sm:p-8 bg-brand-50">
                  <InteractiveMatchDemo />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
