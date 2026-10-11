package org.pramod.corebackend.service;

import org.junit.jupiter.api.Test;
import org.pramod.corebackend.enums.ComplianceEventType;
import org.pramod.corebackend.enums.ReportingProfile;
import org.pramod.corebackend.service.ComplianceRules.PlannedEvent;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

class ComplianceRulesTest {

    private static LocalDate d(int year, int month, int day) {
        return LocalDate.of(year, month, day);
    }

    private static Map<String, PlannedEvent> byKey(List<PlannedEvent> events) {
        return events.stream().collect(Collectors.toMap(PlannedEvent::ruleKey, Function.identity()));
    }

    private static List<PlannedEvent> ofType(List<PlannedEvent> events, ComplianceEventType type) {
        return events.stream().filter(e -> e.type() == type).toList();
    }

    @Test
    void anrfGrantStartingMidYear() {
        List<PlannedEvent> events = ComplianceRules.plan(ReportingProfile.ANRF, d(2026, 8, 15), d(2029, 8, 14));
        Map<String, PlannedEvent> key = byKey(events);

        // A UC for each financial year that ends inside the project; the first one is short.
        List<PlannedEvent> ucs = ofType(events, ComplianceEventType.UC_SE);
        assertEquals(List.of("UC and SE for FY 2026-27", "UC and SE for FY 2027-28", "UC and SE for FY 2028-29"),
                ucs.stream().map(PlannedEvent::title).toList());
        assertEquals(d(2026, 8, 15), key.get("UC_SE:2026").periodStart());
        assertEquals(d(2027, 3, 31), key.get("UC_SE:2026").periodEnd());
        assertEquals(d(2027, 4, 30), key.get("UC_SE:2026").dueDate());
        assertEquals(d(2027, 4, 1), key.get("UC_SE:2027").periodStart());
        assertFalse(key.containsKey("UC_SE:2029"), "April-August 2029 is covered by the final UC");

        // A report per project year; the final report replaces the third.
        List<PlannedEvent> reports = ofType(events, ComplianceEventType.PROGRESS_REPORT);
        assertEquals(2, reports.size());
        assertEquals(d(2027, 8, 14), key.get("PROGRESS_REPORT:1").periodEnd());
        assertEquals(d(2027, 9, 13), key.get("PROGRESS_REPORT:1").dueDate());
        assertEquals(d(2027, 8, 15), key.get("PROGRESS_REPORT:2").periodStart());

        assertEquals(d(2029, 5, 14), key.get("EXTENSION_REQUEST").dueDate());
        for (String closing : List.of("FINAL_REPORT", "FINAL_UC_SE", "EQUIPMENT_LIST", "REFUND_UNSPENT")) {
            assertEquals(d(2029, 11, 14), key.get(closing).dueDate(), closing);
        }
        assertEquals(10, events.size());
    }

    @Test
    void eventsComeInDateOrder() {
        List<PlannedEvent> events = ComplianceRules.plan(ReportingProfile.ANRF, d(2026, 8, 15), d(2029, 8, 14));

        for (int i = 1; i < events.size(); i++) {
            assertFalse(events.get(i).dueDate().isBefore(events.get(i - 1).dueDate()));
        }
    }

    @Test
    void projectEndingOn31MarchGetsOneFinalUcNotTwo() {
        List<PlannedEvent> events = ComplianceRules.plan(ReportingProfile.OTHER, d(2026, 4, 1), d(2029, 3, 31));
        Map<String, PlannedEvent> key = byKey(events);

        assertEquals(List.of("UC_SE:2026", "UC_SE:2027"),
                ofType(events, ComplianceEventType.UC_SE).stream().map(PlannedEvent::ruleKey).toList());
        assertEquals(2, ofType(events, ComplianceEventType.PROGRESS_REPORT).size());
        assertEquals(d(2029, 6, 30), key.get("FINAL_UC_SE").dueDate());
    }

    @Test
    void projectStartingInJanuaryHasAShortFirstFinancialYear() {
        List<PlannedEvent> events = ComplianceRules.plan(ReportingProfile.ICMR, d(2027, 1, 1), d(2029, 12, 31));
        Map<String, PlannedEvent> key = byKey(events);

        assertEquals("UC and SE for FY 2026-27", key.get("UC_SE:2026").title());
        assertEquals(d(2027, 1, 1), key.get("UC_SE:2026").periodStart());
        assertEquals(3, ofType(events, ComplianceEventType.UC_SE).size());
    }

    @Test
    void leapDayStartKeepsFullProjectYears() {
        assertEquals(d(2029, 3, 1), ComplianceRules.anniversary(d(2028, 2, 29), 1));
        assertEquals(d(2032, 2, 29), ComplianceRules.anniversary(d(2028, 2, 29), 4));

        Map<String, PlannedEvent> key = byKey(ComplianceRules.plan(ReportingProfile.ANRF, d(2028, 2, 29), d(2031, 2, 28)));

        assertEquals(d(2029, 2, 28), key.get("PROGRESS_REPORT:1").periodEnd());
        assertEquals(d(2029, 3, 1), key.get("PROGRESS_REPORT:2").periodStart());
        assertEquals(d(2030, 2, 28), key.get("PROGRESS_REPORT:2").periodEnd());
        assertFalse(key.containsKey("PROGRESS_REPORT:3"), "year 3 ends with the project");
    }

