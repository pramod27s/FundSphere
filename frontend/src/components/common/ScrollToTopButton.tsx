import { useEffect, useState, type RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp } from 'lucide-react';

interface ScrollToTopButtonProps {
  /**
   * Element whose scroll position we watch and scroll. Omit to listen
   * to the window — covers most pages (/saved, /profile, /proposal).
   * Pass a ref when the page has its own scrolling container, e.g.
   * <GrantDiscovery>'s `<main>`.
   */
  scrollTarget?: RefObject<HTMLElement | null>;
  /** Pixels of scroll before the button appears. Default 400. */
  threshold?: number;
  /**
   * Positioning class. Default `fixed bottom-6 right-6` works for
   * window scroll. For internal containers, pass `absolute …` so the
   * button is positioned relative to the scrolling container instead
   * of the viewport.
   */
  positionClassName?: string;
}

export default function ScrollToTopButton({
  scrollTarget,
  threshold = 400,
  positionClassName = 'fixed bottom-6 right-6',
}: ScrollToTopButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = scrollTarget?.current ?? null;
    const eventTarget: HTMLElement | Window = element ?? window;

    const handleScroll = () => {
      const y = element ? element.scrollTop : window.scrollY;
      setVisible(y > threshold);
    };

    eventTarget.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // sync initial state in case we mount mid-scroll
    return () => eventTarget.removeEventListener('scroll', handleScroll);
  }, [scrollTarget, threshold]);

  const scrollToTop = () => {
    const element = scrollTarget?.current;
    if (element) {
      element.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={scrollToTop}
          aria-label="Scroll to top"
          title="Scroll to top"
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.9 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className={`${positionClassName} z-40 w-11 h-11 rounded-full bg-white/95 backdrop-blur-md border border-brand-200 shadow-lg shadow-brand-900/10 hover:shadow-xl hover:shadow-primary-500/20 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 text-brand-700 flex items-center justify-center transition-colors active:scale-95`}
        >
          <ArrowUp className="w-5 h-5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
