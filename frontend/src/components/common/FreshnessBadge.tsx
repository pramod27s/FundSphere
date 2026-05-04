/**
 * Small "Verified X days ago" badge so users can tell at a glance whether
 * a grant's data is fresh or stale. Color-coded by age:
 *   - green  : <= 7 days   (fresh — trust the deadline / amount)
 *   - amber  : <= 30 days  (recent — probably still accurate)
 *   - red    : > 30 days   (stale — verify on provider site)
 *
 * Falls back gracefully if the backend hasn't sent a timestamp yet.
 */
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';

interface FreshnessBadgeProps {
  /** ISO timestamp string from the grant payload (lastScrapedAt or updatedAt). */
  timestamp?: string | null;
  /** Compact = small inline pill (for cards); full = larger pill (for the modal header). */
  size?: 'compact' | 'full';
  className?: string;
}

export default function FreshnessBadge({ timestamp, size = 'compact', className = '' }: FreshnessBadgeProps) {
  const meta = describeFreshness(timestamp);
  const Icon = meta.tone === 'green' ? ShieldCheck : meta.tone === 'red' ? ShieldAlert : ShieldQuestion;

  const tones = {
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    grey: 'bg-brand-50 text-brand-500 border-brand-200',
  } as const;

  const sizing =
    size === 'full'
      ? 'text-xs px-2.5 py-1 gap-1.5'
      : 'text-[10px] px-2 py-0.5 gap-1';

  const iconSize = size === 'full' ? 'w-3.5 h-3.5' : 'w-3 h-3';

  return (
    <span
      className={`inline-flex items-center rounded-md font-medium border ${tones[meta.tone]} ${sizing} ${className}`}
      title={meta.title}
    >
      <Icon className={iconSize} />
      <span className="whitespace-nowrap">{meta.label}</span>
    </span>
  );
}

function describeFreshness(timestamp?: string | null): {
  tone: 'green' | 'amber' | 'red' | 'grey';
  label: string;
  title: string;
} {
  if (!timestamp) {
    return { tone: 'grey', label: 'Freshness unknown', title: 'No verification timestamp available.' };
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return { tone: 'grey', label: 'Freshness unknown', title: 'Could not parse verification timestamp.' };
  }

  const ms = Date.now() - parsed.getTime();
  if (ms < 0) {
    // Future timestamp: clock skew or test data. Treat as "verified now."
    return { tone: 'green', label: 'Verified just now', title: parsed.toLocaleString() };
  }

  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let label: string;
  if (minutes < 1) label = 'Verified just now';
  else if (minutes < 60) label = `Verified ${minutes} min ago`;
  else if (hours < 24) label = `Verified ${hours}h ago`;
  else if (days === 1) label = 'Verified yesterday';
  else if (days < 30) label = `Verified ${days} days ago`;
  else if (days < 60) label = 'Verified 1 month ago';
  else if (days < 365) label = `Verified ${Math.floor(days / 30)} months ago`;
  else label = `Verified ${Math.floor(days / 365)}y ago`;

  let tone: 'green' | 'amber' | 'red' = 'green';
  if (days > 30) tone = 'red';
  else if (days > 7) tone = 'amber';

  return { tone, label, title: `Last verified: ${parsed.toLocaleString()}` };
}
