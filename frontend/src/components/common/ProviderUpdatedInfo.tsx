/**
 * Tiny inline info: "Details last changed 3 months ago" — shows when the
 * source page itself last changed (driven by `lastScrapedAt`, only bumped when
 * our checksum diff detects a provider-side change).
 *
 * `lastScrapedAt` is also set when FundSphere first stores a grant, so until
 * the page changes it only says when we added it. In that case (within a day
 * of `addedAt`) nothing is shown.
 *
 * This is intentionally subtler than FreshnessBadge: it's secondary context,
 * not a trust signal. Pairs with FreshnessBadge (which uses lastVerifiedAt
 * = "last time we visited").
 */
import { History } from 'lucide-react';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface ProviderUpdatedInfoProps {
  /** ISO timestamp of when the provider last changed the source page. */
  timestamp?: string | null;
  /** ISO timestamp of when FundSphere first stored the grant. */
  addedAt?: string | null;
  className?: string;
}

export default function ProviderUpdatedInfo({ timestamp, addedAt, className = '' }: ProviderUpdatedInfoProps) {
  if (!timestamp) return null;

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;

  const added = addedAt ? new Date(addedAt) : null;
  if (added && !Number.isNaN(added.getTime()) && parsed.getTime() - added.getTime() < ONE_DAY_MS) {
    return null;
  }

  const label = formatRelative(parsed);

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] text-brand-500 ${className}`}
      title={`The funder's page last changed: ${parsed.toLocaleString()}`}
    >
      <History className="w-3 h-3" />
      <span className="whitespace-nowrap">Details last changed {label}</span>
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
