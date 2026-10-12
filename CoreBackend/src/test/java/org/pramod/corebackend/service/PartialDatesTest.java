package org.pramod.corebackend.service;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

class PartialDatesTest {

    @Test
    void keepsAsMuchOfAnOrcidDateAsIsValid() {
        assertEquals("2027-03-14", PartialDates.of("2027", "03", "14"));
        assertEquals("2027-03", PartialDates.of("2027", "3", null));
        assertEquals("2027", PartialDates.of("2027", null, "14"));
        assertEquals("2028-02-29", PartialDates.of("2028", "02", "29"));
        assertEquals("2027-02", PartialDates.of("2027", "02", "29"), "2027 is not a leap year");
        assertEquals("2027", PartialDates.of("2027", "13", null));
        assertNull(PartialDates.of(null, "03", "14"));
        assertNull(PartialDates.of("27", null, null));
        assertNull(PartialDates.of("year", null, null));
    }

    @Test
    void acceptsOnlyRealDatesInTheThreeForms() {
        assertEquals("2027", PartialDates.normalise(" 2027 "));
        assertEquals("2027-03", PartialDates.normalise("2027-03"));
        assertEquals("2027-03-14", PartialDates.normalise("2027-03-14"));
        assertNull(PartialDates.normalise("   "));
        assertNull(PartialDates.normalise(null));
        assertThrows(IllegalArgumentException.class, () -> PartialDates.normalise("2027-02-30"));
        assertThrows(IllegalArgumentException.class, () -> PartialDates.normalise("2027-3"));
        assertThrows(IllegalArgumentException.class, () -> PartialDates.normalise("14/03/2027"));
        assertThrows(IllegalArgumentException.class, () -> PartialDates.normalise("1850"));
    }

    @Test
    void spansEveryDayAPartialDateCouldMean() {
        assertEquals(LocalDate.of(2027, 1, 1), PartialDates.firstDay("2027"));
        assertEquals(LocalDate.of(2027, 12, 31), PartialDates.lastDay("2027"));
        assertEquals(LocalDate.of(2028, 2, 29), PartialDates.lastDay("2028-02"));
        assertEquals(LocalDate.of(2027, 3, 14), PartialDates.lastDay("2027-03-14"));
    }

    @Test
    void aYearOnlyPaperOverlapsAProjectThatStartsMidYear() {
        LocalDate start = LocalDate.of(2026, 8, 15);
        LocalDate end = LocalDate.of(2029, 8, 14);

        assertTrue(PartialDates.overlaps("2026", start, end));
        assertTrue(PartialDates.overlaps("2026-08", start, end));
        assertFalse(PartialDates.overlaps("2026-07", start, end));
        assertFalse(PartialDates.overlaps("2026-08-14", start, end));
        assertTrue(PartialDates.overlaps("2029-08-14", start, end));
        assertFalse(PartialDates.overlaps("2030", start, end));
    }
}
