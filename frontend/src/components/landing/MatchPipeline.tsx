import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

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
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '100px' });
  const reduceMotion = useReducedMotion();
  // The loop runs only while the diagram is on screen; it restarts in step when it comes back.
  const play = inView && !reduceMotion;

  return (
    <div ref={ref} className="relative mt-10">
      <span className="absolute left-5 top-6 bottom-6 w-px -translate-x-1/2 bg-white/10" aria-hidden="true" />
      {play && (
        <span className="absolute left-5 top-6 bottom-6 w-px -translate-x-1/2" aria-hidden="true">
          {/* A track-sized carrier slides down by its own height (a transform, not `top`,
              so no layout per frame), taking the pulse at its top edge along the line. */}
          <motion.span
            className="absolute inset-0"
            animate={{ y: ['0%', '0%', '100%', '100%'], opacity: [0, 1, 1, 0] }}
            transition={{ duration: CYCLE, times: [0, START, END, 1], ease: 'linear', repeat: Infinity }}
          >
            <span className="absolute left-1/2 top-0 h-12 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-linear-to-b from-transparent via-primary-300 to-transparent shadow-[0_0_12px_2px_rgba(45,212,191,0.5)]" />
          </motion.span>
        </span>
      )}

      <ol className="relative flex flex-col gap-3" aria-label="How a match is made">
        {STAGES.map((stage, index) => {
          const at = arrival(index);
          return (
            <li key={stage.label} className="flex h-12 items-center gap-4">
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-brand-900 text-xs font-bold tabular-nums text-primary-300">
                {play && (
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
                <p className="truncate text-xs text-brand-500">{stage.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
