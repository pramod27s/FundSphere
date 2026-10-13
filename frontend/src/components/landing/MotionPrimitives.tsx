import { useEffect, useRef, type ReactNode } from 'react';
import {
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';
import { EASE, fadeUp, inViewOnce, listItem, reveal, stagger } from './motion';

type Tone = 'light' | 'dark';

/**
 * A number that counts up (or down) to `to` the first time it scrolls into
 * view, or when `start` turns true. Screen readers get the final value only.
 */
export function CountUp({
  to,
  from = 0,
  decimals = 0,
  duration = 1.6,
  start,
}: {
  to: number;
  from?: number;
  decimals?: number;
  duration?: number;
  /** Start on this signal instead of on scrolling into view. */
  start?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduceMotion = useReducedMotion();
  const value = useMotionValue(from);
  const text = useTransform(value, (v) => v.toFixed(decimals));
  const go = start ?? inView;

  useEffect(() => {
    if (!go) return;
    if (reduceMotion) {
      value.set(to);
      return;
    }
    const controls = animate(value, to, { duration, ease: EASE });
    return () => controls.stop();
  }, [go, reduceMotion, to, duration, value]);

  return (
    <>
      <span className="sr-only">{to.toFixed(decimals)}</span>
      <motion.span ref={ref} aria-hidden="true">
        {text}
      </motion.span>
    </>
  );
}

/**
 * A card that lifts on hover and carries a soft glow that follows the
 * cursor. Layout classes go in `className`; content renders as-is.
 */
export function SpotlightCard({
  children,
  className,
  glow = 'rgba(20, 184, 166, 0.12)',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  glow?: string;
  delay?: number;
}) {
  const x = useMotionValue(-999);
  const y = useMotionValue(-999);
  const background = useMotionTemplate`radial-gradient(420px circle at ${x}px ${y}px, ${glow}, transparent 70%)`;

  return (
    <motion.div
      {...reveal(delay)}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        x.set(event.clientX - rect.left);
        y.set(event.clientY - rect.top);
      }}
      className={cn(
        'group relative isolate overflow-hidden rounded-2xl border transition-[translate,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:shadow-hover',
        className,
      )}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background }}
      />
      {children}
    </motion.div>
  );
}

export function Eyebrow({ children, tone = 'light' }: { children: ReactNode; tone?: Tone }) {
  return (
    <p
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em]',
        tone === 'dark'
          ? 'border-white/15 bg-white/5 text-primary-300'
          : 'border-primary-200 bg-primary-50 text-primary-700',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', tone === 'dark' ? 'bg-primary-400' : 'bg-primary-500')} aria-hidden="true" />
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  align = 'center',
  tone = 'light',
}: {
  eyebrow: string;
  title: string;
  body?: string;
  align?: 'center' | 'left';
  tone?: Tone;
}) {
  return (
    <motion.div {...fadeUp} className={align === 'center' ? 'text-center max-w-2xl mx-auto' : 'max-w-xl'}>
      <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
      <h2
        className={cn(
          'mt-4 font-display text-3xl sm:text-[2.75rem] sm:leading-[1.1] font-semibold tracking-[-0.015em] text-balance',
          tone === 'dark' ? 'text-white' : 'text-brand-900',
        )}
      >
        {title}
      </h2>
      {body && (
        <p className={cn('mt-4 text-lg leading-relaxed text-pretty', tone === 'dark' ? 'text-brand-300' : 'text-brand-600')}>
          {body}
        </p>
      )}
    </motion.div>
  );
}

/** Icon-led feature bullets that stagger in. */
export function FeatureList({ items }: { items: { icon: LucideIcon; title: string; body: string }[] }) {
  return (
    <motion.ul {...inViewOnce} variants={stagger(0.1, 0.1)} className="mt-8 space-y-5">
      {items.map(({ icon: Icon, title, body }) => (
        <motion.li key={title} variants={listItem} className="flex gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary-200 bg-primary-50 text-primary-700">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold text-brand-900">{title}</p>
            <p className="mt-0.5 text-brand-600 leading-relaxed">{body}</p>
          </div>
        </motion.li>
      ))}
    </motion.ul>
  );
}
