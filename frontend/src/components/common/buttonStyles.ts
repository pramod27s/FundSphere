import { cn } from '../../utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 shadow-xs',
  secondary: 'bg-white text-brand-900 border border-brand-300 hover:bg-brand-50 hover:border-brand-400 shadow-xs',
  ghost: 'text-brand-700 hover:text-brand-900 hover:bg-brand-100',
  inverse: 'bg-white text-brand-900 hover:bg-primary-50 shadow-xs',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

const ROW_BUTTON =
  'inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300';
const ROW_ICON_BUTTON =
  'inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300';

/**
 * Small actions on a list row (a deadline, a checklist item, an output) and
 * in compact headers. Things that change something are buttons; things that
 * show a note or go to another site stay links.
 */
export const ROW_ACTION = {
  /** The row's main new action, e.g. Draft this report. */
  primary: `${ROW_BUTTON} border-primary-600 bg-primary-600 text-white hover:bg-primary-700`,
  /** The usual way to finish with a row, e.g. Mark submitted. */
  emphasis: `${ROW_BUTTON} border-primary-300 bg-white text-primary-700 hover:bg-primary-50`,
  secondary: `${ROW_BUTTON} border-brand-300 bg-white text-brand-800 hover:bg-brand-50`,
  danger: `${ROW_BUTTON} border-red-200 bg-white text-red-700 hover:bg-red-50`,
  /** Square, icon-only (Edit, Delete). Give it an aria-label and a title. */
  icon: `${ROW_ICON_BUTTON} border-brand-300 bg-white text-brand-700 hover:bg-brand-50 hover:text-brand-900`,
  iconDanger: `${ROW_ICON_BUTTON} border-red-200 bg-white text-red-600 hover:bg-red-50`,
  link: 'inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-800 hover:underline underline-offset-2',
};

/**
 * Class string for the shared button look. Exported so anchors and router
 * links can match buttons exactly without wrapping them in a <button>.
 */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
) {
  return cn(
    'inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}
