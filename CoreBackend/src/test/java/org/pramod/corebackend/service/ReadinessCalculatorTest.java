package org.pramod.corebackend.service;

import org.junit.jupiter.api.Test;
import org.pramod.corebackend.entity.ChecklistItem;
import org.pramod.corebackend.enums.ChecklistItemStatus;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ReadinessCalculatorTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 10);

    private static ChecklistItem item(boolean mandatory, ChecklistItemStatus status, LocalDate due) {
        return ChecklistItem.builder().text("x").mandatory(mandatory).status(status).dueDate(due).build();
    }

    @Test
    void countsMandatoryDoneOverMandatory() {
        var readiness = ReadinessCalculator.compute(List.of(
                item(true, ChecklistItemStatus.DONE, null),
                item(true, ChecklistItemStatus.TODO, null),
                item(true, ChecklistItemStatus.TODO, null),
                item(false, ChecklistItemStatus.DONE, null)   // optional: ignored
        ), TODAY);

        assertEquals(3, readiness.mandatoryTotal());
        assertEquals(1, readiness.mandatoryDone());
        assertEquals(33, readiness.percent());
    }

    @Test
    void notApplicableItemsLeaveTheCount() {
        var readiness = ReadinessCalculator.compute(List.of(
                item(true, ChecklistItemStatus.DONE, null),
                item(true, ChecklistItemStatus.NA, null)
        ), TODAY);

        assertEquals(1, readiness.mandatoryTotal());
        assertEquals(100, readiness.percent());
    }

    @Test
    void roundsDownSoItIsOnlyHundredWhenEverythingIsDone() {
        List<ChecklistItem> items = new java.util.ArrayList<>();
        for (int i = 0; i < 199; i++) {
            items.add(item(true, ChecklistItemStatus.DONE, null));
        }
        items.add(item(true, ChecklistItemStatus.TODO, null));
        assertEquals(99, ReadinessCalculator.compute(items, TODAY).percent());
    }

    @Test
    void noMandatoryItemsMeansNoPercentage() {
        assertNull(ReadinessCalculator.compute(List.of(), TODAY).percent());
        assertNull(ReadinessCalculator.compute(List.of(item(false, ChecklistItemStatus.TODO, null)), TODAY).percent());
    }

    @Test
    void overdueCountsOnlyUnfinishedItemsPastTheirDate() {
        var readiness = ReadinessCalculator.compute(List.of(
                item(true, ChecklistItemStatus.TODO, TODAY.minusDays(1)),  // overdue
                item(false, ChecklistItemStatus.TODO, TODAY.minusDays(3)), // overdue, optional too
                item(true, ChecklistItemStatus.TODO, TODAY),               // due today: not yet
                item(true, ChecklistItemStatus.DONE, TODAY.minusDays(5)),
                item(true, ChecklistItemStatus.NA, TODAY.minusDays(5))
        ), TODAY);

        assertEquals(2, readiness.overdue());
    }
}
