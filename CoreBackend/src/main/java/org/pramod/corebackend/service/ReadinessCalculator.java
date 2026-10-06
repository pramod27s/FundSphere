/**
 * Readiness of an application: mandatory items done ÷ mandatory items.
 * Items marked Not applicable leave both counts. The percentage is rounded
 * down so it only reads 100% when every mandatory item is really done.
 */
package org.pramod.corebackend.service;

import org.pramod.corebackend.entity.ChecklistItem;
import org.pramod.corebackend.enums.ChecklistItemStatus;

import java.time.LocalDate;
import java.util.Collection;

public final class ReadinessCalculator {

    /**
     * @param percent null when there are no mandatory items yet
     * @param overdue items still to do whose due date has passed
     */
    public record Readiness(int mandatoryTotal, int mandatoryDone, Integer percent, int overdue) {
    }

    private ReadinessCalculator() {
    }

    public static Readiness compute(Collection<ChecklistItem> items, LocalDate today) {
        int total = 0;
        int done = 0;
        int overdue = 0;
        for (ChecklistItem item : items) {
            ChecklistItemStatus status = item.getStatus();
            if (status == ChecklistItemStatus.NA) {
                continue;
            }
            if (item.isMandatory()) {
                total++;
                if (status == ChecklistItemStatus.DONE) {
                    done++;
                }
            }
            if (status == ChecklistItemStatus.TODO && item.getDueDate() != null && item.getDueDate().isBefore(today)) {
                overdue++;
            }
        }
        Integer percent = total == 0 ? null : (done * 100) / total;
        return new Readiness(total, done, percent, overdue);
    }
}
