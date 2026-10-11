/**
 * How many grant deadlines need attention now (4.2): pending ones that are
 * overdue or due within 7 days, the plan's "red" deadlines. Drives the badge
 * on the My grants tab. Refreshes when any grant changes (GRANTS_CHANGED_EVENT)
 * and when the user comes back to the tab, since deadlines move with the date.
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchAwards, GRANTS_CHANGED_EVENT, type Award } from '../services/awardsService';
import { daysUntil, todayIso } from '../utils/applicationDates';

const URGENT_DAYS = 7;

export function countUrgentDeadlines(awards: Award[], today: string = todayIso()): number {
  let count = 0;
  for (const award of awards) {
    for (const event of award.events) {
      if (event.status === 'PENDING' && daysUntil(event.dueDate, today) <= URGENT_DAYS) count += 1;
    }
  }
  return count;
}

export function useDeadlineAlerts(): { urgent: number } {
  const [urgent, setUrgent] = useState(0);

  const refresh = useCallback(() => {
    fetchAwards()
      .then((awards) => setUrgent(countUrgentDeadlines(awards)))
      .catch(() => {
        // The badge is a nicety; a failed refresh keeps the last count.
      });
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener(GRANTS_CHANGED_EVENT, refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(GRANTS_CHANGED_EVENT, refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return { urgent };
}
