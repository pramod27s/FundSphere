package org.pramod.corebackend.dto.award;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.pramod.corebackend.enums.AwardStatus;
import org.pramod.corebackend.enums.BudgetHead;
import org.pramod.corebackend.enums.ComplianceEventOrigin;
import org.pramod.corebackend.enums.ComplianceEventStatus;
import org.pramod.corebackend.enums.ComplianceEventType;
import org.pramod.corebackend.enums.ReportingProfile;
import org.pramod.corebackend.enums.SubmissionPortal;
import org.pramod.corebackend.enums.UnspentPolicy;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** One of the user's grants with its budget heads (standard head order) and reporting deadlines (date order). */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AwardResponse {
    private Long id;
    private Long applicationId;
    private String projectTitle;
    private String agency;
    private String scheme;
    private String sanctionNo;
    private LocalDate sanctionDate;
    private LocalDate startDate;
    private LocalDate endDate;
    private Long totalSanctioned;
    /** Sum of the budget heads; can differ from totalSanctioned, which the form points out. */
    private long allocatedTotal;
    private SubmissionPortal submissionPortal;
    /** The portal's own link, or the pasted one for OTHER; null if none. */
    private String portalUrl;
    private UnspentPolicy unspentPolicy;
    private ReportingProfile reportingProfile;
    private AwardStatus status;
    /** The project's objectives in order, for progress reports (4.4); empty until the PI adds them. */
    private List<String> objectives;
    private List<BudgetLineResponse> budgetLines;
    private List<EventResponse> events;
    /** The earliest pending deadline (overdue ones included), for the My grants list; null if none. */
    private EventResponse nextEvent;
    private int overdueCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public record BudgetLineResponse(Long id, BudgetHead head, long allocated) {
    }

    public record EventResponse(Long id, ComplianceEventType type, String title, LocalDate periodStart,
                                LocalDate periodEnd, LocalDate dueDate, boolean dueDateEdited,
                                ComplianceEventStatus status, LocalDate submittedOn, ComplianceEventOrigin origin,
                                String basis) {
    }
}
