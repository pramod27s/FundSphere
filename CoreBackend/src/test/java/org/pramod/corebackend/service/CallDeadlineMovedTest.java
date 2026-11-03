package org.pramod.corebackend.service;

import org.junit.jupiter.api.Test;
import org.pramod.corebackend.entity.Application;
import org.pramod.corebackend.entity.Grant;

import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

/** An application notices when the agency extends or moves its call's deadline. */
class CallDeadlineMovedTest {

    private static final LocalDate COPIED = LocalDate.of(2026, 12, 15);
    private static final LocalDate EXTENDED = LocalDate.of(2026, 12, 31);

    private static Grant callDueAt(LocalDate day) {
        return Grant.builder().applicationDeadline(day == null ? null : day.atTime(23, 59, 59)).build();
    }

    @Test
    void offersTheCallsNewDeadlineAfterAnExtension() {
        Application application = Application.builder().grant(callDueAt(EXTENDED)).deadline(COPIED).build();

        assertEquals(EXTENDED, ApplicationService.callDeadlineMovedTo(application));
    }

    @Test
    void offersTheCallsDeadlineWhenTheApplicationHasNone() {
        Application application = Application.builder().grant(callDueAt(EXTENDED)).build();

        assertEquals(EXTENDED, ApplicationService.callDeadlineMovedTo(application));
    }

    @Test
    void saysNothingWhenTheDatesMatch() {
        Application application = Application.builder()
                .grant(Grant.builder().applicationDeadline(LocalDateTime.of(2026, 12, 15, 23, 59, 59)).build())
                .deadline(COPIED).build();

        assertNull(ApplicationService.callDeadlineMovedTo(application));
    }

    @Test
    void saysNothingForACallOutsideFundSphereOrWithoutAFixedDeadline() {
        assertNull(ApplicationService.callDeadlineMovedTo(Application.builder().deadline(COPIED).build()));
        assertNull(ApplicationService.callDeadlineMovedTo(
                Application.builder().grant(callDueAt(null)).deadline(COPIED).build()));
    }

    @Test
    void staysQuietAboutADateTheUserChoseNotToFollowButSpeaksUpIfTheCallMovesAgain() {
        Application application = Application.builder()
                .grant(callDueAt(EXTENDED)).deadline(COPIED).ignoredCallDeadline(EXTENDED).build();
        assertNull(ApplicationService.callDeadlineMovedTo(application));

        LocalDate extendedAgain = LocalDate.of(2027, 1, 10);
        application.setGrant(callDueAt(extendedAgain));
        assertEquals(extendedAgain, ApplicationService.callDeadlineMovedTo(application));
    }
}
