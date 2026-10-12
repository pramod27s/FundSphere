package org.pramod.corebackend.service;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

class GrantDeadlineTest {

    @Test
    void aDeadlineWithNoTimeLastsTheWholeDay() {
        assertEquals(LocalDateTime.of(2026, 10, 13, 23, 59, 59),
                GrantService.endOfDayIfMidnight(LocalDateTime.of(2026, 10, 13, 0, 0)));
    }

    @Test
    void keepsARealTimeAndNoDeadline() {
        assertEquals(LocalDateTime.of(2026, 10, 13, 17, 0),
                GrantService.endOfDayIfMidnight(LocalDateTime.of(2026, 10, 13, 17, 0)));
        assertEquals(LocalDateTime.of(2026, 10, 13, 23, 59, 59),
                GrantService.endOfDayIfMidnight(LocalDateTime.of(2026, 10, 13, 23, 59, 59)));
        assertEquals(LocalDateTime.of(2026, 10, 13, 0, 0, 1),
                GrantService.endOfDayIfMidnight(LocalDateTime.of(2026, 10, 13, 0, 0, 1)));
        assertNull(GrantService.endOfDayIfMidnight(null));
    }
}
