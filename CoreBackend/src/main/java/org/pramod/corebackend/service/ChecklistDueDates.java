/**
 * Due-date rules for checklist items.
 *
 * An item's due date is normally "N days before the call deadline", stored
 * as dueOffsetDays so that moving the deadline moves every item with it.
 * Sign-off items (Head of Institution endorsement and the like) default to
 * 7 days before because signatures take time; everything else to 3 days.
 *
 * Two cases have a fixed date instead (dueOffsetDays = null):
 *  - the guidelines give the item its own date (e.g. "hard copy by 20 Nov");
 *  - the user picks a date while the application has no deadline.
 */
package org.pramod.corebackend.service;

import org.pramod.corebackend.entity.ChecklistItem;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Collection;

public final class ChecklistDueDates {

    public static final int SIGN_OFF_DAYS_BEFORE = 7;
    public static final int DEFAULT_DAYS_BEFORE = 3;

    private ChecklistDueDates() {
    }

    public static int defaultOffset(boolean signOff) {
        return signOff ? SIGN_OFF_DAYS_BEFORE : DEFAULT_DAYS_BEFORE;
    }

    /** New item: the default number of days before the deadline. */
    public static void applyDefault(ChecklistItem item, LocalDate deadline) {
        int offset = defaultOffset(item.isSignOff());
        item.setDueOffsetDays(offset);
        item.setDueDate(deadline == null ? null : deadline.minusDays(offset));
    }

    /** The guidelines give this item its own date, which doesn't follow the deadline. */
    public static void applyFixed(ChecklistItem item, LocalDate date) {
        item.setDueOffsetDays(null);
        item.setDueDate(date);
    }

    /**
     * The user picked a date. With a deadline it's stored as an offset, so
     * later deadline changes keep the same gap; without one it's fixed.
     */
    public static void applyUserDate(ChecklistItem item, LocalDate date, LocalDate deadline) {
        if (deadline == null) {
            applyFixed(item, date);
            return;
        }
        item.setDueOffsetDays(Math.toIntExact(ChronoUnit.DAYS.between(date, deadline)));
        item.setDueDate(date);
    }

    public static void clear(ChecklistItem item) {
        item.setDueOffsetDays(null);
        item.setDueDate(null);
    }

    /** Re-dates every deadline-relative item after the deadline changes (or is cleared). */
    public static void onDeadlineChanged(Collection<ChecklistItem> items, LocalDate deadline) {
        for (ChecklistItem item : items) {
            Integer offset = item.getDueOffsetDays();
            if (offset != null) {
                item.setDueDate(deadline == null ? null : deadline.minusDays(offset));
            }
        }
    }
}
