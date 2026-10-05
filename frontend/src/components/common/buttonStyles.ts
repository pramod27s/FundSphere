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
