/**
 * One reporting deadline on a grant (4.2): a UC and SE, a progress report,
 * the extension-request date, a closing document, or a deadline the PI added.
 * RULE events are worked out by ComplianceRules and kept in step with the
 * grant's dates by ComplianceSchedule; the PI's own changes (status, a moved
 * due date) survive that.
 */
package org.pramod.corebackend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.pramod.corebackend.enums.ComplianceEventOrigin;
import org.pramod.corebackend.enums.ComplianceEventStatus;
import org.pramod.corebackend.enums.ComplianceEventType;

import java.time.LocalDate;

@Entity
@Table(
        name = "compliance_events",
        indexes = @Index(name = "idx_compliance_events_award", columnList = "award_id")
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ComplianceEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "award_id", nullable = false)
    private Award award;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ComplianceEventType type;

    /** Stable identity of a RULE event, e.g. "UC_SE:2026" for FY 2026-27; null for MANUAL ones. */
    @Column(name = "rule_key", length = 40)
    private String ruleKey;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String title;

    /** The period the document covers, when it covers one (a financial year, a project year). */
    @Column(name = "period_start")
    private LocalDate periodStart;

    @Column(name = "period_end")
    private LocalDate periodEnd;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    /** True once the PI moved the due date; the rules then leave it alone. */
    @Column(name = "due_date_edited", nullable = false)
    private boolean dueDateEdited;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ComplianceEventStatus status = ComplianceEventStatus.PENDING;

    /** Null when not submitted, or when it was marked submitted without a date (deadlines before the grant was added). */
    @Column(name = "submitted_on")
    private LocalDate submittedOn;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private ComplianceEventOrigin origin;

    /** Why this due date: the agency rule it comes from, or that it's a FundSphere default. */
    @Column(columnDefinition = "TEXT")
    private String basis;
}
