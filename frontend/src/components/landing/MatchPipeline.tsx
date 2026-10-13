import { motion, useReducedMotion } from 'framer-motion';

const STAGES = [
  { label: 'Your profile and query', detail: 'Focus, career stage, eligibility facts' },
  { label: 'Hybrid search', detail: 'Pinecone hybrid + PostgreSQL full-text' },
  { label: 'Fusion and filtering', detail: 'RRF; closed and ineligible calls out' },
  { label: 'Cross-encoder re-rank', detail: 'bge-reranker-v2-m3' },
  { label: 'Scored and explained', detail: 'Five signals and a one-line reason' },
];

/** One pass of the pulse, in seconds; it travels during [START, END] of each cycle. */
const CYCLE = 5;
const START = 0.04;
const END = 0.75;

/** Fraction of the cycle at which the pulse reaches stage `index`. */
const arrival = (index: number) => START + (END - START) * (index / (STAGES.length - 1));

/** The matching pipeline as a vertical diagram, with a pulse running through each stage. */
export default function MatchPipeline() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative mt-10">
      <span className="absolute left-5 top-6 bottom-6 w-px -translate-x-1/2 bg-white/10" aria-hidden="true" />
      {!reduceMotion && (
        <span className="absolute left-5 top-6 bottom-6 w-px -translate-x-1/2" aria-hidden="true">
          <motion.span
            className="absolute left-1/2 h-12 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-linear-to-b from-transparent via-primary-300 to-transparent shadow-[0_0_12px_2px_rgba(45,212,191,0.5)]"
            animate={{ top: ['0%', '0%', '100%', '100%'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: CYCLE, times: [0, START, END, 1], ease: 'linear', repeat: Infinity }}
          />
        </span>
      )}

      <ol className="relative flex flex-col gap-3" aria-label="How a match is made">
        {STAGES.map((stage, index) => {
          const at = arrival(index);
          return (
            <li key={stage.label} className="flex h-12 items-center gap-4">
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-brand-900 text-xs font-bold tabular-nums text-primary-300">
                {!reduceMotion && (
                  <motion.span
                    aria-hidden="true"
                    className="absolute -inset-px rounded-full border border-primary-400 bg-primary-500/20 shadow-[0_0_20px_4px_rgba(45,212,191,0.35)]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0, 1, 0, 0] }}
                    transition={{ duration: CYCLE, times: [0, at, at + 0.03, at + 0.22, 1], ease: 'easeOut', repeat: Infinity }}
                  />
                )}
                <span className="relative">{index + 1}</span>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{stage.label}</p>
                <p className="truncate text-xs text-brand-400">{stage.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
