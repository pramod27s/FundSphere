import { useEffect, useId, useState, type ReactNode } from 'react';
import { formatDay } from '../../utils/applicationDates';

/** The width the workspace pages share, so switching tabs or opening an item doesn't move the content. */
export const PAGE_WIDTH = 'w-full max-w-6xl 2xl:max-w-7xl mx-auto px-4 sm:px-6';

/** Where the scroll-to-top button sits on signed-in pages: above the phone tab bar, beside the desktop rail. */
export const RAIL_SCROLL_TOP_POSITION = 'fixed bottom-[calc(var(--mobile-tab-bar)_+_1rem)] right-4 md:bottom-6 md:right-26';

/** The sticky panel's distance from the top (the 4rem header plus a gap) and the room it leaves at the bottom, in px. */
const PANEL_TOP = 88;
const PANEL_BOTTOM = 24;

/**
 * A callback ref for a panel, and whether the panel fits the viewport under
 * the sticky header. A sticky panel taller than the screen would hide its
 * bottom until the page ends, so the panels only stick while they fit.
 */
function useFitsViewport(): [(element: HTMLElement | null) => void, boolean] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [fits, setFits] = useState(false);
  useEffect(() => {
    if (!element) return;
    const check = () => setFits(element.offsetHeight <= window.innerHeight - PANEL_TOP - PANEL_BOTTOM);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    window.addEventListener('resize', check);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', check);
    };
  }, [element]);
  return [setElement, fits];
}

/** Without a panel (loading, empty, errors) a page's column stays at a readable width. */
function SingleColumn({ children }: { children: ReactNode }) {
  return <div className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">{children}</div>;
}

/**
 * A list page's body: the list on the left and an "at a glance" panel on
 * the right from lg up; below lg the panel follows the list.
 */
export function ListLayout({ children, panel }: { children: ReactNode; panel?: ReactNode }) {
  const [panelRef, fits] = useFitsViewport();
  if (!panel) return <SingleColumn>{children}</SingleColumn>;
  return (
    <div className={`flex-1 ${PAGE_WIDTH} py-6 sm:py-8`}>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        <div className="min-w-0 flex flex-col gap-6">{children}</div>
        <aside ref={panelRef} aria-label="At a glance" className={`min-w-0 flex flex-col gap-4 ${fits ? 'lg:sticky lg:top-22' : ''}`}>
          {panel}
        </aside>
      </div>
    </div>
  );
}

/**
 * A detail page's body: the work on the left and the item's facts on the
 * right from xl up, where checklists and reports keep their width. Below
 * xl the panel comes first, where a summary card would sit, so it leads
 * the page in reading order too.
 */
export function DetailLayout({ children, panel }: { children: ReactNode; panel?: ReactNode }) {
  const [panelRef, fits] = useFitsViewport();
  if (!panel) return <SingleColumn>{children}</SingleColumn>;
  return (
    <div className={`flex-1 ${PAGE_WIDTH} py-6 sm:py-8`}>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        <aside
          ref={panelRef}
          aria-label="Summary"
          className={`min-w-0 flex flex-col gap-4 xl:col-start-2 xl:row-start-1 ${fits ? 'xl:sticky xl:top-22' : ''}`}
        >
          {panel}
        </aside>
        <div className="min-w-0 xl:col-start-1 xl:row-start-1">{children}</div>
      </div>
    </div>
  );
}

/** One card in a side panel. */
export function PanelCard({ title, detail, footer, className = '', children }: {
  title: string;
  /** Short text on the heading's right, e.g. a count. */
  detail?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={`bg-white border border-brand-200 rounded-lg p-4 shadow-xs ${className}`}>
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 id={headingId} className="text-sm font-bold text-brand-900 tracking-tight">{title}</h2>
        {detail && <span className="text-xs text-brand-500 tabular-nums shrink-0">{detail}</span>}
      </div>
      {children}
      {footer && <div className="mt-3 pt-3 border-t border-brand-100">{footer}</div>}
    </section>
  );
}

/** A panel card's message when it has nothing to list. */
export function PanelNote({ children }: { children: ReactNode }) {
  return <p className="text-xs text-brand-500 leading-relaxed">{children}</p>;
}

/** Calendar-leaf date, e.g. "OCT / 12", for the panels' deadline lists. */
export function DateLeaf({ iso, className = '' }: { iso: string; className?: string }) {
  const [day, month] = formatDay(iso, false).split(' ');
  return (
    <span className={`w-10 shrink-0 rounded-md border border-brand-200 bg-brand-50 text-center leading-none py-1 ${className}`} aria-hidden="true">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-500">{month}</span>
      <span className="block mt-0.5 text-sm font-bold tabular-nums text-brand-900">{day}</span>
    </span>
  );
}
