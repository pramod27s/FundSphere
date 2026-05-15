import { AnimatePresence, motion } from 'framer-motion';

interface TopLoadingBarProps {
  /** When true, the bar fades in and starts looping its slide. */
  visible: boolean;
}

/**
 * Thin indeterminate progress bar pinned to the top of the viewport.
 * Use for requests where we know it's working but can't show a real %
 * (AI Match, proposal analysis). Pure visual reassurance — the wait
 * itself doesn't change, but it feels half as long because the user
 * sees the system is alive.
 *
 * Style choice: a single ~30% width gradient pill sliding left→right on
 * a soft track, rather than a growing bar. Indeterminate-style works
 * for arbitrary durations and avoids dishonest "almost done!" jumps.
 */
export default function TopLoadingBar({ visible }: TopLoadingBarProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="top-loading-bar"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed top-0 left-0 right-0 h-1 z-[60] overflow-hidden bg-primary-100/60 pointer-events-none shadow-[0_1px_2px_rgba(13,148,136,0.15)]"
          aria-hidden="true"
        >
          <motion.div
            className="absolute top-0 left-0 h-full w-1/3 bg-gradient-to-r from-primary-400 via-primary-600 to-primary-400 rounded-full shadow-[0_0_8px_rgba(13,148,136,0.5)]"
            initial={{ x: '-100%' }}
            animate={{ x: '300%' }}
            transition={{
              duration: 1.2,
              ease: 'easeInOut',
              repeat: Infinity,
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
