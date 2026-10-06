package org.pramod.corebackend.dto.proposal;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.pramod.corebackend.enums.ProposalReviewLevel;
import org.pramod.corebackend.enums.ProposalReviewStatus;

import java.time.LocalDateTime;

/**
 * A proposal review. Lists carry the summary fields only; the detail endpoint
 * also fills `result` (the ai-service ReviewResult: rules, criteria, issues).
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProposalReviewResponse {
    private Long id;
    private Long applicationId;
    private int versionNo;
    private String proposalFileName;
    private String guidelinesFileName;
    private String grantTitle;
    private ProposalReviewLevel level;
    private ProposalReviewStatus status;
    private String stage;
    private String errorMessage;
    private Integer overallScore;
    private Integer qualityScore;
    private Integer rulesMet;
    private Integer rulesTotal;
    private Integer criticalFailed;
    private Boolean scoreCapped;
    private Integer aiCalls;
    private Integer tokensIn;
    private Integer tokensOut;
    private LocalDateTime createdAt;
    private LocalDateTime completedAt;
    private Object result;
}
