/**
 * Overdue utilisation certificates and final reports on the user's grants
 * (fable.md §7, "pending-UC check"). Some agencies, ICMR for example, make
 * applicants certify that none is pending, so starting or preparing a new
 * application shows them as a warning. Worked out from My grants in the
 * browser, like the deadline badge; refreshes when any grant changes.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  fetchAwards,
  GRANTS_CHANGED_EVENT,
  type Award,
  type ComplianceEventType,
} from '../services/awardsService';
import { daysUntil, todayIso } from '../utils/applicationDates';

/** The documents an applicant may have to certify are not pending. */
const CERTIFIED_TYPES: ReadonlySet<ComplianceEventType> = new Set(['UC_SE', 'FINAL_UC_SE', 'FINAL_REPORT']);

export interface OverdueReport {
  awardId: number;
  projectTitle: string;
  agency: string | null;
  eventId: number;
  /** e.g. "UC and SE for FY 2025-26" */
  title: string;
  /** YYYY-MM-DD */
  dueDate: string;
  daysOverdue: number;
}

/** Pending UCs, SEs and final reports past their due date, most overdue first. */
export function overdueReports(awards: Award[], today: string = todayIso()): OverdueReport[] {
  const found: OverdueReport[] = [];
  for (const award of awards) {
    for (const event of award.events) {
      if (event.status !== 'PENDING' || !CERTIFIED_TYPES.has(event.type)) continue;
      const days = daysUntil(event.dueDate, today);
      if (days >= 0) continue;
      found.push({
        awardId: award.id,
        projectTitle: award.projectTitle,
        agency: award.agency,
        eventId: event.id,
        title: event.title,
        dueDate: event.dueDate,
        daysOverdue: -days,
      });
    }
  }
  return found.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export function useOverdueReports(): OverdueReport[] {
  const [overdue, setOverdue] = useState<OverdueReport[]>([]);

  const refresh = useCallback(() => {
    fetchAwards()
      .then((awards) => setOverdue(overdueReports(awards)))
      .catch(() => {
        // The warning is a help, not a gate: if grants can't load, show nothing.
      });
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(GRANTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(GRANTS_CHANGED_EVENT, refresh);
  }, [refresh]);

  return overdue;
}
