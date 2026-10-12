/**
 * A progress-report draft (4.4), written from the grant's recorded entries
 * by the ai-service and edited by the PI. Every sentence carries the entries
 * it cites and the result of the unsupported-claim check, so the PI can see
 * which lines still need fixing before export.
 */
package org.pramod.corebackend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.pramod.corebackend.enums.ReportKind;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "generated_drafts",
        indexes = @Index(name = "idx_generated_drafts_award", columnList = "award_id")
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GeneratedDraft {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "award_id", nullable = false)
    private Award award;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ReportKind kind;

    /** e.g. "Annual progress report, year 1", the deadline's own name when drafted from one. */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String title;

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    @Column(name = "period_end", nullable = false)
    private LocalDate periodEnd;

    /**
     * The deadline it was drafted for, if any. Not a foreign key: deadlines
     * are worked out again when the grant's dates change.
     */
    @Column(name = "event_id")
    private Long eventId;

    /** The outputs the PI chose to include, as comma-separated ids; they're re-read for every check. */
    @Column(name = "output_ids", columnDefinition = "TEXT")
    private String outputIds;

    /** What the PI asked the report to say (delays, changes to the plan); the only source for Deviations. */
    @Column(columnDefinition = "TEXT")
    private String notes;

    /** The draft as JSON: title, sections, sentences with sources and check results, entry labels, warnings. */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    /** The model that wrote the narrative; empty when nothing was recorded and only code wrote the draft. */
    @Column(length = 100)
    private String model;

    @Column(name = "unsupported_count", nullable = false)
    private int unsupportedCount;

    @Column(name = "placeholder_count", nullable = false)
    private int placeholderCount;

    @Column(name = "confirmed_count", nullable = false)
    private int confirmedCount;

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
