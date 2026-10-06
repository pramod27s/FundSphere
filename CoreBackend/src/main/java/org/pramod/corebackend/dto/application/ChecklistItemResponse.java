package org.pramod.corebackend.dto.application;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.pramod.corebackend.enums.ChecklistCategory;
import org.pramod.corebackend.enums.ChecklistItemOrigin;
import org.pramod.corebackend.enums.ChecklistItemStatus;

import java.time.LocalDate;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChecklistItemResponse {
    private Long id;
    private ChecklistCategory category;
    private String text;
    private boolean mandatory;
    private boolean signOff;
    private String sourceQuote;
    private Integer sourcePage;
    private Boolean sourceVerified;
    private String ownerName;
    private LocalDate dueDate;
    /** Days before the deadline; null when the due date is fixed. */
    private Integer dueOffsetDays;
    private ChecklistItemStatus status;
    private ChecklistItemOrigin origin;
}
