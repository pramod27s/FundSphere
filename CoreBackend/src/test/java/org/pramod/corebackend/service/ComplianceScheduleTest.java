package org.pramod.corebackend.service;

import org.junit.jupiter.api.Test;
import org.pramod.corebackend.entity.Award;
import org.pramod.corebackend.entity.ComplianceEvent;
import org.pramod.corebackend.enums.ComplianceEventOrigin;
import org.pramod.corebackend.enums.ComplianceEventStatus;
import org.pramod.corebackend.enums.ComplianceEventType;
import org.pramod.corebackend.enums.ReportingProfile;

import java.time.LocalDate;
import java.util.ArrayList;

import static org.junit.jupiter.api.Assertions.*;

class ComplianceScheduleTest {

    private static Award anrfGrant() {
        Award award = Award.builder().projectTitle("Sensors").reportingProfile(ReportingProfile.ANRF)
                .startDate(LocalDate.of(2026, 8, 15)).endDate(LocalDate.of(2029, 8, 14))
                .events(new ArrayList<>()).build();
        ComplianceSchedule.sync(award);
        return award;
    }

    private static ComplianceEvent event(Award award, String ruleKey) {
        return award.getEvents().stream().filter(e -> ruleKey.equals(e.getRuleKey())).findFirst().orElse(null);
    }

    @Test
    void newGrantGetsPendingRuleEvents() {
        Award award = anrfGrant();

        assertEquals(10, award.getEvents().size());
        assertTrue(award.getEvents().stream().allMatch(e ->
                e.getStatus() == ComplianceEventStatus.PENDING && e.getOrigin() == ComplianceEventOrigin.RULE
                        && e.getAward() == award && e.getBasis() != null));
    }

    @Test
    void syncingTwiceChangesNothing() {
        Award award = anrfGrant();
        ComplianceEvent uc = event(award, "UC_SE:2026");

        ComplianceSchedule.sync(award);

        assertEquals(10, award.getEvents().size());
        assertSame(uc, event(award, "UC_SE:2026"));
    }

    @Test
    void longerProjectKeepsWhatThePiDid() {
        Award award = anrfGrant();
        ComplianceEvent uc = event(award, "UC_SE:2026");
        uc.setStatus(ComplianceEventStatus.SUBMITTED);
        uc.setSubmittedOn(LocalDate.of(2027, 4, 20));
        ComplianceEvent report = event(award, "PROGRESS_REPORT:1");
        report.setDueDate(LocalDate.of(2027, 10, 1));
        report.setDueDateEdited(true);

        award.setEndDate(LocalDate.of(2030, 8, 14)); // a one-year extension
        ComplianceSchedule.sync(award);

        assertSame(uc, event(award, "UC_SE:2026"));
        assertEquals(ComplianceEventStatus.SUBMITTED, uc.getStatus());
        assertEquals(LocalDate.of(2027, 4, 20), uc.getSubmittedOn());
        assertEquals(LocalDate.of(2027, 10, 1), report.getDueDate(), "a date the PI moved stays moved");
        assertNotNull(event(award, "PROGRESS_REPORT:3"));
        assertNotNull(event(award, "UC_SE:2029"));
        assertEquals(LocalDate.of(2030, 11, 14), event(award, "FINAL_REPORT").getDueDate());
        assertEquals(LocalDate.of(2030, 5, 14), event(award, "EXTENSION_REQUEST").getDueDate());
    }

    @Test
    void shorterProjectDropsPendingEventsButKeepsSubmittedOnes() {
        Award award = anrfGrant();
        event(award, "UC_SE:2028").setStatus(ComplianceEventStatus.SUBMITTED);

        award.setEndDate(LocalDate.of(2028, 8, 14));
        ComplianceSchedule.sync(award);

        assertNull(event(award, "PROGRESS_REPORT:2"), "year 2 now ends with the project");
        assertNotNull(event(award, "UC_SE:2028"), "already submitted, so kept as history");
        assertNotNull(event(award, "UC_SE:2027"));
    }

    @Test
    void deadlinesThePiAddedAreNeverTouched() {
        Award award = anrfGrant();
        ComplianceEvent review = ComplianceEvent.builder().award(award).type(ComplianceEventType.CUSTOM)
                .title("Mid-term review presentation").dueDate(LocalDate.of(2028, 3, 12))
                .origin(ComplianceEventOrigin.MANUAL).status(ComplianceEventStatus.PENDING).build();
        award.getEvents().add(review);

        award.setStartDate(LocalDate.of(2026, 10, 1));
        award.setEndDate(LocalDate.of(2027, 9, 30));
        ComplianceSchedule.sync(award);

        assertTrue(award.getEvents().contains(review));
        assertEquals(LocalDate.of(2028, 3, 12), review.getDueDate());
    }

    @Test
    void changingTheProfileRewritesTheRuleEvents() {
        Award award = anrfGrant();

        award.setReportingProfile(ReportingProfile.DST);
        ComplianceSchedule.sync(award);

        assertEquals("Six-monthly progress report 1", event(award, "PROGRESS_REPORT:1").getTitle());
        assertNotNull(event(award, "PROGRESS_REPORT:5"));
        assertEquals(LocalDate.of(2030, 8, 14), event(award, "FINAL_REPORT").getDueDate());
        assertTrue(event(award, "FINAL_REPORT").getBasis().startsWith("DST:"));
    }

    @Test
    void ruleDueDateIsTheRulesDateEvenAfterTheDateWasMoved() {
        Award award = anrfGrant();
        ComplianceEvent uc = event(award, "UC_SE:2026");
        uc.setDueDate(LocalDate.of(2027, 6, 30));
        uc.setDueDateEdited(true);

        assertEquals(LocalDate.of(2027, 4, 30), ComplianceSchedule.ruleDueDate(award, uc));
    }
}
