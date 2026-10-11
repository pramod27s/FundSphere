import type { AwardStatus, BudgetHead, ReportingProfile, SubmissionPortal, UnspentPolicy } from '../../services/awardsService';
import { daysUntil, todayIso } from '../../utils/applicationDates';

const LAKH = 100_000;

export const HEAD_ORDER: BudgetHead[] = ['EQUIPMENT', 'MANPOWER', 'CONSUMABLES', 'TRAVEL', 'CONTINGENCY', 'OVERHEAD', 'OTHERS'];

export const HEAD_LABEL: Record<BudgetHead, string> = {
  EQUIPMENT: 'Equipment',
  MANPOWER: 'Manpower',
  CONSUMABLES: 'Consumables',
  TRAVEL: 'Travel',
  CONTINGENCY: 'Contingency',
  OVERHEAD: 'Overhead',
  OTHERS: 'Others',
};

export const PORTAL_ORDER: SubmissionPortal[] = ['ANRF', 'DBT_EPROMIS', 'ICMR_EPMS', 'OTHER'];

export const PORTAL_LABEL: Record<SubmissionPortal, string> = {
  ANRF: 'ANRF online portal',
  DBT_EPROMIS: 'DBT eProMIS',
  ICMR_EPMS: 'ICMR ePMS',
  OTHER: 'Another portal (add the link)',
};

export const UNSPENT_ORDER: UnspentPolicy[] = ['UNKNOWN', 'CARRY_FORWARD', 'LAPSES', 'DEDUCTED_NEXT_RELEASE'];

export const UNSPENT_LABEL: Record<UnspentPolicy, string> = {
  UNKNOWN: 'Not sure yet',
  CARRY_FORWARD: 'Carried forward to the next year',
  LAPSES: 'Lapses on 31 March',
  DEDUCTED_NEXT_RELEASE: 'Deducted from the next release',
};

export const AWARD_STATUS_META: Record<AwardStatus, { label: string; chip: string; dot: string }> = {
  ACTIVE: { label: 'Active', chip: 'bg-primary-50 text-primary-700 border-primary-200', dot: 'bg-primary-500' },
  CLOSED: { label: 'Closed', chip: 'bg-brand-100 text-brand-700 border-brand-200', dot: 'bg-brand-400' },
};

export const PROFILE_ORDER: ReportingProfile[] = ['ANRF', 'DST', 'ICMR', 'OTHER'];

/** The reporting rules each profile applies (4.2), as the form's options show them. */
export const PROFILE_LABEL: Record<ReportingProfile, string> = {
  ANRF: 'ANRF (formerly SERB): yearly reports',
  DST: 'DST: six-monthly reports',
  ICMR: 'ICMR: final report within a month',
  OTHER: 'Other agency: general defaults',
};

/** For sentences such as "worked out using ANRF's rules". */
export const PROFILE_RULES_NAME: Record<ReportingProfile, string> = {
  ANRF: "ANRF's",
  DST: "DST's",
  ICMR: "ICMR's",
  OTHER: "FundSphere's general",
};

/** Whose reporting rules an agency's grants follow; OTHER when we don't have its rules. ANRF is checked before DST. */
export function guessProfile(agency: string | null | undefined): ReportingProfile {
  const text = agency ?? '';
  if (/\b(ANRF|SERB)\b|anusandhan national research foundation/i.test(text)) return 'ANRF';
  if (/\bICMR\b|indian council of medical research/i.test(text)) return 'ICMR';
  if (/\bDST\b|department of science (and|&) technology/i.test(text)) return 'DST';
  return 'OTHER';
}

export type DeadlineTone = 'red' | 'amber' | 'green';

/** The plan's colours: red within 7 days or overdue, amber within 30, green beyond. */
export function deadlineStatus(dueDate: string, today: string = todayIso()): { tone: DeadlineTone; label: string } {
  const days = daysUntil(dueDate, today);
  if (days < 0) return { tone: 'red', label: `${-days} ${days === -1 ? 'day' : 'days'} overdue` };
  if (days === 0) return { tone: 'red', label: 'Due today' };
  if (days === 1) return { tone: 'red', label: 'Due tomorrow' };
  if (days <= 7) return { tone: 'red', label: `In ${days} days` };
  if (days <= 30) return { tone: 'amber', label: `In ${days} days` };
  return { tone: 'green', label: `In ${days} days` };
}

export const DEADLINE_TONE_CLASS: Record<DeadlineTone, { text: string; dot: string; chip: string }> = {
  red: { text: 'text-red-700', dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 border-red-200' },
  amber: { text: 'text-amber-800', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 border-amber-200' },
  green: { text: 'text-primary-700', dot: 'bg-primary-500', chip: 'bg-primary-50 text-primary-700 border-primary-200' },
};

/** The portal an agency's grants are usually reported on; OTHER when we don't know it. */
export function guessPortal(agency: string | null | undefined): SubmissionPortal {
  const text = agency ?? '';
  if (/\b(ANRF|SERB)\b/i.test(text)) return 'ANRF';
  if (/\bDBT\b|department of biotechnology/i.test(text)) return 'DBT_EPROMIS';
  if (/\bICMR\b/i.test(text)) return 'ICMR_EPMS';
  return 'OTHER';
}

/** The known portal a link points to, e.g. https://anrfonline.in/ANRF/… → ANRF; null for any other site. */
export function portalFromUrl(url: string): SubmissionPortal | null {
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).host.toLowerCase();
  } catch {
    return null;
  }
  if (host === 'anrfonline.in' || host.endsWith('.anrfonline.in')) return 'ANRF';
  if (host === 'dbtepromis.nic.in') return 'DBT_EPROMIS';
  if (host === 'epms.icmr.org.in') return 'ICMR_EPMS';
  return null;
}

/** 12,50,000 → "12.5" for the "₹ lakh" inputs; '' for nothing. */
export function rupeesToLakhInput(rupees: number | null | undefined): string {
  if (rupees === null || rupees === undefined || rupees === 0) return '';
  return String(Number((rupees / LAKH).toFixed(5)));
}

/**
 * Reads a "₹ lakh" input: '' → null, "12.5" → 12,50,000 rupees, and
 * anything that isn't a non-negative number → 'invalid'.
 */
export function parseLakhInput(text: string): number | null | 'invalid' {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '.') return 'invalid';
  return Math.round(Number(trimmed) * LAKH);
}

/** "3 years", "2 years 6 months" or "9 months", from the two YYYY-MM-DD dates. */
export function projectLength(startDate: string, endDate: string): string {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const days = (Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000 + 1;
  const months = Math.max(1, Math.round(days / 30.44));
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearText = years === 1 ? '1 year' : `${years} years`;
  const monthText = rest === 1 ? '1 month' : `${rest} months`;
  if (years === 0) return monthText;
  return rest === 0 ? yearText : `${yearText} ${monthText}`;
}
