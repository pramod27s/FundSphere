import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { Copy, Download, Link2, Loader2, X } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import {
  createSubscriptionLink,
  downloadDeadlinesCalendar,
  fetchSubscriptionStatus,
  turnOffSubscriptionLink,
} from '../../services/calendarService';

/** True when Google's servers couldn't reach the link (a local or private address). */
function isLocalLink(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host.endsWith('.local') || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * 4.2: put every deadline in the user's calendar: a one-off .ics download,
 * or a subscription link that calendar apps keep fetching. The link is shown
 * once, when it's made, because the server keeps only a hash of its secret.
 */
export default function CalendarSyncModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialog(dialogRef, onClose);

  const [active, setActive] = useState<boolean | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<'download' | 'link' | 'off' | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSubscriptionStatus()
      .then((value) => !cancelled && setActive(value))
      .catch(() => !cancelled && setActive(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const download = async () => {
    setBusy('download');
    try {
      await downloadDeadlinesCalendar();
      toast.success('Calendar file downloaded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the calendar file');
    } finally {
      setBusy(null);
    }
  };

  const makeLink = async () => {
    if (active && !window.confirm('Make a new link? The old one will stop working in any calendar that uses it.')) return;
    setBusy('link');
    try {
      setLink(await createSubscriptionLink());
      setActive(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the link');
    } finally {
      setBusy(null);
    }
  };

  const turnOff = async () => {
    if (!window.confirm('Turn off the link? Calendars subscribed to it will stop updating.')) return;
    setBusy('off');
    try {
      await turnOffSubscriptionLink();
      setActive(false);
      setLink(null);
      toast.success('Calendar link turned off');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not turn off the link');
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied');
    } catch {
      toast.error('Copy failed. Select the link and copy it yourself.');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="fixed inset-0 bg-brand-950/60" onClick={onClose} aria-hidden="true" />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white rounded-xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto relative z-10 ring-1 ring-brand-200/50"
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b border-brand-100">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-brand-900 tracking-tight">Put your deadlines in your calendar</h2>
            <p className="text-xs text-brand-500 mt-1">
              Every pending grant deadline, plus the deadlines and checklist items of applications you're preparing.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-brand-500 hover:text-brand-700 hover:bg-brand-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-6">
          <section>
            <h3 className="text-sm font-bold text-brand-900">Stay up to date (subscribe)</h3>
            <p className="text-xs text-brand-600 mt-1">
              Your calendar app keeps fetching this link, so new deadlines, moved dates and submissions show up by
              themselves. Google Calendar refreshes subscribed calendars every few hours.
            </p>

            {link ? (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={link}
                    onFocus={(e) => e.target.select()}
                    aria-label="Calendar subscription link"
                    className="flex-1 min-w-0 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2 text-xs text-brand-900 font-mono"
                  />
                  <button
                    type="button"
                    onClick={copy}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </button>
                </div>
                <p className="text-xs text-brand-600">
                  In Google Calendar on a computer: <span className="font-semibold">Other calendars + → From URL</span>,
                  paste the link, then <span className="font-semibold">Add calendar</span>. Keep the link private:
                  anyone with it can see your deadlines. This is the only time it's shown.
                </p>
                {isLocalLink(link) && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    This link points to this computer ({new URL(link).host}), so Google can't reach it yet. It will
                    work once FundSphere runs on a public address. Until then, use the download below.
                  </p>
                )}
              </div>
            ) : active === null ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-brand-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Checking your link…
              </p>
            ) : active ? (
              <p className="mt-3 text-xs text-brand-700 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
                A subscription link is active. For your safety it can't be shown again. Make a new one if you need it;
                the old one then stops working.
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {!link && (
                <button
                  type="button"
                  onClick={makeLink}
                  disabled={busy !== null || active === null}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60 shadow-xs"
                >
                  {busy === 'link' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  {active ? 'Make a new link' : 'Make a subscription link'}
                </button>
              )}
              {active && (
                <button
                  type="button"
                  onClick={turnOff}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {busy === 'off' && <Loader2 className="w-4 h-4 animate-spin" />}
                  Turn off the link
                </button>
              )}
            </div>
          </section>

          <section className="pt-5 border-t border-brand-100">
            <h3 className="text-sm font-bold text-brand-900">One-off copy (download)</h3>
            <p className="text-xs text-brand-600 mt-1">
              A calendar file of today's deadlines. Import it in Google Calendar on a computer:{' '}
              <span className="font-semibold">Settings → Import &amp; export → Import</span>. It won't update by
              itself, so subscribing is better once it works for you.
            </p>
            <button
              type="button"
              onClick={download}
              disabled={busy !== null}
              className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-brand-900 bg-white border border-brand-300 hover:bg-brand-50 disabled:opacity-60"
            >
              {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download calendar file
            </button>
          </section>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
