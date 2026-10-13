/**
 * Shared motion presets for the landing page, so every section enters
 * with the same easing and rhythm.
 */

/** Fast start, long soft landing ("expo out"). */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** Fade, lift and un-blur into place the first time an element scrolls into view. */
export const fadeUp = {
  initial: { opacity: 0, y: 24, filter: 'blur(6px)' },
  whileInView: { opacity: 1, y: 0, filter: 'blur(0px)' },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.8, ease: EASE },
} as const;

/** `fadeUp` with a delay, for staggering siblings by hand. */
export function reveal(delay = 0) {
  return { ...fadeUp, transition: { ...fadeUp.transition, delay } };
}

/** Parent variants for a staggered list; give each child `listItem`. */
export function stagger(staggerChildren = 0.12, delayChildren = 0) {
  return { hidden: {}, show: { transition: { staggerChildren, delayChildren } } };
}

export const listItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

/** Spread onto a parent so it runs its children's `hidden` → `show` variants once in view. */
export const inViewOnce = {
  initial: 'hidden',
  whileInView: 'show',
  viewport: { once: true, margin: '-80px' },
} as const;
