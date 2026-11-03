import { useEffect, type RefObject } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

/** Seconds a jump to an in-page link (#discover, #faq, ...) takes. */
const ANCHOR_DURATION = 1.2;

/**
 * Eased, inertial wheel scrolling for the landing page, with smooth jumps to
 * in-page links. Touch scrolling stays native, and nothing changes for
 * visitors who ask their OS for reduced motion. Lenis is torn down when the
 * page unmounts, so the signed-in app keeps the browser's own scrolling.
 */
export function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({ autoRaf: true });

    // Handled here rather than with Lenis's `anchors` option, which leaves the
    // browser's own jump running underneath its animation.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest('a[href^="#"]');
      const id = link?.getAttribute('href')?.slice(1);
      const target = id ? document.getElementById(decodeURIComponent(id)) : null;
      if (!target) return;

      event.preventDefault();
      // Lands below the fixed header: Lenis honours html's scroll-padding-top.
      lenis.scrollTo(target, { duration: ANCHOR_DURATION });
      // Move focus as a native jump would, so the skip link and keyboard users land there too.
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
        target.setAttribute('data-scroll-target', '');
      }
      target.focus({ preventScroll: true });
    };

    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('click', onClick);
      lenis.destroy();
    };
  }, []);
}

/**
 * Pauses the looping CSS animations (glows, beams, orbits, marquee) of every
 * section inside `rootRef` while it is off screen, so the browser isn't
 * drawing frames nobody sees. See `[data-offscreen]` in index.css.
 */
export function usePauseOffscreen(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) entry.target.toggleAttribute('data-offscreen', !entry.isIntersecting);
      },
      { rootMargin: '200px 0px' },
    );
    root.querySelectorAll('section').forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [rootRef]);
}
