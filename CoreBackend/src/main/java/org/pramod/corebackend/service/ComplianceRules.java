/**
 * Works out a grant's reporting deadlines from its start and end dates and
 * its agency's reporting profile (4.2). Plain rules, no AI:
 *
 *   UC and SE      one per financial year (1 April - 31 March) that ends before
 *                  the project does; the last stretch is covered by the final UC.
 *   Progress       ANRF, ICMR, OTHER: one per project year counted from the start
 *   reports        date. DST: one every six months, the first period ending on the
 *                  last day of the sixth month. The last period is covered by the
 *                  final report.
 *   Extension      the last date to ask for a no-cost extension, 3 months before
 *   request        the end (ANRF's rule; a default for the others).
 *   Closing        final report, final UC and SE, equipment list and refund of the
 *   documents      unspent balance: 1 month after the end for ICMR, 1 year for DST,
 *                  and a 3-month default for ANRF and OTHER.
 *
 * Each event carries its basis: the agency rule behind its date, or a note
 * that the date is a FundSphere default to check against the sanction order.
 * The PI can move any date or mark an event not applicable.
 */
package org.pramod.corebackend.service;

import org.pramod.corebackend.enums.ComplianceEventType;
import org.pramod.corebackend.enums.ReportingProfile;

import java.time.LocalDate;
import java.time.Month;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

public final class ComplianceRules {

    /** A deadline the rules call for; ruleKey stays the same when the grant's dates change. */
    public record PlannedEvent(String ruleKey, ComplianceEventType type, String title,
                               LocalDate periodStart, LocalDate periodEnd, LocalDate dueDate, String basis) {
    }

    private enum ReportCycle { PROJECT_YEAR, SIX_MONTHS }

    private record Profile(ReportCycle reports, String reportBasis, String ucBasis, String extensionBasis,
                           Closing closing, String closingBasis) {
    }

    /** When the closing documents are due after the end date. */
    private enum Closing {
        ONE_MONTH, THREE_MONTHS, ONE_YEAR;

        LocalDate after(LocalDate end) {
            return switch (this) {
                case ONE_MONTH -> end.plusMonths(1);
                case THREE_MONTHS -> end.plusMonths(3);
                case ONE_YEAR -> end.plusYears(1);
            };
        }
    }

    /** Reports and UCs are due this long after the period they cover ends (30 April for a UC). */
    static final int DAYS_AFTER_PERIOD = 30;
    static final int EXTENSION_MONTHS_BEFORE_END = 3;

    private static final String DEFAULT = "FundSphere default; check your sanction order and change the date if it says otherwise.";
    private static final String UC_DEFAULT = "A UC and SE for each financial year. FundSphere asks for them by 30 April, "
            + "1 month after the year ends; the government's outer limit (GFR 238) is 12 months, but the next "
            + "instalment usually waits on them.";

    private static final Profile ANRF = new Profile(
            ReportCycle.PROJECT_YEAR,
            "ANRF: an annual progress report each project year, counted from the start date. "
                    + "FundSphere allows 1 month after the year ends.",
            "ANRF: submit the UC and SE right after the financial year ends on 31 March. "
                    + "FundSphere asks for them by 30 April; the next instalment waits on them.",
            "ANRF: request a no-cost extension on the portal at least 3 months before the end date.",
            Closing.THREE_MONTHS,
            "FundSphere default: ANRF's deadline for the closing documents wasn't found. " + DEFAULT);
    private static final Profile DST = new Profile(
            ReportCycle.SIX_MONTHS,
            "DST: a progress report every six months; the first period ends on the last day of the sixth month. "
                    + "FundSphere allows 1 month after each period.",
            "DST: a UC and audited SE for each financial year. FundSphere asks for them by 30 April.",
            "FundSphere default: 3 months before the end date. " + DEFAULT,
            Closing.ONE_YEAR,
            "DST: the final SE, UC and project completion report are due within one year of the completion date.");
    private static final Profile ICMR = new Profile(
            ReportCycle.PROJECT_YEAR,
            "ICMR: an annual report each year. FundSphere allows 1 month after each project year, "
                    + "as in ICMR's Emeritus Scientist guidance.",
            "ICMR: a statement of accounts and UC every year. FundSphere uses the financial year and asks for them by 30 April.",
            "FundSphere default: 3 months before the end date. " + DEFAULT,
            Closing.ONE_MONTH,
            "ICMR: the final report and the list of articles are due within one month of the project's end.");
    private static final Profile OTHER = new Profile(
            ReportCycle.PROJECT_YEAR,
            "FundSphere default: an annual progress report each project year, 1 month after the year ends. " + DEFAULT,
            UC_DEFAULT,
            "FundSphere default: 3 months before the end date. " + DEFAULT,
            Closing.THREE_MONTHS,
            "FundSphere default: 3 months after the end date. " + DEFAULT);

    private ComplianceRules() {
    }

