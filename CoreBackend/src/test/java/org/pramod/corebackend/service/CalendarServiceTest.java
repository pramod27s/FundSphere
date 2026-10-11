package org.pramod.corebackend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.entity.Application;
import org.pramod.corebackend.entity.Award;
import org.pramod.corebackend.entity.ChecklistItem;
import org.pramod.corebackend.entity.ComplianceEvent;
import org.pramod.corebackend.enums.ApplicationStatus;
import org.pramod.corebackend.enums.ChecklistItemStatus;
import org.pramod.corebackend.enums.ComplianceEventStatus;
import org.pramod.corebackend.enums.ReportingProfile;
import org.pramod.corebackend.enums.SubmissionPortal;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.repository.ApplicationRepository;
import org.pramod.corebackend.repository.AwardRepository;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CalendarServiceTest {

    private static final Long USER_ID = 7L;

    @Mock
    private AppUserRepository appUserRepository;
    @Mock
    private ApplicationRepository applicationRepository;
    @Mock
    private AwardRepository awardRepository;

    private CalendarService service;
    private AppUser user;

    @BeforeEach
    void setUp() {
        service = new CalendarService(appUserRepository, applicationRepository, awardRepository);
        user = AppUser.builder().id(USER_ID).build();
        lenient().when(appUserRepository.findById(USER_ID)).thenReturn(Optional.of(user));
    }

    private static Application application(long id, ApplicationStatus status) {
        Application application = Application.builder().id(id).title("Call " + id).deadline(LocalDate.of(2026, 12, 15))
                .status(status).items(new ArrayList<>()).build();
        application.getItems().add(ChecklistItem.builder().id(id * 10).text("HoI endorsement")
                .dueDate(LocalDate.of(2026, 12, 8)).status(ChecklistItemStatus.TODO).mandatory(true).build());
        return application;
    }

    /** An ANRF grant whose deadlines have ids 100, 101, ... in date order. */
    private static Award grant() {
        Award award = Award.builder().id(3L).projectTitle("Low-cost arsenic sensors").agency("ANRF")
                .reportingProfile(ReportingProfile.ANRF).submissionPortal(SubmissionPortal.ANRF)
                .startDate(LocalDate.of(2026, 8, 15)).endDate(LocalDate.of(2029, 8, 14))
                .events(new ArrayList<>()).build();
        ComplianceSchedule.sync(award);
        long id = 100;
        for (ComplianceEvent event : award.getEvents()) {
            event.setId(id++);
        }
        return award;
    }

    @Test
    void preparingApplicationsAndPendingGrantDeadlinesGoIn() {
        Award award = grant();
        award.getEvents().get(0).setStatus(ComplianceEventStatus.SUBMITTED);       // first UC done
        award.getEvents().get(1).setStatus(ComplianceEventStatus.NOT_APPLICABLE);  // year-1 report

        List<IcsCalendarWriter.IcsEvent> events = CalendarService.events(
                List.of(application(1, ApplicationStatus.PREPARING), application(2, ApplicationStatus.SUBMITTED)),
                List.of(award));

        List<String> uids = events.stream().map(IcsCalendarWriter.IcsEvent::uid).toList();
        assertTrue(uids.contains("application-1-deadline@fundsphere"));
        assertTrue(uids.contains("checklist-item-10@fundsphere"));
        assertFalse(uids.contains("application-2-deadline@fundsphere"), "already submitted");
        assertFalse(uids.contains("grant-deadline-100@fundsphere"), "submitted");
        assertFalse(uids.contains("grant-deadline-101@fundsphere"), "not applicable");
        assertEquals(2 + 8, events.size());
    }

    @Test
    void grantDeadlinesSayWhatTheyAreForAndWhereToSubmit() {
        IcsCalendarWriter.IcsEvent uc = CalendarService.events(List.of(), List.of(grant())).get(0);

        assertEquals("[Low-cost arsenic sensors] UC and SE for FY 2026-27", uc.summary());
        assertEquals(LocalDate.of(2027, 4, 30), uc.date());
        assertEquals(CalendarService.GRANT_REMINDER_DAYS, uc.remindDaysBefore());
        assertTrue(uc.description().contains("For 15 Aug 2026 to 31 Mar 2027"));
        assertTrue(uc.description().contains("The next instalment usually waits on this."));
        assertTrue(uc.description().contains("Why this date: ANRF:"));
        assertTrue(uc.description().contains("Submit on: https://anrfonline.in"));
    }

    @Test
    void theFileHasAWeekOfNoticeForGrantDeadlines() {
        String ics = IcsCalendarWriter.write(CalendarService.CALENDAR_NAME,
                CalendarService.events(List.of(application(1, ApplicationStatus.PREPARING)), List.of(grant())),
                Instant.parse("2026-10-11T10:00:00Z"));

        assertTrue(ics.contains("X-WR-CALNAME:FundSphere deadlines\r\n"));
        assertTrue(ics.contains("UID:grant-deadline-100@fundsphere\r\n"));
        assertTrue(ics.contains("TRIGGER:-P7D\r\n"));
        assertTrue(ics.contains("TRIGGER:-P1D\r\n"), "checklist items keep their day-before reminder");
    }

    @Test
    void aNewLinkStoresOnlyTheHashOfItsSecret() {
        String token = service.newSubscriptionToken(USER_ID);

        assertTrue(token.matches("[A-Za-z0-9_-]{43}"));
        assertEquals(CalendarService.hash(token), user.getCalendarTokenHash());
        assertNotEquals(token, user.getCalendarTokenHash());
        assertNotEquals(token, service.newSubscriptionToken(USER_ID), "a new link replaces the old one");
    }

    @Test
    void theLinkOpensTheOwnersCalendar() {
        String token = service.newSubscriptionToken(USER_ID);
        when(appUserRepository.findByCalendarTokenHash(CalendarService.hash(token))).thenReturn(Optional.of(user));
        when(applicationRepository.findAllByOwnerIdWithItems(USER_ID)).thenReturn(List.of());
        when(awardRepository.findAllByOwnerIdWithLines(USER_ID)).thenReturn(List.of(grant()));

        String ics = service.calendarForToken(token).orElseThrow();

        assertTrue(ics.contains("UC and SE for FY 2026-27"));
    }

    @Test
    void anUnknownOrMalformedLinkOpensNothing() {
        when(appUserRepository.findByCalendarTokenHash(anyString())).thenReturn(Optional.empty());

        assertTrue(service.calendarForToken("A".repeat(43)).isEmpty());
        assertTrue(service.calendarForToken("../../etc/passwd").isEmpty());
        assertTrue(service.calendarForToken(null).isEmpty());
        verify(applicationRepository, never()).findAllByOwnerIdWithItems(any());
    }

    @Test
    void turningTheLinkOffForgetsIt() {
        service.newSubscriptionToken(USER_ID);

        service.turnOffSubscriptionLink(USER_ID);

        assertNull(user.getCalendarTokenHash());
        assertFalse(service.hasSubscriptionLink(USER_ID));
    }
}
