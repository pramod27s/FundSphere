package org.pramod.corebackend.service;

import org.junit.jupiter.api.Test;
import org.pramod.corebackend.entity.ChecklistItem;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ChecklistDueDatesTest {

    private static final LocalDate DEADLINE = LocalDate.of(2026, 11, 15);

    private static ChecklistItem item(boolean signOff) {
        return ChecklistItem.builder().text("x").signOff(signOff).build();
    }

    @Test
    void defaultIsThreeDaysBeforeAndSevenForSignOffs() {
        ChecklistItem cv = item(false);
        ChecklistItem endorsement = item(true);
        ChecklistDueDates.applyDefault(cv, DEADLINE);
        ChecklistDueDates.applyDefault(endorsement, DEADLINE);

        assertEquals(LocalDate.of(2026, 11, 12), cv.getDueDate());
        assertEquals(3, cv.getDueOffsetDays());
        assertEquals(LocalDate.of(2026, 11, 8), endorsement.getDueDate());
        assertEquals(7, endorsement.getDueOffsetDays());
    }

    @Test
    void withoutDeadlineTheOffsetWaitsForOne() {
        ChecklistItem cv = item(false);
        ChecklistDueDates.applyDefault(cv, null);
        assertNull(cv.getDueDate());
        assertEquals(3, cv.getDueOffsetDays());

        ChecklistDueDates.onDeadlineChanged(List.of(cv), DEADLINE);
        assertEquals(LocalDate.of(2026, 11, 12), cv.getDueDate());
    }

    @Test
    void movingTheDeadlineMovesRelativeItemsButNotFixedOnes() {
        ChecklistItem cv = item(false);
        ChecklistItem hardCopy = item(false);
        ChecklistDueDates.applyDefault(cv, DEADLINE);
        ChecklistDueDates.applyFixed(hardCopy, LocalDate.of(2026, 11, 20));

        ChecklistDueDates.onDeadlineChanged(List.of(cv, hardCopy), LocalDate.of(2026, 12, 1));

        assertEquals(LocalDate.of(2026, 11, 28), cv.getDueDate());
        assertEquals(LocalDate.of(2026, 11, 20), hardCopy.getDueDate());
    }

    @Test
    void userDateKeepsItsGapWhenTheDeadlineMoves() {
        ChecklistItem budget = item(false);
        ChecklistDueDates.applyUserDate(budget, LocalDate.of(2026, 11, 1), DEADLINE);
        assertEquals(14, budget.getDueOffsetDays());

        ChecklistDueDates.onDeadlineChanged(List.of(budget), LocalDate.of(2026, 11, 22));
        assertEquals(LocalDate.of(2026, 11, 8), budget.getDueDate());
    }

    @Test
    void userDateWithoutDeadlineIsFixed() {
        ChecklistItem budget = item(false);
        ChecklistDueDates.applyUserDate(budget, LocalDate.of(2026, 11, 1), null);
        assertNull(budget.getDueOffsetDays());

        ChecklistDueDates.onDeadlineChanged(List.of(budget), DEADLINE);
        assertEquals(LocalDate.of(2026, 11, 1), budget.getDueDate());
    }

    @Test
    void clearingTheDeadlineClearsRelativeDatesOnly() {
        ChecklistItem cv = item(false);
        ChecklistItem hardCopy = item(false);
        ChecklistDueDates.applyDefault(cv, DEADLINE);
        ChecklistDueDates.applyFixed(hardCopy, LocalDate.of(2026, 11, 20));

        ChecklistDueDates.onDeadlineChanged(List.of(cv, hardCopy), null);

        assertNull(cv.getDueDate());
        assertEquals(3, cv.getDueOffsetDays());
        assertEquals(LocalDate.of(2026, 11, 20), hardCopy.getDueDate());
    }

    @Test
    void offsetsCrossMonthAndLeapYearBoundaries() {
        ChecklistItem endorsement = item(true);
        ChecklistDueDates.applyDefault(endorsement, LocalDate.of(2028, 3, 3));
        assertEquals(LocalDate.of(2028, 2, 25), endorsement.getDueDate());

        ChecklistDueDates.onDeadlineChanged(List.of(endorsement), LocalDate.of(2027, 1, 4));
        assertEquals(LocalDate.of(2026, 12, 28), endorsement.getDueDate());
    }

    @Test
    void clearRemovesDateAndOffset() {
        ChecklistItem cv = item(false);
        ChecklistDueDates.applyDefault(cv, DEADLINE);
        ChecklistDueDates.clear(cv);
        ChecklistDueDates.onDeadlineChanged(List.of(cv), LocalDate.of(2026, 12, 1));
        assertNull(cv.getDueDate());
        assertNull(cv.getDueOffsetDays());
    }
}
