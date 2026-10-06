package org.pramod.corebackend.dto.application;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.pramod.corebackend.enums.ApplicationStatus;

import java.time.LocalDate;

/**
 * PATCH body for /api/applications/{id}. Every field is optional; null
 * means "leave unchanged". Text fields are cleared with "" (title can't be
 * cleared). The deadline is cleared with clearDeadline = true, because a
 * null date already means "unchanged".
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ApplicationUpdateRequest {
    private String title;
    private String agency;
    private String callUrl;
    private LocalDate deadline;
    private Boolean clearDeadline;
    private String notes;
    private ApplicationStatus status;
}