    /** Every deadline for a project running from start to end (both inclusive), in date order. */
    public static List<PlannedEvent> plan(ReportingProfile reportingProfile, LocalDate start, LocalDate end) {
        if (start == null || end == null || !end.isAfter(start)) {
            return List.of();
        }
        Profile profile = profile(reportingProfile);
        List<PlannedEvent> events = new ArrayList<>();
        addUcSe(events, profile, start, end);
        if (profile.reports() == ReportCycle.SIX_MONTHS) {
            addSixMonthlyReports(events, profile, start, end);
        } else {
            addAnnualReports(events, profile, start, end);
        }

        LocalDate extension = end.minusMonths(EXTENSION_MONTHS_BEFORE_END);
        if (extension.isAfter(start)) {
            events.add(new PlannedEvent("EXTENSION_REQUEST", ComplianceEventType.EXTENSION_REQUEST,
                    "Last date to request a no-cost extension, if you need one", null, null, extension,
                    profile.extensionBasis()));
        }

        LocalDate closingDue = profile.closing().after(end);
        events.add(closing(ComplianceEventType.FINAL_REPORT, "Final technical report (project completion report)", start, end, closingDue, profile));
        events.add(closing(ComplianceEventType.FINAL_UC_SE, "Final UC and SE", start, end, closingDue, profile));
        events.add(closing(ComplianceEventType.EQUIPMENT_LIST, "List of equipment and other assets bought", start, end, closingDue, profile));
        events.add(closing(ComplianceEventType.REFUND_UNSPENT, "Refund of the unspent balance", start, end, closingDue, profile));

        events.sort((a, b) -> a.dueDate().compareTo(b.dueDate()));
        return events;
    }

    /** A UC and SE for each financial year that ends before the project does. */
    private static void addUcSe(List<PlannedEvent> events, Profile profile, LocalDate start, LocalDate end) {
        int fyStartYear = start.getMonthValue() >= Month.APRIL.getValue() ? start.getYear() : start.getYear() - 1;
        for (int year = fyStartYear; ; year++) {
            LocalDate fyEnd = LocalDate.of(year + 1, Month.MARCH, 31);
            if (!fyEnd.isBefore(end)) {
                return; // this year's money goes in the final UC
            }
            LocalDate fyStart = LocalDate.of(year, Month.APRIL, 1);
            events.add(new PlannedEvent("UC_SE:" + year, ComplianceEventType.UC_SE,
                    "UC and SE for FY " + financialYear(year),
                    fyStart.isBefore(start) ? start : fyStart, fyEnd, fyEnd.plusDays(DAYS_AFTER_PERIOD),
                    profile.ucBasis()));
        }
    }

    /** One report per project year; the final report covers the last one. */
    private static void addAnnualReports(List<PlannedEvent> events, Profile profile, LocalDate start, LocalDate end) {
        LocalDate periodStart = start;
        for (int year = 1; ; year++) {
            LocalDate periodEnd = anniversary(start, year).minusDays(1);
            if (!periodEnd.isBefore(end)) {
                return;
            }
            events.add(new PlannedEvent("PROGRESS_REPORT:" + year, ComplianceEventType.PROGRESS_REPORT,
                    "Annual progress report, year " + year, periodStart, periodEnd,
                    periodEnd.plusDays(DAYS_AFTER_PERIOD), profile.reportBasis()));
            periodStart = periodEnd.plusDays(1);
        }
    }

    /**
     * DST's six-monthly reports: the first period runs to the last day of the
     * sixth month (counting the start month), each later one starts on the first
     * of the next month.
     */
    private static void addSixMonthlyReports(List<PlannedEvent> events, Profile profile, LocalDate start, LocalDate end) {
        LocalDate periodStart = start;
        for (int number = 1; ; number++) {
            LocalDate periodEnd = YearMonth.from(periodStart).plusMonths(5).atEndOfMonth();
            if (!periodEnd.isBefore(end)) {
                return;
            }
            events.add(new PlannedEvent("PROGRESS_REPORT:" + number, ComplianceEventType.PROGRESS_REPORT,
                    "Six-monthly progress report " + number, periodStart, periodEnd,
                    periodEnd.plusDays(DAYS_AFTER_PERIOD), profile.reportBasis()));
            periodStart = periodEnd.plusDays(1);
        }
    }

    private static PlannedEvent closing(ComplianceEventType type, String title, LocalDate start, LocalDate end,
                                        LocalDate due, Profile profile) {
        return new PlannedEvent(type.name(), type, title, start, end, due, profile.closingBasis());
    }

    /**
     * The start of project year (n + 1). A project starting on 29 February
     * has its anniversaries on 1 March in other years, so year 1 ends on
     * 28 February and not a day early.
     */
    static LocalDate anniversary(LocalDate start, int years) {
        LocalDate next = start.plusYears(years);
        boolean leapDayStart = start.getMonth() == Month.FEBRUARY && start.getDayOfMonth() == 29;
        return leapDayStart && next.getDayOfMonth() == 28 ? next.plusDays(1) : next;
    }

    /** 2026 -> "2026-27". */
    static String financialYear(int startYear) {
        return startYear + "-" + String.format("%02d", (startYear + 1) % 100);
    }

    private static Profile profile(ReportingProfile profile) {
        if (profile == null) {
            return OTHER;
        }
        return switch (profile) {
            case ANRF -> ANRF;
            case DST -> DST;
            case ICMR -> ICMR;
            case OTHER -> OTHER;
        };
    }
}
