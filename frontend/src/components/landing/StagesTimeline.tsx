import { useRef } from 'react';
import { motion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { reveal } from './motion';

export interface Stage {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string;
}

function StageItem({ stage, index, total, progress }: { stage: Stage; index: number; total: number; progress: MotionValue<number> }) {
  const Icon = stage.icon;
  // The badge fills in as the connector line reaches it.
  const at = index / (total - 1);
  const lit = useTransform(progress, [at - 0.06, at], [0, 1]);
  const background = useTransform(lit, [0, 1], ['#ffffff', '#0d9488']);
  const color = useTransform(lit, [0, 1], ['#0f766e', '#ffffff']);
  const halo = useTransform(lit, [0, 1], ['0 0 0 0px rgba(20,184,166,0)', '0 0 0 8px rgba(20,184,166,0.15)']);

  return (
    <motion.li {...reveal(index * 0.1)} className="relative text-center">
      <motion.span
        style={{ backgroundColor: background, color, boxShadow: halo }}
        className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-primary-500"
      >
        <Icon className="h-6 w-6" aria-hidden="true" />
      </motion.span>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-primary-700">Step {index + 1}</p>
      <h3 className="mt-1 text-lg font-bold">
        <a href={`#${stage.id}`} className="group inline-flex items-center gap-1.5 rounded-md hover:text-primary-700 transition-colors">
          {stage.title}
          <ArrowRight className="h-4 w-4 opacity-0 -translate-x-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" aria-hidden="true" />
        </a>
      </h3>
      <p className="mt-2 text-brand-600 leading-relaxed max-w-xs mx-auto">{stage.body}</p>
    </motion.li>
  );
}

/** Lifecycle steps joined by a line that draws itself as the section scrolls by. */
export default function StagesTimeline({ stages }: { stages: Stage[] }) {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'end 55%'] });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 25, restDelta: 0.001 });

  return (
    <ol ref={ref} className="relative mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
      <span className="hidden lg:block absolute top-7 left-[12.5%] right-[12.5%] h-px bg-brand-200" aria-hidden="true" />
      <motion.span
        className="hidden lg:block absolute top-7 left-[12.5%] right-[12.5%] h-0.5 -translate-y-px origin-left bg-linear-to-r from-primary-400 to-primary-600"
        style={{ scaleX: progress }}
        aria-hidden="true"
      />
      {stages.map((stage, index) => (
        <StageItem key={stage.id} stage={stage} index={index} total={stages.length} progress={progress} />
      ))}
    </ol>
  );
}
