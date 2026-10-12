/**
 * The spend check (4.3) for one financial year of a grant: each head's
 * % used against the % of the year gone, and the warnings the plan asks
 * for. A light check, not accounting: now and then the PI copies the
 * year-to-date totals per head from the institute's statement.
 *
 * Plain rules with no I/O, so every boundary is tested (SpendCheckTest):
 *   - years run April to March, cut to the project's dates. A project that
 *     ends mid-year has a short last year, whose warnings point at the
 *     project end, when unspent money is refunded;
 *   - in the last three months of the year (January to March for a full
 *     year), a head whose % used trails the % of the year gone by 15
 *     points or more is warned about, worded from the grant's year-end
 *     setting. There's no such warning when unspent money carries forward;
 *   - Equipment is warned about earlier (default: under 25% used by
 *     October), because most research equipment costs more than ₹2 lakh,
 *     the limit for buying without quotations, so it needs quotations, a
 *     purchase committee or a tender. In a year the project joins midway,
 *     the warning waits until three months after the project starts;
 *   - a head that has spent more than its budget is flagged at any time.
 * A head's budget for the year is what the PI entered, or else an
 * estimate: for Equipment, whatever of its allocation is still unspent
 * (it's usually bought early); for every other head, its share of the
 * allocation by the project's days in that year.
 */
package org.pramod.corebackend.service;

import org.pramod.corebackend.enums.BudgetHead;
import org.pramod.corebackend.enums.UnspentPolicy;

import java.time.LocalDate;
import java.time.Month;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

public final class SpendCheck {

