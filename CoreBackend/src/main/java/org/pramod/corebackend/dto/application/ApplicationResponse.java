package org.pramod.corebackend.dto.application;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.pramod.corebackend.enums.ApplicationStatus;
import org.pramod.corebackend.service.ReadinessCalculator;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * An application with its readiness. The list endpoint leaves items and
 * statusHistory null; the detail endpoints fill them.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ApplicationResponse {
    private Long id;
    private Long grantId;
    private String title;
    private String agency;
    private String callUrl;
    private LocalDate deadline;
    private ApplicationStatus status;
    private LocalDateTime statusChangedAt;
    private String notes;
    private String guidelinesSource;
    private List<String> checklistWarnings;
    private LocalDateTime checklistGeneratedAt;
    /** Set once the guidelines have been read; the Proposal tab needs it to check drafts. */
    private Long guidelineExtractionId;
    private ReadinessCalculator.Readiness readiness;
    private int itemCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<ChecklistItemResponse> items;
    private List<StatusChangeResponse> statusHistory;

    public record StatusChangeResponse(ApplicationStatus fromStatus, ApplicationStatus toStatus, LocalDateTime changedAt) {
    }
}
