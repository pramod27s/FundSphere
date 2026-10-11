package org.pramod.corebackend.dto.award;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.pramod.corebackend.enums.ComplianceEventStatus;

import java.time.LocalDate;

/**
 * Body of POST /api/awards/{id}/events (title and dueDate required) and
 * PATCH /api/awards/{id}/events/{eventId} (every field optional; null means
 * unchanged). Marking SUBMITTED without submittedOn records today.
 * resetDueDate puts a deadline the PI moved back on the rules' date.
 * The title can only be changed on deadlines the PI added.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ComplianceEventRequest {
    private String title;
    private LocalDate dueDate;
    private Boolean resetDueDate;
    private ComplianceEventStatus status;
    private LocalDate submittedOn;
}
