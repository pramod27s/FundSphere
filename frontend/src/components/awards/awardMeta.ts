import type {
  Award,
  AwardOutputType,
  AwardStatus,
  BudgetHead,
  ReportingProfile,
  SubmissionPortal,
  UnspentPolicy,
} from '../../services/awardsService';
import { daysUntil, formatDay, todayIso } from '../../utils/applicationDates';

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

/** How much of the project's time has gone, e.g. "Year 1 of 3 · 5% of the time used". */
export function timeUsed(award: Pick<Award, 'startDate' | 'endDate'>, today: string = todayIso()): { percent: number; label: string } {
  const totalDays = daysUntil(award.endDate, award.startDate) + 1;
  const goneDays = daysUntil(today, award.startDate);
  if (goneDays < 0) return { percent: 0, label: `Starts ${formatDay(award.startDate)}` };
  if (goneDays >= totalDays) return { percent: 100, label: `Ended ${formatDay(award.endDate)}` };
  const percent = Math.round((goneDays / totalDays) * 100);
  const years = Math.max(1, Math.ceil(Math.round(totalDays / 30.44) / 12));
  const year = Math.min(years, Math.floor(goneDays / 30.44 / 12) + 1);
  return { percent, label: years === 1 ? `${percent}% of the time used` : `Year ${year} of ${years} · ${percent}% of the time used` };
}

export const OUTPUT_ORDER: AwardOutputType[] = ['PAPER', 'STUDENT', 'EQUIPMENT', 'PATENT', 'MILESTONE', 'OTHER'];

/** How the quick-add form and the grant page name each kind of output (4.4). */
export const OUTPUT_META: Record<
  AwardOutputType,
  {
    label: string;
    group: string;
    titleLabel: string;
    titlePlaceholder: string;
    detailsLabel: string;
    detailsPlaceholder: string;
    dateLabel: string;
    /** null when the kind has no reference number. */
    referenceLabel: string | null;
    referencePlaceholder?: string;
    /** Whether the form asks for an amount (the equipment's cost). */
    amount: boolean;
  }
> = {
  PAPER: {
    label: 'Paper',
    group: 'Papers',
    titleLabel: 'Title',
    titlePlaceholder: 'e.g. Paper-strip sensing of arsenic in groundwater',
    detailsLabel: 'Journal or conference',
    detailsPlaceholder: 'e.g. Journal of Hazardous Materials',
    dateLabel: 'Published',
    referenceLabel: 'DOI',
    referencePlaceholder: 'e.g. 10.1016/j.jhazmat.2027.123456',
    amount: false,
  },
  STUDENT: {
    label: 'Student',
    group: 'Students trained',
    titleLabel: "Student's name",
    titlePlaceholder: 'e.g. Ravi Kumar',
    detailsLabel: 'Role and status',
    detailsPlaceholder: 'e.g. JRF, joined Sep 2026, working on sensor calibration',
    dateLabel: 'Joined or finished',
    referenceLabel: null,
    amount: false,
  },
  EQUIPMENT: {
    label: 'Equipment',
    group: 'Equipment bought',
    titleLabel: 'Item',
    titlePlaceholder: 'e.g. Portable XRF analyser',
    detailsLabel: 'Details',
    detailsPlaceholder: 'e.g. Installed and working in the Water Lab',
    dateLabel: 'Bought or installed',
    referenceLabel: null,
    amount: true,
  },
  PATENT: {
    label: 'Patent',
    group: 'Patents',
    titleLabel: 'Title',
    titlePlaceholder: 'e.g. A paper-based arsenic test kit',
    detailsLabel: 'Status',
    detailsPlaceholder: 'e.g. Filed, examination requested',
    dateLabel: 'Filed or granted',
    referenceLabel: 'Application or patent number',
    referencePlaceholder: 'e.g. 202641012345',
    amount: false,
  },
  MILESTONE: {
    label: 'Milestone',
    group: 'Milestones reached',
    titleLabel: 'What was achieved',
    titlePlaceholder: 'e.g. Prototype tested in 5 villages',
    detailsLabel: 'Details',
    detailsPlaceholder: 'e.g. Arsenic above 10 ppb found in 23 of 60 wells',
    dateLabel: 'Reached on',
    referenceLabel: null,
    amount: false,
  },
  OTHER: {
    label: 'Other',
    group: 'Other outputs',
    titleLabel: 'What it is',
    titlePlaceholder: 'e.g. Invited talk at IIT Bombay, a training workshop, a dataset',
    detailsLabel: 'Details',
    detailsPlaceholder: 'Anything worth reporting about it',
    dateLabel: 'Date',
    referenceLabel: 'Link or reference',
    amount: false,
  },
};

/** "2027" → "2027", "2027-03" → "Mar 2027", "2027-03-14" → "14 Mar 2027". */
export function formatPartialDate(date: string): string {
  if (/^\d{4}$/.test(date)) return date;
  if (/^\d{4}-\d{2}$/.test(date)) return formatDay(`${date}-01`).replace(/^1 /, '');
  return formatDay(date);
}

/**
 * True when no day a (possibly partial) date could mean falls within the
 * project. "2026-02-31" is a fine upper bound for February: it only takes
 * part in string comparisons.
 */
export function outsidePeriod(date: string, startDate: string, endDate: string): boolean {
  const first = date.length === 4 ? `${date}-01-01` : date.length === 7 ? `${date}-01` : date;
  const last = date.length === 4 ? `${date}-12-31` : date.length === 7 ? `${date}-31` : date;
  return last < startDate || first > endDate;
}

/** A DOI's link, or null when the reference isn't a DOI. */
export function doiUrl(reference: string | null): string | null {
  if (!reference) return null;
  const doi = reference.trim().replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  return doi.startsWith('10.') ? `https://doi.org/${doi}` : null;
}
