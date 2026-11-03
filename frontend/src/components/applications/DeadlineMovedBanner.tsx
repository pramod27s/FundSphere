import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { formatDay } from '../../utils/applicationDates';
import { buttonClasses } from '../common/buttonStyles';

/**
 * The agency has extended or moved the call's deadline since this
 * application copied it. Following it moves every checklist due date with
 * it; keeping the old date (an earlier internal deadline, say) hides this
 * until the call moves again. Renders nothing when the dates still match.
 */
export default function DeadlineMovedBanner({ deadline, movedTo, onFollow, onKeep }: {
  deadline: string | null;
  movedTo: string | null;
  onFollow: (movedTo: string) => Promise<void>;
  onKeep: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (!movedTo) return null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" className="rounded-lg border border-sky-200 bg-sky-50 text-sky-900 px-4 py-3 mb-5">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <CalendarClock className="w-4 h-4 shrink-0" aria-hidden="true" />
        {deadline
          ? `The call's deadline has moved from ${formatDay(deadline)} to ${formatDay(movedTo)}`
          : `The call now has a deadline: ${formatDay(movedTo)}`}
      </p>
      <p className="text-xs mt-1">
        {deadline
          ? 'The agency may have extended it. Using the new date moves every checklist due date with it.'
          : 'Using it sets the checklist due dates counted back from it.'}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => run(() => onFollow(movedTo))} className={buttonClasses('primary', 'sm')}>
          Use {formatDay(movedTo)}
        </button>
        {deadline && (
          <button type="button" disabled={busy} onClick={() => run(onKeep)} className={buttonClasses('secondary', 'sm')}>
            Keep {formatDay(deadline)}
          </button>
        )}
      </div>
    </div>
  );
}
