/**
 * WhatsApp share for grants.
 *
 * WhatsApp is the dominant sharing channel in Indian academia (much
 * more than email — lab groups, advisor chats, alumni networks). The
 * `wa.me/?text=...` pattern works without any API key or auth:
 *  - On desktop → opens WhatsApp Web, lets user pick a recipient
 *  - On mobile  → opens the native WhatsApp app with the text pre-filled
 *
 * Falls back to navigator.share when available (mobile share-sheet) so
 * users can pick a different app.
 */
import type { DiscoveryGrant } from '../services/discoveryService';
import { formatRelativeDeadline } from './formatDeadline';

/**
 * Build the WhatsApp message body. Uses WhatsApp's *asterisk* convention
 * for bold. Keeps it scannable — title, funder, funding, deadline,
 * apply link, light attribution.
 */
export function buildShareMessage(grant: DiscoveryGrant): string {
  const lines: string[] = ['Check out this grant:', ''];

  lines.push(`*${grant.title}*`);
  if (grant.funder) lines.push(`Funder: ${grant.funder}`);
  if (grant.amount && grant.amount !== 'Funding amount not specified') {
    lines.push(`Funding: ${grant.amount}`);
  }

  const deadline = formatRelativeDeadline(grant.deadlineRaw);
  if (deadline.tone !== 'unknown') {
    const detail = deadline.tooltip ? ` (${deadline.tooltip})` : '';
    lines.push(`Deadline: ${deadline.label}${detail}`);
  }

  const applyUrl = grant.applicationLink || grant.grantUrl;
  if (applyUrl) {
    lines.push('', `Apply: ${applyUrl}`);
  }

  lines.push('', '— shared via FundSphere');

  return lines.join('\n');
}

/**
 * Open the share UI. Tries the native share-sheet first (mobile) for
 * the best UX, then falls back to wa.me. The wa.me URL works for both
 * WhatsApp Web and the native app.
 */
export function shareGrantToWhatsApp(grant: DiscoveryGrant): void {
  const message = buildShareMessage(grant);

  // Native share-sheet — Android Chrome / iOS Safari surface every
  // install share target (WhatsApp, Telegram, mail, etc.). Strictly
  // optional; the wa.me URL works everywhere.
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    void navigator
      .share({
        title: grant.title,
        text: message,
      })
      .catch(() => {
        // User cancelled or share unsupported — fall through silently.
        openWhatsAppFallback(message);
      });
    return;
  }

  openWhatsAppFallback(message);
}

function openWhatsAppFallback(message: string): void {
  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
