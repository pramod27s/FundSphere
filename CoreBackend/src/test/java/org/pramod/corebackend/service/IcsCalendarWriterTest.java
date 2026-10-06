package org.pramod.corebackend.service;

import org.junit.jupiter.api.Test;
import org.pramod.corebackend.entity.Application;
import org.pramod.corebackend.entity.ChecklistItem;
import org.pramod.corebackend.enums.ChecklistItemStatus;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class IcsCalendarWriterTest {

    private static final Instant NOW = Instant.parse("2026-10-05T10:15:30Z");

    private static Application application(LocalDate deadline) {
        return Application.builder()
                .id(42L)
                .title("ANRF Core Research Grant, 2026; Engineering Sciences")
                .agency("ANRF")
                .callUrl("https://anrfonline.in/ANRF/HomePage")
                .deadline(deadline)
                .build();
    }

    private static ChecklistItem item(long id, String text, LocalDate due, ChecklistItemStatus status) {
        return ChecklistItem.builder().id(id).text(text).dueDate(due).status(status)
                .mandatory(true).ownerName("Ravi (JRF)").build();
    }

    @Test
    void writesDeadlineAndOpenItemsAsAllDayEvents() {
        String ics = IcsCalendarWriter.write(application(LocalDate.of(2026, 11, 15)), List.of(
                item(1, "HoI endorsement (Annexure-II)", LocalDate.of(2026, 11, 8), ChecklistItemStatus.TODO),
                item(2, "PI biodata", LocalDate.of(2026, 11, 12), ChecklistItemStatus.DONE),
                item(3, "Not needed", LocalDate.of(2026, 11, 12), ChecklistItemStatus.NA),
                item(4, "No date yet", null, ChecklistItemStatus.TODO)
        ), NOW);

        assertTrue(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
        assertTrue(ics.endsWith("END:VCALENDAR\r\n"));
        assertEquals(2, count(ics, "BEGIN:VEVENT"), "deadline + the one open dated item");

        assertTrue(ics.contains("UID:application-42-deadline@fundsphere\r\n"));
        assertTrue(ics.contains("DTSTART;VALUE=DATE:20261115\r\nDTEND;VALUE=DATE:20261116\r\n"));
        assertTrue(ics.contains("UID:checklist-item-1@fundsphere\r\n"));
        assertTrue(ics.contains("DTSTART;VALUE=DATE:20261108\r\n"));
        assertTrue(ics.contains("DTSTAMP:20261005T101530Z\r\n"));
        assertFalse(ics.contains("checklist-item-2@"));
        assertFalse(ics.contains("checklist-item-3@"));
        assertFalse(ics.contains("checklist-item-4@"));
    }

    @Test
    void escapesCommasSemicolonsAndNewlines() {
        String ics = unfold(IcsCalendarWriter.write(application(LocalDate.of(2026, 11, 15)), List.of(), NOW));
        assertTrue(ics.contains("SUMMARY:Deadline: ANRF Core Research Grant\\, 2026\\; Engineering Sciences\r\n"), ics);
        assertTrue(ics.contains("Submission deadline (ANRF).\\nCall: https://anrfonline.in/ANRF/HomePage"), ics);
        assertEquals("a\\\\b\\;c\\,d\\ne", IcsCalendarWriter.escape("a\\b;c,d\ne"));
    }

    @Test
    void noDeadlineMeansNoDeadlineEvent() {
        String ics = IcsCalendarWriter.write(application(null), List.of(
                item(7, "Hard copy to reach DST", LocalDate.of(2026, 11, 20), ChecklistItemStatus.TODO)), NOW);
        assertEquals(1, count(ics, "BEGIN:VEVENT"));
        assertFalse(ics.contains("deadline@fundsphere"));
    }

    @Test
    void foldsLongLinesAt75OctetsWithoutSplittingCharacters() {
        String longText = "Endorsement from the Head of Institution — प्रमाणपत्र — ".repeat(6);
        String ics = IcsCalendarWriter.write(application(null), List.of(
                item(9, longText, LocalDate.of(2026, 11, 8), ChecklistItemStatus.TODO)), NOW);

        for (String line : ics.split("\r\n")) {
            assertTrue(line.getBytes(StandardCharsets.UTF_8).length <= 75, "line too long: " + line);
        }
        assertTrue(unfold(ics).contains(IcsCalendarWriter.escape(longText.strip())));
    }

    private static String unfold(String ics) {
        return ics.replace("\r\n ", "");
    }

    private static int count(String haystack, String needle) {
        return haystack.split(java.util.regex.Pattern.quote(needle), -1).length - 1;
    }
}
