package org.pramod.corebackend.dto.award;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.pramod.corebackend.enums.AwardStatus;
import org.pramod.corebackend.enums.BudgetHead;
import org.pramod.corebackend.enums.ReportingProfile;
import org.pramod.corebackend.enums.SubmissionPortal;
import org.pramod.corebackend.enums.UnspentPolicy;

import java.time.LocalDate;
import java.util.List;

/**
 * Body of POST /api/awards and PUT /api/awards/{id}: the whole "Add my
 * grant" form. On PUT every field is replaced, so the form sends them all;
 * applicationId is only read on POST. Amounts are whole rupees, and a head
 * left out (or at 0) has no allocation.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class AwardRequest {
    private Long applicationId;
    private String projectTitle;
    private String agency;
    private String scheme;
    private String sanctionNo;
    private LocalDate sanctionDate;
    private LocalDate startDate;
    private LocalDate endDate;
    private Long totalSanctioned;
    private SubmissionPortal submissionPortal;
    private String portalUrl;
    private UnspentPolicy unspentPolicy;
    /** Whose reporting rules the deadlines follow; null means OTHER (general defaults). */
    private ReportingProfile reportingProfile;
    /** Null keeps the current status (new grants start ACTIVE). */
    private AwardStatus status;
    private List<BudgetLineRequest> budgetLines;

    public record BudgetLineRequest(BudgetHead head, Long allocated) {
    }
}
