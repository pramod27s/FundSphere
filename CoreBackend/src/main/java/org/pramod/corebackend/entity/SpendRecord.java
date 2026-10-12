/**
 * What the PI copied from the institute's statement for one budget head in
 * one financial year (4.3 spend check): the head's budget for that year,
 * if they entered one, and the total spent so far that year. Totals only,
 * not accounting. Each update overwrites the year's figures and its date.
 */
package org.pramod.corebackend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.pramod.corebackend.enums.BudgetHead;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "spend_records",
        indexes = @Index(name = "idx_spend_records_award", columnList = "award_id"),
        uniqueConstraints = @UniqueConstraint(name = "uk_spend_records_award_year_head",
                columnNames = {"award_id", "fy_start_year", "head"})
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SpendRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "award_id", nullable = false)
    private Award award;

    /** The financial year by the year it starts in: 2026 is FY 2026-27. */
    @Column(name = "fy_start_year", nullable = false)
    private int fyStartYear;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BudgetHead head;

    /** Whole rupees available to the head this year; null means "use the estimate" (see SpendCheck). */
    private Long budget;

    /** Whole rupees spent this year so far; null when the PI entered only the budget. */
    private Long spent;

    /** The date of the statement the totals were copied from. */
    @Column(name = "as_of")
    private LocalDate asOf;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    protected void touch() {
        this.updatedAt = LocalDateTime.now();
    }
}
