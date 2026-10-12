package org.pramod.corebackend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pramod.corebackend.dto.award.AwardRequest;
import org.pramod.corebackend.dto.award.AwardRequest.BudgetLineRequest;
import org.pramod.corebackend.dto.award.AwardResponse;
import org.pramod.corebackend.dto.award.ComplianceEventRequest;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.entity.Application;
import org.pramod.corebackend.entity.Award;
import org.pramod.corebackend.entity.BudgetLine;
import org.pramod.corebackend.entity.ComplianceEvent;
import org.pramod.corebackend.enums.AwardStatus;
import org.pramod.corebackend.enums.BudgetHead;
import org.pramod.corebackend.enums.ComplianceEventOrigin;
import org.pramod.corebackend.enums.ComplianceEventStatus;
import org.pramod.corebackend.enums.ComplianceEventType;
import org.pramod.corebackend.enums.ReportingProfile;
import org.pramod.corebackend.enums.SubmissionPortal;
import org.pramod.corebackend.enums.UnspentPolicy;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.repository.ApplicationRepository;
import org.pramod.corebackend.repository.AwardRepository;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AwardServiceTest {

    private static final Long USER_ID = 7L;

    @Mock
    private AwardRepository awardRepository;
    @Mock
    private AppUserRepository appUserRepository;
    @Mock
    private ApplicationRepository applicationRepository;

    private AwardService service;

    @BeforeEach
    void setUp() {
        service = new AwardService(awardRepository, appUserRepository, applicationRepository);
        lenient().when(appUserRepository.findById(USER_ID)).thenReturn(Optional.of(AppUser.builder().id(USER_ID).build()));
        lenient().when(awardRepository.save(any(Award.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private static AwardRequest form(BudgetLineRequest... lines) {
        AwardRequest request = new AwardRequest();
        request.setProjectTitle("  Low-cost sensors for groundwater arsenic  ");
        request.setAgency("ANRF");
        request.setStartDate(LocalDate.of(2026, 8, 15));
        request.setEndDate(LocalDate.of(2029, 8, 14));
        request.setBudgetLines(List.of(lines));
        return request;
    }

    private static int status(ResponseStatusException ex) {
        return ex.getStatusCode().value();
    }

    @Test
    void keepsOnlyHeadsWithMoneyInStandardOrder() {
        AwardResponse award = service.create(USER_ID, form(
                new BudgetLineRequest(BudgetHead.TRAVEL, 50_000L),
                new BudgetLineRequest(BudgetHead.CONSUMABLES, 0L),
                new BudgetLineRequest(BudgetHead.EQUIPMENT, 12_00_000L),
                new BudgetLineRequest(BudgetHead.OVERHEAD, null))).award();

        assertEquals(List.of(BudgetHead.EQUIPMENT, BudgetHead.TRAVEL),
                award.getBudgetLines().stream().map(AwardResponse.BudgetLineResponse::head).toList());
        assertEquals(12_50_000L, award.getAllocatedTotal());
        assertEquals("Low-cost sensors for groundwater arsenic", award.getProjectTitle());
    }

    @Test
    void fillsDefaultsForWhatTheFormLeftOut() {
        AwardResponse award = service.create(USER_ID, form()).award();

        assertEquals(SubmissionPortal.OTHER, award.getSubmissionPortal());
        assertNull(award.getPortalUrl());
        assertEquals(UnspentPolicy.UNKNOWN, award.getUnspentPolicy());
        assertEquals(AwardStatus.ACTIVE, award.getStatus());
        assertNull(award.getTotalSanctioned());
        assertEquals(0L, award.getAllocatedTotal());
    }

    @Test
    void needsATitleAndBothDates() {
        AwardRequest noTitle = form();
        noTitle.setProjectTitle("   ");
        AwardRequest noEnd = form();
        noEnd.setEndDate(null);

        assertEquals(400, status(assertThrows(ResponseStatusException.class, () -> service.create(USER_ID, noTitle))));
        assertEquals(400, status(assertThrows(ResponseStatusException.class, () -> service.create(USER_ID, noEnd))));
    }

    @Test
    void endDateMustBeAfterStartDate() {
        AwardRequest sameDay = form();
        sameDay.setEndDate(sameDay.getStartDate());
        AwardRequest backwards = form();
        backwards.setEndDate(LocalDate.of(2025, 8, 14));

        assertThrows(ResponseStatusException.class, () -> service.create(USER_ID, sameDay));
        assertThrows(ResponseStatusException.class, () -> service.create(USER_ID, backwards));
    }

    @Test
    void rejectsAMistypedYearThatMakesTheProjectDecadesLong() {
        AwardRequest typo = form();
        typo.setEndDate(LocalDate.of(2092, 8, 14));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.create(USER_ID, typo));
        assertTrue(ex.getReason().contains("15 years"));
    }

    @Test
    void rejectsNegativeAmountsAndRepeatedHeads() {
        AwardRequest negativeTotal = form();
        negativeTotal.setTotalSanctioned(-1L);
        AwardRequest negativeHead = form(new BudgetLineRequest(BudgetHead.MANPOWER, -5L));
        AwardRequest twice = form(
                new BudgetLineRequest(BudgetHead.EQUIPMENT, 100L),
                new BudgetLineRequest(BudgetHead.EQUIPMENT, 200L));

        assertThrows(ResponseStatusException.class, () -> service.create(USER_ID, negativeTotal));
        assertTrue(assertThrows(ResponseStatusException.class, () -> service.create(USER_ID, negativeHead))
                .getReason().startsWith("Manpower"));
        assertEquals("Equipment is listed twice",
                assertThrows(ResponseStatusException.class, () -> service.create(USER_ID, twice)).getReason());
    }

    @Test
    void knownPortalUsesItsOwnLinkAndOtherUsesThePastedOne() {
        AwardRequest anrf = form();
        anrf.setSubmissionPortal(SubmissionPortal.ANRF);
        anrf.setPortalUrl("https://example.org/stale");
        AwardRequest other = form();
        other.setSubmissionPortal(SubmissionPortal.OTHER);
        other.setPortalUrl("onlinedst.gov.in");

        assertEquals("https://anrfonline.in", service.create(USER_ID, anrf).award().getPortalUrl());
        assertEquals("https://onlinedst.gov.in", service.create(USER_ID, other).award().getPortalUrl());
    }

    @Test
    void rejectsAPortalLinkThatIsNotHttp() {
        AwardRequest script = form();
        script.setPortalUrl("javascript:alert(1)");

        assertEquals(400, status(assertThrows(ResponseStatusException.class, () -> service.create(USER_ID, script))));
    }

    @Test
    void secondGrantFromTheSameApplicationReturnsTheFirst() {
        Award existing = Award.builder().id(3L).projectTitle("First").agency("ANRF")
                .startDate(LocalDate.of(2026, 8, 15)).endDate(LocalDate.of(2029, 8, 14)).build();
        when(awardRepository.findFirstByOwnerIdAndApplicationId(USER_ID, 11L)).thenReturn(Optional.of(existing));
        AwardRequest request = form();
        request.setApplicationId(11L);

        AwardService.CreateResult result = service.create(USER_ID, request);

        assertFalse(result.created());
        assertEquals(3L, result.award().getId());
        verify(awardRepository, never()).save(any());
    }

    @Test
    void grantFromAnApplicationIsLinkedToIt() {
        Application application = Application.builder().id(11L).title("ANRF Core Research Grant 2026").build();
        when(applicationRepository.findByIdAndOwnerId(11L, USER_ID)).thenReturn(Optional.of(application));
        AwardRequest request = form();
        request.setApplicationId(11L);

        AwardService.CreateResult result = service.create(USER_ID, request);

        assertTrue(result.created());
        assertEquals(11L, result.award().getApplicationId());
    }

    @Test
    void applicationOfAnotherUserIsNotFound() {
        when(applicationRepository.findByIdAndOwnerId(99L, USER_ID)).thenReturn(Optional.empty());
        AwardRequest request = form();
        request.setApplicationId(99L);

        assertEquals(404, status(assertThrows(ResponseStatusException.class, () -> service.create(USER_ID, request))));
        verify(awardRepository, never()).save(any());
    }

    @Test
    void updateChangesLinesInPlaceSoTheirIdsSurvive() {
        Award award = Award.builder().id(3L).projectTitle("Old").startDate(LocalDate.of(2026, 8, 15))
                .endDate(LocalDate.of(2029, 8, 14)).budgetLines(new ArrayList<>()).build();
        BudgetLine equipment = BudgetLine.builder().id(50L).award(award).head(BudgetHead.EQUIPMENT).allocated(100L).build();
        BudgetLine travel = BudgetLine.builder().id(51L).award(award).head(BudgetHead.TRAVEL).allocated(10L).build();
        award.getBudgetLines().addAll(List.of(equipment, travel));
        when(awardRepository.findByIdAndOwnerId(3L, USER_ID)).thenReturn(Optional.of(award));

        AwardResponse updated = service.update(USER_ID, 3L, form(
                new BudgetLineRequest(BudgetHead.EQUIPMENT, 200L),
                new BudgetLineRequest(BudgetHead.CONSUMABLES, 30L)));

        assertSame(equipment, award.getBudgetLines().get(0));
        assertEquals(200L, equipment.getAllocated());
        assertFalse(award.getBudgetLines().contains(travel));
        assertEquals(List.of(BudgetHead.EQUIPMENT, BudgetHead.CONSUMABLES),
                updated.getBudgetLines().stream().map(AwardResponse.BudgetLineResponse::head).toList());
        assertEquals(AwardStatus.ACTIVE, updated.getStatus());
    }

    // ------------------------------------------------------------------
    // Reporting deadlines (4.2)
    // ------------------------------------------------------------------

    /** A saved ANRF grant, 15 Aug 2026 to 14 Aug 2029, whose deadlines have ids 100, 101, ... in date order. */
    private Award savedGrant() {
        Award award = Award.builder().id(3L).projectTitle("Sensors").reportingProfile(ReportingProfile.ANRF)
                .startDate(LocalDate.of(2026, 8, 15)).endDate(LocalDate.of(2029, 8, 14))
                .budgetLines(new ArrayList<>()).events(new ArrayList<>()).build();
        ComplianceSchedule.sync(award);
        long id = 100;
        for (ComplianceEvent event : award.getEvents()) {
            event.setId(id++);
        }
        lenient().when(awardRepository.findByIdAndOwnerId(3L, USER_ID)).thenReturn(Optional.of(award));
        return award;
    }

    private static ComplianceEvent byKey(Award award, String ruleKey) {
        return award.getEvents().stream().filter(e -> ruleKey.equals(e.getRuleKey())).findFirst().orElseThrow();
    }

    private static ComplianceEventRequest change(ComplianceEventStatus status, LocalDate submittedOn) {
        ComplianceEventRequest request = new ComplianceEventRequest();
        request.setStatus(status);
        request.setSubmittedOn(submittedOn);
        return request;
    }

    @Test
    void newGrantGetsItsDeadlinesFromItsProfile() {
        AwardRequest request = form();
        request.setReportingProfile(ReportingProfile.ANRF);

        AwardResponse award = service.create(USER_ID, request).award();

        assertEquals(ReportingProfile.ANRF, award.getReportingProfile());
        assertEquals(10, award.getEvents().size());
        assertEquals("UC and SE for FY 2026-27", award.getNextEvent().title());
        assertEquals(LocalDate.of(2027, 4, 30), award.getNextEvent().dueDate());
    }

    @Test
    void grantWithoutAProfileFollowsTheGeneralDefaults() {
        AwardResponse award = service.create(USER_ID, form()).award();

        assertEquals(ReportingProfile.OTHER, award.getReportingProfile());
        assertTrue(award.getEvents().stream().anyMatch(e -> e.basis().startsWith("FundSphere default")));
    }

    @Test
    void markingSubmittedWithoutADateRecordsToday() {
        Award award = savedGrant();
        Long ucId = byKey(award, "UC_SE:2026").getId();

        AwardResponse updated = service.updateEvent(USER_ID, 3L, ucId, change(ComplianceEventStatus.SUBMITTED, null));

        assertEquals(ComplianceEventStatus.SUBMITTED, byKey(award, "UC_SE:2026").getStatus());
        assertEquals(LocalDate.now(), byKey(award, "UC_SE:2026").getSubmittedOn());
        assertEquals("Annual progress report, year 1", updated.getNextEvent().title());
    }

    @Test
    void aSubmissionDateInTheFutureIsRejected() {
        Award award = savedGrant();
        Long ucId = byKey(award, "UC_SE:2026").getId();

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
                service.updateEvent(USER_ID, 3L, ucId, change(ComplianceEventStatus.SUBMITTED, LocalDate.now().plusDays(1))));
        assertEquals("The submission date can't be in the future", ex.getReason());
    }

    @Test
    void backToPendingClearsTheSubmissionDate() {
        Award award = savedGrant();
        Long ucId = byKey(award, "UC_SE:2026").getId();
        service.updateEvent(USER_ID, 3L, ucId, change(ComplianceEventStatus.SUBMITTED, LocalDate.of(2026, 10, 1)));

        service.updateEvent(USER_ID, 3L, ucId, change(ComplianceEventStatus.PENDING, null));

        assertNull(byKey(award, "UC_SE:2026").getSubmittedOn());
    }

    @Test
    void aMovedDateCanBePutBack() {
        Award award = savedGrant();
        Long ucId = byKey(award, "UC_SE:2026").getId();
        ComplianceEventRequest move = new ComplianceEventRequest();
        move.setDueDate(LocalDate.of(2027, 6, 30));

        service.updateEvent(USER_ID, 3L, ucId, move);
        assertTrue(byKey(award, "UC_SE:2026").isDueDateEdited());

        ComplianceEventRequest reset = new ComplianceEventRequest();
        reset.setResetDueDate(true);
        service.updateEvent(USER_ID, 3L, ucId, reset);
        assertEquals(LocalDate.of(2027, 4, 30), byKey(award, "UC_SE:2026").getDueDate());
        assertFalse(byKey(award, "UC_SE:2026").isDueDateEdited());
    }

    @Test
    void deadlinesFromTheRulesCanBeMarkedNotApplicableButNotDeletedOrRenamed() {
        Award award = savedGrant();
        Long extensionId = byKey(award, "EXTENSION_REQUEST").getId();
        ComplianceEventRequest rename = new ComplianceEventRequest();
        rename.setTitle("Something else");

        assertEquals(400, status(assertThrows(ResponseStatusException.class,
                () -> service.deleteEvent(USER_ID, 3L, extensionId))));
        assertEquals(400, status(assertThrows(ResponseStatusException.class,
                () -> service.updateEvent(USER_ID, 3L, extensionId, rename))));

        service.updateEvent(USER_ID, 3L, extensionId, change(ComplianceEventStatus.NOT_APPLICABLE, null));
        assertEquals(ComplianceEventStatus.NOT_APPLICABLE, byKey(award, "EXTENSION_REQUEST").getStatus());
    }

    @Test
    void piCanAddAndRemoveTheirOwnDeadline() {
        Award award = savedGrant();
        ComplianceEventRequest review = new ComplianceEventRequest();
        review.setTitle("  Mid-term review presentation ");
        review.setDueDate(LocalDate.of(2028, 3, 12));

        service.addEvent(USER_ID, 3L, review);
        ComplianceEvent added = award.getEvents().stream()
                .filter(e -> e.getType() == ComplianceEventType.CUSTOM).findFirst().orElseThrow();
        assertEquals("Mid-term review presentation", added.getTitle());
        assertEquals(ComplianceEventOrigin.MANUAL, added.getOrigin());

        added.setId(999L);
        service.deleteEvent(USER_ID, 3L, 999L);
        assertFalse(award.getEvents().contains(added));
    }

    @Test
    void ownDeadlineNeedsANameAndADate() {
        savedGrant();
        ComplianceEventRequest noDate = new ComplianceEventRequest();
        noDate.setTitle("Mid-term review");

        assertEquals(400, status(assertThrows(ResponseStatusException.class,
                () -> service.addEvent(USER_ID, 3L, noDate))));
        assertEquals(400, status(assertThrows(ResponseStatusException.class,
                () -> service.addEvent(USER_ID, 3L, new ComplianceEventRequest()))));
    }

    @Test
    void deadlinesFromBeforeTheGrantWasAddedCanBeMarkedSubmittedTogether() {
        Award award = savedGrant();
        award.setCreatedAt(LocalDateTime.of(2028, 1, 1, 10, 0)); // added while already running

        service.submitPastEvents(USER_ID, 3L);

        assertEquals(ComplianceEventStatus.SUBMITTED, byKey(award, "UC_SE:2026").getStatus());
        assertNull(byKey(award, "UC_SE:2026").getSubmittedOn(), "the real date isn't known");
        assertEquals(ComplianceEventStatus.SUBMITTED, byKey(award, "PROGRESS_REPORT:1").getStatus());
        assertEquals(ComplianceEventStatus.PENDING, byKey(award, "UC_SE:2027").getStatus(), "due after it was added");
    }

    @Test
    void unknownDeadlineIsNotFound() {
        savedGrant();

        assertEquals(404, status(assertThrows(ResponseStatusException.class,
                () -> service.updateEvent(USER_ID, 3L, 12345L, change(ComplianceEventStatus.SUBMITTED, null)))));
    }

    @Test
    void updateOfAnotherUsersGrantIsNotFound() {
        when(awardRepository.findByIdAndOwnerId(3L, USER_ID)).thenReturn(Optional.empty());

        assertEquals(404, status(assertThrows(ResponseStatusException.class, () -> service.update(USER_ID, 3L, form()))));
    }

    // ------------------------------------------------------------------
    // Objectives (4.4)
    // ------------------------------------------------------------------

    @Test
    void objectivesDropPastedListMarkersAndBlankLines() {
        Award award = savedGrant();

        AwardResponse response = service.updateObjectives(USER_ID, 3L, List.of(
                "1. To develop a paper-strip arsenic sensor",
                "",
                "(b)  To validate it in   20 villages\r\nii) To train two JRFs",
                "• To publish the field data",
                "A low-cost kit for schools"));

        assertEquals(List.of(
                "To develop a paper-strip arsenic sensor",
                "To validate it in 20 villages",
                "To train two JRFs",
                "To publish the field data",
                "A low-cost kit for schools"), response.getObjectives());
        assertEquals(5, award.getObjectives().split("\n").length);
    }

    @Test
    void emptyObjectivesClearThem() {
        Award award = savedGrant();
        award.setObjectives("To develop a sensor");

        assertEquals(List.of(), service.updateObjectives(USER_ID, 3L, List.of("  ", "")).getObjectives());
        assertNull(award.getObjectives());
        assertEquals(List.of(), service.updateObjectives(USER_ID, 3L, null).getObjectives());
    }

    @Test
    void objectivesAreCappedInNumberAndLength() {
        savedGrant();
        List<String> sixteen = java.util.stream.IntStream.rangeClosed(1, 16).mapToObj(i -> "Objective " + i).toList();

        assertEquals(400, status(assertThrows(ResponseStatusException.class,
                () -> service.updateObjectives(USER_ID, 3L, sixteen))));
        assertEquals(400, status(assertThrows(ResponseStatusException.class,
                () -> service.updateObjectives(USER_ID, 3L, List.of("x".repeat(1001))))));
    }

    @Test
    void savingTheGrantFormKeepsTheObjectives() {
        Award award = savedGrant();
        award.setObjectives("To develop a sensor");

        AwardResponse response = service.update(USER_ID, 3L, form());

        assertEquals(List.of("To develop a sensor"), response.getObjectives());
    }
}
