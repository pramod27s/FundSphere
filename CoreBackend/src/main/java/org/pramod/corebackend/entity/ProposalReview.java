/**
 * One review of one proposal draft (Proposal Assistant).
 *
 * Reviews inside an application are numbered (versionNo) so the history shows
 * the score trend across drafts. Standalone reviews (the Proposal page, no
 * application) have application = null.
 *
 * The proposal PDF itself is not stored. The result JSON keeps the text the
 * review read, section by section, so a draft can be upgraded from an Instant
 * check to a Full review, and later drafts can reuse unchanged work.
 */
package org.pramod.corebackend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.pramod.corebackend.enums.ProposalReviewLevel;
import org.pramod.corebackend.enums.ProposalReviewStatus;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "proposal_reviews",
        indexes = {
                @Index(name = "idx_proposal_reviews_owner", columnList = "owner_id"),
                @Index(name = "idx_proposal_reviews_application", columnList = "application_id")
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProposalReview {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private AppUser owner;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "application_id")
    private Application application;

    /** Null only while a standalone review is still reading its guidelines. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "guideline_extraction_id")
    private GuidelineExtraction guidelineExtraction;

    @Column(name = "version_no", nullable = false)
    private int versionNo;

    @Column(name = "proposal_file_name", columnDefinition = "TEXT")
    private String proposalFileName;

    @Column(name = "guidelines_file_name", columnDefinition = "TEXT")
    private String guidelinesFileName;

    @Column(name = "grant_title", columnDefinition = "TEXT")
    private String grantTitle;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private ProposalReviewLevel level;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private ProposalReviewStatus status;

    /** What the background job is doing: READING_GUIDELINES or REVIEWING. Null when finished. */
    @Column(length = 30)
    private String stage;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "overall_score")
    private Integer overallScore;

    @Column(name = "quality_score")
    private Integer qualityScore;

    @Column(name = "rules_met")
    private Integer rulesMet;

    @Column(name = "rules_total")
    private Integer rulesTotal;

    @Column(name = "critical_failed")
    private Integer criticalFailed;

    @Column(name = "score_capped")
    private Boolean scoreCapped;

    @Column(name = "ai_calls")
    private Integer aiCalls;

    @Column(name = "tokens_in")
    private Integer tokensIn;

    @Column(name = "tokens_out")
    private Integer tokensOut;

    /** The ai-service ReviewResult as JSON. */
    @Column(name = "result_json", columnDefinition = "TEXT")
    private String resultJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = this.createdAt;
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
