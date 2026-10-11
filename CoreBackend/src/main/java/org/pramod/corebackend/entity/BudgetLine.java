/**
 * The amount a grant allocates to one budget head over the whole project,
 * as in the sanction order (e.g. Equipment: 12,00,000). One line per head.
 */
package org.pramod.corebackend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.pramod.corebackend.enums.BudgetHead;

@Entity
@Table(
        name = "budget_lines",
        indexes = @Index(name = "idx_budget_lines_award", columnList = "award_id")
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BudgetLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "award_id", nullable = false)
    private Award award;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private BudgetHead head;

    /** Whole rupees, always above zero (heads with nothing allocated aren't stored). */
    @Column(nullable = false)
    private Long allocated;
}
