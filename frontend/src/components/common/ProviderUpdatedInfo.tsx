/**
 * Tiny inline info: "Provider updated 3 months ago" — shows when the source
 * page itself last changed (driven by `lastScrapedAt`, only bumped when our
 * checksum diff detects a real provider-side change).
 *
 * This is intentionally subtler than FreshnessBadge: it's secondary context,
 * not a trust signal. Pairs with FreshnessBadge (which uses lastVerifiedAt
 * = "last time we visited").
 */
import { History } from 'lucide-react';

interface ProviderUpdatedInfoProps {
  /** ISO timestamp of when the provider last changed the source page. */
  timestamp?: string | null;
  className?: string;
}

export default function ProviderUpdatedInfo({ timestamp, className = '' }: ProviderUpdatedInfoProps) {
  if (!timestamp) return null;

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;

  const label = formatRelative(parsed);

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] text-brand-400 ${className}`}
      title={`Provider's source page last changed: ${parsed.toLocaleString()}`}
    >
      <History className="w-3 h-3" />
      <span className="whitespace-nowrap">Provider updated {label}</span>
    </span>
  );
}

function formatRelative(parsed: Date): string {
  const ms = Date.now() - parsed.getTime();
  if (ms < 0) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 60) return '1 month ago';
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)}y ago`;
}
