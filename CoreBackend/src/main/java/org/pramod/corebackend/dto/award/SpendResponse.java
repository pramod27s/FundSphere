package org.pramod.corebackend.dto.award;

import org.pramod.corebackend.enums.BudgetHead;
import org.pramod.corebackend.service.SpendCheck;

import java.time.LocalDate;
import java.util.List;

/**
 * One financial year of a grant's spend check (4.3). yearStart and yearEnd are
 * the year cut to the project's dates; current is true when today falls in it.
 * asOf is the statement date, null when no spending is recorded for the year.
 * Amounts are whole rupees.
 */
public record SpendResponse(int fyStartYear, String label, LocalDate yearStart, LocalDate yearEnd,
                            boolean endsWithProject, boolean current, int yearGonePercent, LocalDate asOf,
                            List<Head> heads, long totalBudget, Long totalSpent, List<Warning> warnings,
                            List<YearOption> years, int equipmentAlertPercent, int equipmentAlertMonth) {

    /** estimated: the budget is FundSphere's estimate, not a figure the PI entered. */
    public record Head(BudgetHead head, long allocated, long budget, boolean estimated, Long spent,
                       Integer usedPercent) {
    }

    /** notice: asks for data (stale, estimated, nothing recorded) rather than warning about money. */
    public record Warning(SpendCheck.Kind kind, BudgetHead head, String message, boolean notice) {
    }

    public record YearOption(int fyStartYear, String label) {
    }
}