    @Test
    void endingOnALeapDayIsHandled() {
        Map<String, PlannedEvent> key = byKey(ComplianceRules.plan(ReportingProfile.OTHER, d(2025, 3, 1), d(2028, 2, 29)));

        assertEquals(d(2026, 2, 28), key.get("PROGRESS_REPORT:1").periodEnd());
        assertEquals(d(2027, 2, 28), key.get("PROGRESS_REPORT:2").periodEnd());
        assertEquals(d(2027, 11, 29), key.get("EXTENSION_REQUEST").dueDate());
        assertEquals(d(2028, 5, 29), key.get("FINAL_REPORT").dueDate());
    }

    @Test
    void dstReportsEverySixMonthsAndAllowsAYearToClose() {
        List<PlannedEvent> events = ComplianceRules.plan(ReportingProfile.DST, d(2026, 8, 15), d(2028, 8, 14));
        Map<String, PlannedEvent> key = byKey(events);

        List<PlannedEvent> reports = ofType(events, ComplianceEventType.PROGRESS_REPORT);
        assertEquals(4, reports.size());
        // The first period runs to the end of the sixth month; later ones start on the 1st.
        assertEquals(d(2026, 8, 15), key.get("PROGRESS_REPORT:1").periodStart());
        assertEquals(d(2027, 1, 31), key.get("PROGRESS_REPORT:1").periodEnd());
        assertEquals(d(2027, 3, 2), key.get("PROGRESS_REPORT:1").dueDate());
        assertEquals(d(2027, 2, 1), key.get("PROGRESS_REPORT:2").periodStart());
        assertEquals(d(2027, 7, 31), key.get("PROGRESS_REPORT:2").periodEnd());
        assertEquals(d(2028, 7, 31), key.get("PROGRESS_REPORT:4").periodEnd());
        assertEquals("Six-monthly progress report 4", key.get("PROGRESS_REPORT:4").title());

        assertEquals(d(2029, 8, 14), key.get("FINAL_REPORT").dueDate());
        assertTrue(key.get("FINAL_REPORT").basis().startsWith("DST:"));
    }

    @Test
    void icmrWantsTheFinalReportWithinAMonth() {
        Map<String, PlannedEvent> key = byKey(ComplianceRules.plan(ReportingProfile.ICMR, d(2027, 1, 1), d(2029, 12, 31)));

        assertEquals(d(2030, 1, 31), key.get("FINAL_REPORT").dueDate());
        assertTrue(key.get("FINAL_REPORT").basis().startsWith("ICMR:"));
    }

    @Test
    void defaultsSayTheyAreDefaults() {
        Map<String, PlannedEvent> key = byKey(ComplianceRules.plan(ReportingProfile.OTHER, d(2026, 4, 1), d(2029, 3, 31)));

        assertTrue(key.get("FINAL_REPORT").basis().startsWith("FundSphere default"));
        assertTrue(key.get("EXTENSION_REQUEST").basis().contains("check your sanction order"));
    }

    @Test
    void projectInsideOneFinancialYearHasOnlyTheExtensionAndClosing() {
        List<PlannedEvent> events = ComplianceRules.plan(ReportingProfile.OTHER, d(2026, 6, 1), d(2026, 12, 31));

        assertEquals(List.of(ComplianceEventType.EXTENSION_REQUEST, ComplianceEventType.FINAL_REPORT,
                        ComplianceEventType.FINAL_UC_SE, ComplianceEventType.EQUIPMENT_LIST, ComplianceEventType.REFUND_UNSPENT),
                events.stream().map(PlannedEvent::type).toList());
        assertEquals(d(2026, 9, 30), events.get(0).dueDate());
    }

    @Test
    void noExtensionDateForAProjectShorterThanThreeMonths() {
        List<PlannedEvent> events = ComplianceRules.plan(ReportingProfile.ANRF, d(2026, 6, 1), d(2026, 8, 15));

        assertTrue(ofType(events, ComplianceEventType.EXTENSION_REQUEST).isEmpty());
        assertEquals(4, events.size());
    }

    @Test
    void noDatesNoDeadlines() {
        assertTrue(ComplianceRules.plan(ReportingProfile.ANRF, d(2026, 8, 15), d(2026, 8, 15)).isEmpty());
        assertTrue(ComplianceRules.plan(ReportingProfile.ANRF, d(2026, 8, 15), null).isEmpty());
        assertFalse(ComplianceRules.plan(null, d(2026, 8, 15), d(2027, 8, 14)).isEmpty(), "no profile means OTHER");
    }

    @Test
    void financialYearLabels() {
        assertEquals("2026-27", ComplianceRules.financialYear(2026));
        assertEquals("2099-00", ComplianceRules.financialYear(2099));
    }
}
