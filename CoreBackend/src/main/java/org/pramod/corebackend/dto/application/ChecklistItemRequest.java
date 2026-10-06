package org.pramod.corebackend.dto.application;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.pramod.corebackend.enums.ChecklistCategory;
import org.pramod.corebackend.enums.ChecklistItemStatus;

import java.time.LocalDate;

/**
 * Body for adding (POST) or editing (PATCH) a checklist item.
 *
 * On POST, text is required and category defaults to DOCUMENTS. On PATCH,
 * null means "leave unchanged"; ownerName "" clears the owner, and
 * clearDueDate = true removes the due date.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ChecklistItemRequest {
    private ChecklistCategory category;
    private String text;
    private Boolean mandatory;
    private Boolean signOff;
    private String ownerName;
    private LocalDate dueDate;
    private Boolean clearDueDate;
    private ChecklistItemStatus status;
}
