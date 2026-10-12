/**
 * Dates of project outputs (4.4), which ORCID often records only to the year
 * or the month: "2027", "2027-03" or "2027-03-14". They are kept as written,
 * so a progress report never states a month or day the record doesn't have.
 */
package org.pramod.corebackend.service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class PartialDates {

    private static final Pattern FORMAT = Pattern.compile("^(\\d{4})(?:-(\\d{2})(?:-(\\d{2}))?)?$");
    private static final int MIN_YEAR = 1900;
    private static final int MAX_YEAR = 2100;

    private PartialDates() {
    }

    /**
     * Builds a date from separate parts, keeping as much as is valid:
     * ("2027", "3", null) → "2027-03"; ("2027", "02", "30") → "2027-02".
     * Null without a usable year.
     */
    public static String of(String year, String month, String day) {
        Integer y = number(year, 4);
        if (y == null || y < MIN_YEAR || y > MAX_YEAR) {
            return null;
        }
        Integer m = number(month, 2);
        if (m == null || m < 1 || m > 12) {
            return String.format("%04d", y);
        }
        Integer d = number(day, 2);
        if (d == null || d < 1 || d > YearMonth.of(y, m).lengthOfMonth()) {
            return String.format("%04d-%02d", y, m);
        }
        return String.format("%04d-%02d-%02d", y, m, d);
    }

    /** The value trimmed, or null when blank. Throws IllegalArgumentException unless it's a real date in one of the three forms. */
    public static String normalise(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.strip();
        Matcher matcher = FORMAT.matcher(trimmed);
        if (!matcher.matches() || !trimmed.equals(of(matcher.group(1), matcher.group(2), matcher.group(3)))) {
            throw new IllegalArgumentException("Not a date: " + value);
        }
        return trimmed;
    }

    /** "2027" → 1 Jan 2027, "2027-03" → 1 Mar 2027. */
    public static LocalDate firstDay(String value) {
        Matcher matcher = parse(value);
        int year = Integer.parseInt(matcher.group(1));
        int month = matcher.group(2) == null ? 1 : Integer.parseInt(matcher.group(2));
        int day = matcher.group(3) == null ? 1 : Integer.parseInt(matcher.group(3));
        return LocalDate.of(year, month, day);
    }

    /** "2027" → 31 Dec 2027, "2027-02" → 28 Feb 2027. */
    public static LocalDate lastDay(String value) {
        Matcher matcher = parse(value);
        int year = Integer.parseInt(matcher.group(1));
        if (matcher.group(2) == null) {
            return LocalDate.of(year, 12, 31);
        }
        YearMonth month = YearMonth.of(year, Integer.parseInt(matcher.group(2)));
        return matcher.group(3) == null ? month.atEndOfMonth() : month.atDay(Integer.parseInt(matcher.group(3)));
    }

    /** True when any day the value could mean falls within from..to (both included). */
    public static boolean overlaps(String value, LocalDate from, LocalDate to) {
        return !lastDay(value).isBefore(from) && !firstDay(value).isAfter(to);
    }

    private static Matcher parse(String value) {
        Matcher matcher = FORMAT.matcher(value == null ? "" : value);
        if (!matcher.matches()) {
            throw new IllegalArgumentException("Not a date: " + value);
        }
        return matcher;
    }

    private static Integer number(String text, int maxDigits) {
        if (text == null) {
            return null;
        }
        String trimmed = text.strip();
        if (trimmed.isEmpty() || trimmed.length() > maxDigits || !trimmed.chars().allMatch(Character::isDigit)) {
            return null;
        }
        return Integer.parseInt(trimmed);
    }
}
