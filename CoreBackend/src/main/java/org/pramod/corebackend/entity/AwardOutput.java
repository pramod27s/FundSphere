/**
 * One thing a grant produced (4.4): a paper, a student trained, equipment
 * bought, a patent, a milestone reached. Progress-report drafts are written
 * only from these entries, and every factual sentence cites the ones it uses.
 */
package org.pramod.corebackend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.pramod.corebackend.enums.AwardOutputSource;
import org.pramod.corebackend.enums.AwardOutputType;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "award_outputs",
        indexes = @Index(name = "idx_award_outputs_award", columnList = "award_id")
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AwardOutput {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "award_id", nullable = false)
    private Award award;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AwardOutputType type;

    /** The paper's title, the student's name, the equipment item, the milestone. */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String title;

    /** The journal for a paper, the role and status for a student ("JRF, joined Sep 2026"), anything else worth reporting. */
    @Column(columnDefinition = "TEXT")
    private String details;

    /**
     * "2027", "2027-03" or "2027-03-14" (see PartialDates). ORCID often has
     * only the year, and a report must not state a day the record doesn't have.
     */
    @Column(name = "output_date", length = 10)
    private String outputDate;

    /** Whole rupees, e.g. what an equipment item cost. */
    private Long amount;

    /** The DOI of a paper, the application number of a patent. */
    @Column(columnDefinition = "TEXT")
    private String reference;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private AwardOutputSource source;

    /** The ORCID put-code of an imported work, so importing again doesn't add it twice. */
    @Column(name = "external_id", length = 40)
    private String externalId;

    @Column(name = "created_at", updatable = false, nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

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
