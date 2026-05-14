/**
 * Funding-amount formatting utilities.
 *
 * Indian researchers think in Lakh/Crore, not millions. Generic
 * Intl.NumberFormat produces "₹50,00,000" which is technically correct
 * but reads slower than "₹50 Lakh". For non-INR currencies we fall back
 * to Intl so foreign grants still look right.
 */

const LAKH = 100_000;
const CRORE = 10_000_000;

/**
 * Format a single INR amount in Lakh/Crore.
 * - < 1 Lakh  → "₹50,000"
 * - < 1 Crore → "₹5 Lakh" or "₹5.5 Lakh"
 * - >= 1 Cr   → "₹2 Cr" or "₹2.5 Cr"
 *
 * @param compact if true, uses short suffix "L" / "Cr" (good for ranges and small chips)
 */
export function formatInr(amount: number, compact = false): string {
  if (!Number.isFinite(amount) || amount < 0) return '₹0';

  if (amount < LAKH) {
    return `₹${formatWithIndianGrouping(Math.round(amount))}`;
  }

  if (amount < CRORE) {
    const lakhs = amount / LAKH;
    return `₹${trimDecimal(lakhs)} ${compact ? 'L' : 'Lakh'}`;
  }

  const crores = amount / CRORE;
  return `₹${trimDecimal(crores)} Cr`;
}

/**
 * Format a min/max range. Handles missing bounds and currency variation.
 * Falls back to Intl for non-INR currencies.
 */
export function formatFundingRange(
  min: number | undefined,
  max: number | undefined,
  currency: string | undefined,
): string {
  const code = normalizeCurrencyCode(currency);

  if (code === 'INR') {
    if (typeof min === 'number' && typeof max === 'number') {
      // Compact suffix in ranges keeps cards from getting too wide.
      return `${formatInr(min, true)} – ${formatInr(max, true)}`;
    }
    if (typeof min === 'number') return `From ${formatInr(min)}`;
    if (typeof max === 'number') return `Up to ${formatInr(max)}`;
    return 'Funding amount not specified';
  }

  const formatter = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
  });

  if (typeof min === 'number' && typeof max === 'number') {
    return `${formatter.format(min)} – ${formatter.format(max)}`;
  }
  if (typeof min === 'number') return `From ${formatter.format(min)}`;
  if (typeof max === 'number') return `Up to ${formatter.format(max)}`;
  return 'Funding amount not specified';
}

export function normalizeCurrencyCode(raw?: string): string {
  if (!raw || !raw.trim()) return 'USD';

  const value = raw.trim().toUpperCase();
  if (value === 'RS' || value === 'INR' || value === 'RUPEE' || value === 'RUPEES' || value === '₹') {
    return 'INR';
  }
  if (value === '$' || value === 'US$' || value === 'DOLLAR' || value === 'DOLLARS') {
    return 'USD';
  }

  return /^[A-Z]{3}$/.test(value) ? value : 'USD';
}

/**
 * Strip trailing ".0" — "5.0 Lakh" → "5 Lakh", but keep "5.5 Lakh".
 * Caps at one decimal place to stay readable.
 */
function trimDecimal(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Indian digit grouping: 1,23,45,678 (not 12,345,678). Used for sub-Lakh
 * amounts where we don't switch to the Lakh/Cr suffix.
 */
function formatWithIndianGrouping(n: number): string {
  return n.toLocaleString('en-IN');
}