    public static final int DEFAULT_EQUIPMENT_PERCENT = 25;
    public static final int DEFAULT_EQUIPMENT_MONTH = 10;
    /** A head is slow when its % used trails the % of the year gone by at least this many points. */
    static final int SLOW_GAP_POINTS = 15;
    static final int YEAR_END_WINDOW_MONTHS = 3;
    static final int STALE_AFTER_DAYS = 60;
    /** In a year the project joins midway, the Equipment warning waits until it has run this long. */
    static final int EQUIPMENT_GRACE_MONTHS = 3;
    /** "No spending recorded yet" waits until this much of the year has gone. */
    static final int NO_SPENDING_AFTER_PERCENT = 25;
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);
    private static final long ESTIMATE_ROUNDING = 1_000;
    private static final long LAKH = 100_000;
    private static final long CRORE = 10_000_000;

    private SpendCheck() {
    }

    /** One financial year of a project, cut to the project's dates. */
    public record Year(int startYear, LocalDate start, LocalDate end, boolean endsWithProject) {

        /** "FY 2026-27". */
        public String label() {
            return "FY " + ComplianceRules.financialYear(startYear);
        }

        long days() {
            return ChronoUnit.DAYS.between(start, end) + 1;
        }

        boolean contains(LocalDate date) {
            return !date.isBefore(start) && !date.isAfter(end);
        }

        /** How much of the year has gone by the end of the given day, 0 to 100. */
        double gone(LocalDate date) {
            if (date.isBefore(start)) {
                return 0;
            }
            if (!date.isBefore(end)) {
                return 100;
            }
            return (ChronoUnit.DAYS.between(start, date) + 1) * 100.0 / days();
        }
    }

    /** The grant's side of the check. allocations are whole-project amounts per head. */
    public record Grant(LocalDate start, LocalDate end, UnspentPolicy policy, Map<BudgetHead, Long> allocations,
                        int equipmentPercent, int equipmentMonth) {
    }

    /** What the PI entered for one head in the year; null budget means "use the estimate", null spent "not entered". */
    public record Entry(Long budget, Long spent) {
    }

    /** The year's entries, the statement date, and the Equipment spending of earlier years (for its estimate). */
    public record Spending(Map<BudgetHead, Entry> entries, LocalDate asOf, long equipmentSpentBefore) {
    }

    public enum Kind {
        OVERSPENT, YEAR_END, EQUIPMENT,
        /** The kinds below are notices: they ask for data rather than warn about money. */
        STALE, ESTIMATED, NO_SPENDING;

        public boolean isNotice() {
            return this == STALE || this == ESTIMATED || this == NO_SPENDING;
        }
    }

    public record Warning(Kind kind, BudgetHead head, String message) {
    }

    /** spent and usedPercent are null when nothing is entered; usedPercent also when the budget is 0. */
    public record HeadRow(BudgetHead head, long allocated, long budget, boolean estimated, Long spent,
                          Integer usedPercent) {
    }

    public record Result(Year year, int yearGonePercent, LocalDate asOf, List<HeadRow> heads, List<Warning> warnings) {
    }

    // ------------------------------------------------------------------
    // Years
    // ------------------------------------------------------------------

    /** The April-to-March years the project runs in, the first and last cut to its dates. */
    public static List<Year> years(LocalDate projectStart, LocalDate projectEnd) {
        List<Year> years = new ArrayList<>();
        int first = fyStartYear(projectStart);
        for (int y = first; y <= fyStartYear(projectEnd); y++) {
            LocalDate fyStart = LocalDate.of(y, Month.APRIL, 1);
            LocalDate fyEnd = LocalDate.of(y + 1, Month.MARCH, 31);
            boolean cutAtEnd = projectEnd.isBefore(fyEnd);
            years.add(new Year(y, projectStart.isAfter(fyStart) ? projectStart : fyStart,
                    cutAtEnd ? projectEnd : fyEnd, cutAtEnd));
        }
        return years;
    }

    /** The year today falls in; before the project, its first year; after it, its last. */
    public static Year yearFor(LocalDate today, List<Year> years) {
        for (Year year : years) {
            if (year.contains(today)) {
                return year;
            }
        }
        return today.isBefore(years.get(0).start()) ? years.get(0) : years.get(years.size() - 1);
    }

    static int fyStartYear(LocalDate date) {
        return date.getMonthValue() >= Month.APRIL.getValue() ? date.getYear() : date.getYear() - 1;
    }

    // ------------------------------------------------------------------
    // Estimates
    // ------------------------------------------------------------------

    /**
     * A head's budget for the year when the PI hasn't entered one (see the class
     * comment). A share by days is rounded to the nearest ₹1,000: it's a guide,
     * and "₹59,945" would look more exact than it is.
     */
    static long estimate(BudgetHead head, long allocated, Year year, LocalDate projectStart, LocalDate projectEnd,
                         long equipmentSpentBefore) {
        if (head == BudgetHead.EQUIPMENT) {
            return Math.max(0, allocated - equipmentSpentBefore);
        }
        long projectDays = ChronoUnit.DAYS.between(projectStart, projectEnd) + 1;
        return Math.round(allocated * (double) year.days() / projectDays / ESTIMATE_ROUNDING) * ESTIMATE_ROUNDING;
    }

    // ------------------------------------------------------------------
    // The check
    // ------------------------------------------------------------------

    public static Result check(Grant grant, Year year, Spending spending, LocalDate today) {
        Map<BudgetHead, Entry> entries = spending.entries() == null ? Map.of() : spending.entries();
        Set<BudgetHead> heads = new TreeSet<>();
        grant.allocations().forEach((head, amount) -> {
            if (amount != null && amount > 0) {
                heads.add(head);
            }
        });
        entries.forEach((head, entry) -> {
            if (entry.spent() != null || entry.budget() != null) {
                heads.add(head);
            }
        });

        boolean anySpent = entries.values().stream().anyMatch(e -> e.spent() != null);
        LocalDate asOf = anySpent ? spending.asOf() : null;
        boolean current = year.contains(today);
        List<HeadRow> rows = new ArrayList<>();
        List<Warning> overspent = new ArrayList<>();
        Map<BudgetHead, Double> used = new EnumMap<>(BudgetHead.class);
        List<String> estimated = new ArrayList<>();

        for (BudgetHead head : heads) {
            Long allocation = grant.allocations().get(head);
            long allocated = allocation == null ? 0 : allocation;
            Entry entry = entries.get(head);
            boolean isEstimate = entry == null || entry.budget() == null;
            long budget = isEstimate
                    ? estimate(head, allocated, year, grant.start(), grant.end(), spending.equipmentSpentBefore())
                    : entry.budget();
            if (isEstimate && allocated > 0) {
                estimated.add(label(head));
            }
            Long spent = entry == null ? null : entry.spent();
            Integer usedPercent = null;
            if (spent != null && budget > 0) {
                double exact = spent * 100.0 / budget;
                used.put(head, exact);
                usedPercent = (int) Math.floor(exact);
            }
            rows.add(new HeadRow(head, allocated, budget, isEstimate, spent, usedPercent));

            if (spent != null && spent > budget) {
                overspent.add(new Warning(Kind.OVERSPENT, head, overspentMessage(head, budget, spent, isEstimate, year)));
            }
        }

        List<Warning> warnings = new ArrayList<>(overspent);
        if (current && asOf != null) {
            warnings.addAll(yearEnd(grant, year, used, asOf, today));
            boolean equipmentAtYearEnd = warnings.stream()
                    .anyMatch(w -> w.kind() == Kind.YEAR_END && w.head() == BudgetHead.EQUIPMENT);
            if (!equipmentAtYearEnd) {
                Warning equipment = equipment(grant, year, used.get(BudgetHead.EQUIPMENT), asOf, today);
                if (equipment != null) {
                    warnings.add(equipment);
                }
            }
        }
        if (current) {
            if (!anySpent && year.gone(today) >= NO_SPENDING_AFTER_PERCENT) {
                warnings.add(new Warning(Kind.NO_SPENDING, null, "No spending recorded for " + year.label()
                        + " yet. Copy the totals per head from your institute's statement to check them."));
            }
            if (asOf != null && ChronoUnit.DAYS.between(asOf, today) > STALE_AFTER_DAYS) {
                warnings.add(new Warning(Kind.STALE, null, "Spending was last updated on " + DAY.format(asOf)
                        + ". Update it from your latest statement before relying on these figures."));
            }
        }
        if (!estimated.isEmpty()) {
            warnings.add(new Warning(Kind.ESTIMATED, null, "The " + join(estimated) + " "
                    + (estimated.size() == 1 ? "budget is an estimate" : "budgets are estimates")
                    + " from the project's allocation. Enter this year's figures from your sanction order or release letter."));
        }
        return new Result(year, (int) Math.floor(year.gone(today)), asOf, rows, warnings);
    }

    /** Heads that are slow, in the last three months of the year. */
    private static List<Warning> yearEnd(Grant grant, Year year, Map<BudgetHead, Double> used, LocalDate asOf,
                                         LocalDate today) {
        LocalDate windowStart = year.end().minusMonths(YEAR_END_WINDOW_MONTHS).plusDays(1);
        String consequence = year.endsWithProject() ? "Unspent money is refunded at the end of the project."
                : switch (grant.policy() == null ? UnspentPolicy.UNKNOWN : grant.policy()) {
                    case LAPSES -> "Unspent money lapses on 31 March.";
                    case DEDUCTED_NEXT_RELEASE -> "Unspent money may be deducted from your next release.";
                    case UNKNOWN -> "Check your sanction order for what happens to unspent money.";
                    case CARRY_FORWARD -> null;
                };
        List<Warning> warnings = new ArrayList<>();
        if (today.isBefore(windowStart) || consequence == null) {
            return warnings;
        }
        double gone = year.gone(asOf);
        used.forEach((head, percent) -> {
            if (percent < gone - SLOW_GAP_POINTS) {
                warnings.add(new Warning(Kind.YEAR_END, head, label(head) + ": " + (int) Math.floor(percent) + "% used"
                        + by(asOf, today) + ", " + timeLeft(year, today) + ". " + consequence));
            }
        });
        return warnings;
    }

    private static Warning equipment(Grant grant, Year year, Double used, LocalDate asOf, LocalDate today) {
        if (used == null) {
            return null;
        }
        int month = grant.equipmentMonth();
        LocalDate alertDate = LocalDate.of(month >= Month.APRIL.getValue() ? year.startYear() : year.startYear() + 1, month, 1);
        boolean joinedMidway = !year.start().equals(LocalDate.of(year.startYear(), Month.APRIL, 1));
        LocalDate earliest = year.start().plusMonths(EQUIPMENT_GRACE_MONTHS);
        if (joinedMidway && alertDate.isBefore(earliest)) {
            alertDate = earliest;
        }
        boolean applies = year.contains(alertDate) && !today.isBefore(alertDate);
        if (!applies || used >= grant.equipmentPercent()) {
            return null;
        }
        return new Warning(Kind.EQUIPMENT, BudgetHead.EQUIPMENT, "Equipment: " + (int) Math.floor(used) + "% used"
                + by(asOf, today) + ". Most research equipment costs more than ₹2 lakh, so buying it takes quotations, "
                + "a purchase committee or a tender. Start now to finish within " + year.label() + ".");
    }

    private static String overspentMessage(BudgetHead head, long budget, long spent, boolean estimated, Year year) {
        if (budget == 0) {
            return label(head) + ": " + inr(spent) + " spent, but it has no budget in " + year.label() + ".";
        }
        return label(head) + ": overspent by " + inr(spent - budget) + " (" + inr(spent) + " spent of a " + inr(budget)
                + " budget for " + year.label() + "). Moving money between heads needs the agency's approval."
                + (estimated ? " The budget is an estimate: enter this year's figure if it's different." : "");
    }

    /** " by 10 Jan 2027" when the figures are older than today. */
    private static String by(LocalDate asOf, LocalDate today) {
        return asOf.equals(today) ? "" : " by " + DAY.format(asOf);
    }

    /** "2 months left in FY 2026-27", "9 days left before the project ends on 14 Aug 2029". */
    static String timeLeft(Year year, LocalDate today) {
        String where = year.endsWithProject() ? "before the project ends on " + DAY.format(year.end()) : "in " + year.label();
        long days = ChronoUnit.DAYS.between(today, year.end());
        if (days <= 0) {
            return "and today is the last day " + (year.endsWithProject() ? "of the project" : "of " + year.label());
        }
        if (days < 31) {
            return days + (days == 1 ? " day" : " days") + " left " + where;
        }
        long months = Math.round(days / 30.44);
        return months + (months == 1 ? " month" : " months") + " left " + where;
    }

    /** The app's amount style: "₹50,000", "₹8.5 Lakh", "₹2.5 Cr" (formatInr in the frontend). */
    static String inr(long amount) {
        if (amount < LAKH) {
            return "₹" + indianGrouping(amount);
        }
        if (amount < CRORE) {
            return "₹" + oneDecimal(amount / (double) LAKH) + " Lakh";
        }
        return "₹" + oneDecimal(amount / (double) CRORE) + " Cr";
    }

    private static String oneDecimal(double value) {
        double rounded = Math.round(value * 10) / 10.0;
        return rounded == Math.rint(rounded) ? String.valueOf((long) rounded) : String.valueOf(rounded);
    }

    private static String indianGrouping(long amount) {
        String digits = Long.toString(amount);
        if (digits.length() <= 3) {
            return digits;
        }
        StringBuilder head = new StringBuilder(digits.substring(0, digits.length() - 3));
        String tail = digits.substring(digits.length() - 3);
        for (int i = head.length() - 2; i > 0; i -= 2) {
            head.insert(i, ',');
        }
        return head + "," + tail;
    }

    /** "CONSUMABLES" -> "Consumables". */
    static String label(BudgetHead head) {
        String name = head.name().toLowerCase(Locale.ROOT);
        return Character.toUpperCase(name.charAt(0)) + name.substring(1);
    }

    private static String join(List<String> items) {
        if (items.size() == 1) {
            return items.get(0);
        }
        return String.join(", ", items.subList(0, items.size() - 1)) + " and " + items.get(items.size() - 1);
    }
}
