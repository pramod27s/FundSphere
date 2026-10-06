/**
 * Writes an application's deadline and checklist due dates as an iCalendar
 * (.ics) file that Google Calendar, Outlook and Apple Calendar can import.
 *
 * All events are all-day. Each has a stable UID, so importing an updated
 * file changes the existing events instead of adding copies (in calendars
 * that honour UIDs). Items already done or marked not applicable are left
 * out. Follows RFC 5545: CRLF line endings, escaped text, lines folded at
 * 75 octets without splitting a UTF-8 character.
 */
package org.pramod.corebackend.service;

import org.pramod.corebackend.entity.Application;
import org.pramod.corebackend.entity.ChecklistItem;
import org.pramod.corebackend.enums.ChecklistItemStatus;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

public final class IcsCalendarWriter {

    private static final String CRLF = "\r\n";
    private static final int MAX_LINE_OCTETS = 75;
    private static final DateTimeFormatter DATE = DateTimeFormatter.BASIC_ISO_DATE;
    private static final DateTimeFormatter STAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);
    private static final DateTimeFormatter READABLE = DateTimeFormatter.ofPattern("d MMM yyyy");
    private static final int TITLE_PREFIX_CHARS = 40;

    private IcsCalendarWriter() {
    }

    public static String write(Application application, List<ChecklistItem> items, Instant now) {
        List<String> lines = new ArrayList<>();
        lines.add("BEGIN:VCALENDAR");
        lines.add("VERSION:2.0");
        lines.add("PRODID:-//FundSphere//Application Workspace//EN");
        lines.add("CALSCALE:GREGORIAN");
        lines.add("METHOD:PUBLISH");
        lines.add("X-WR-CALNAME:" + escape("FundSphere: " + application.getTitle()));

        String stamp = STAMP.format(now);
        String prefix = "[" + shorten(application.getTitle()) + "] ";

        if (application.getDeadline() != null) {
            addEvent(lines,
                    "application-" + application.getId() + "-deadline@fundsphere",
                    stamp,
                    application.getDeadline(),
                    "Deadline: " + application.getTitle(),
                    deadlineDescription(application));
        }

        for (ChecklistItem item : items) {
            if (item.getDueDate() == null || item.getStatus() != ChecklistItemStatus.TODO) {
                continue;
            }
            addEvent(lines,
                    "checklist-item-" + item.getId() + "@fundsphere",
                    stamp,
                    item.getDueDate(),
                    prefix + item.getText(),
                    itemDescription(application, item));
        }

        lines.add("END:VCALENDAR");

        StringBuilder out = new StringBuilder();
        for (String line : lines) {
            out.append(fold(line)).append(CRLF);
        }
        return out.toString();
    }

    private static void addEvent(List<String> lines, String uid, String stamp, LocalDate date,
                                 String summary, String description) {
        lines.add("BEGIN:VEVENT");
        lines.add("UID:" + uid);
        lines.add("DTSTAMP:" + stamp);
        lines.add("DTSTART;VALUE=DATE:" + DATE.format(date));
        lines.add("DTEND;VALUE=DATE:" + DATE.format(date.plusDays(1)));
        lines.add("SUMMARY:" + escape(summary));
        lines.add("DESCRIPTION:" + escape(description));
        lines.add("TRANSP:TRANSPARENT");
        // Reminder the day before (calendars that support alarms on import).
        lines.add("BEGIN:VALARM");
        lines.add("ACTION:DISPLAY");
        lines.add("DESCRIPTION:" + escape(summary));
        lines.add("TRIGGER:-P1D");
        lines.add("END:VALARM");
        lines.add("END:VEVENT");
    }

    private static String deadlineDescription(Application application) {
        StringBuilder text = new StringBuilder("Submission deadline");
        if (application.getAgency() != null && !application.getAgency().isBlank()) {
            text.append(" (").append(application.getAgency()).append(")");
        }
        text.append(".");
        if (application.getCallUrl() != null && !application.getCallUrl().isBlank()) {
            text.append("\nCall: ").append(application.getCallUrl());
        }
        return text.toString();
    }

    private static String itemDescription(Application application, ChecklistItem item) {
        StringBuilder text = new StringBuilder();
        if (item.getOwnerName() != null && !item.getOwnerName().isBlank()) {
            text.append("Owner: ").append(item.getOwnerName()).append("\n");
        }
        text.append(item.isMandatory() ? "Mandatory" : "Optional");
        if (item.isSignOff()) {
            text.append(", needs a sign-off");
        }
        text.append("\nApplication: ").append(application.getTitle());
        if (application.getDeadline() != null) {
            text.append("\nCall deadline: ").append(READABLE.format(application.getDeadline()));
        }
        return text.toString();
    }

    private static String shorten(String title) {
        String clean = title == null ? "" : title.strip();
        return clean.length() <= TITLE_PREFIX_CHARS ? clean : clean.substring(0, TITLE_PREFIX_CHARS - 1).strip() + "…";
    }

    /** RFC 5545 TEXT escaping. */
    static String escape(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("\\", "\\\\")
                .replace(";", "\\;")
                .replace(",", "\\,")
                .replace("\r\n", "\\n")
                .replace("\n", "\\n")
                .replace("\r", "\\n");
    }

    /** Splits a content line into 75-octet chunks; continuation lines start with a space. */
    static String fold(String line) {
        StringBuilder out = new StringBuilder();
        int lineOctets = 0;
        int limit = MAX_LINE_OCTETS;
        for (int i = 0; i < line.length(); ) {
            int codePoint = line.codePointAt(i);
            String ch = new String(Character.toChars(codePoint));
            int octets = ch.getBytes(StandardCharsets.UTF_8).length;
            if (lineOctets + octets > limit) {
                out.append(CRLF).append(' ');
                lineOctets = 0;
                limit = MAX_LINE_OCTETS - 1; // the leading space counts
            }
            out.append(ch);
            lineOctets += octets;
            i += Character.charCount(codePoint);
        }
        return out.toString();
    }
}
