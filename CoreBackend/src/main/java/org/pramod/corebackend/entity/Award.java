/**
 * A grant the user holds (Objective 4, "My grants"). Added from an
 * application marked Awarded (application set) or for a grant the PI
 * already held before using FundSphere (application null). The compliance
 * calendar and spend check are worked out from these details.
 */
package org.pramod.corebackend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Fetch;
import org.hibernate.annotations.FetchMode;
import org.pramod.corebackend.enums.AwardStatus;
import org.pramod.corebackend.enums.ReportingProfile;
import org.pramod.corebackend.enums.SubmissionPortal;
import org.pramod.corebackend.enums.UnspentPolicy;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(
        name = "awards",
        indexes = @Index(name = "idx_awards_owner", columnList = "owner_id"),
        // One grant per application; grants added by hand have no application.
        uniqueConstraints = @UniqueConstraint(name = "uk_awards_application", columnNames = "application_id")
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Award {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private AppUser owner;

    /** Null for grants added by hand, or after the application was deleted. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "application_id")
    private Application application;

    @Column(name = "project_title", nullable = false, columnDefinition = "TEXT")
    private String projectTitle;

    @Column(columnDefinition = "TEXT")
    private String agency;

    @Column(columnDefinition = "TEXT")
    private String scheme;

    @Column(name = "sanction_no", length = 200)
    private String sanctionNo;

    @Column(name = "sanction_date")
    private LocalDate sanctionDate;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    /** Whole rupees. Null when the PI hasn't entered it. */
    @Column(name = "total_sanctioned")
    private Long totalSanctioned;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "submission_portal", nullable = false, length = 20)
    private SubmissionPortal submissionPortal = SubmissionPortal.OTHER;

    /** The pasted link; only used when submissionPortal is OTHER. */
    @Column(name = "portal_url", columnDefinition = "TEXT")
    private String portalUrl;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "unspent_policy", nullable = false, length = 30)
    private UnspentPolicy unspentPolicy = UnspentPolicy.UNKNOWN;

    /**
     * Whose reporting rules the deadlines follow (4.2). The column default
     * fills grants added before this field existed.
     */
    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "reporting_profile", nullable = false, columnDefinition = "varchar(20) default 'OTHER' not null")
    private ReportingProfile reportingProfile = ReportingProfile.OTHER;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AwardStatus status = AwardStatus.ACTIVE;

    /**
     * The project's objectives as the proposal states them, one per line, so
     * progress-report drafts (4.4) can report against them. Null until added.
     */
    @Column(columnDefinition = "TEXT")
    private String objectives;

    @Builder.Default
    @OneToMany(mappedBy = "award", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<BudgetLine> budgetLines = new ArrayList<>();

    /** Reporting deadlines (4.2). Loaded for a whole list of grants in one extra query. */
    @Builder.Default
    @OneToMany(mappedBy = "award", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("dueDate ASC, id ASC")
    @Fetch(FetchMode.SUBSELECT)
    private List<ComplianceEvent> events = new ArrayList<>();

    /** What the project produced (4.4). Not loaded with the grant; read through AwardOutputService. */
    @Builder.Default
    @OneToMany(mappedBy = "award", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("id ASC")
    private List<AwardOutput> outputs = new ArrayList<>();

    /** Spending copied from the institute's statement, per year and head (4.3). Loaded for a whole list of grants in one extra query. */
    @Builder.Default
    @OneToMany(mappedBy = "award", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("fyStartYear ASC, head ASC")
    @Fetch(FetchMode.SUBSELECT)
    private List<SpendRecord> spendRecords = new ArrayList<>();

    /** The Equipment warning (4.3) fires when less than this % is used by equipmentAlertMonth; null means 25. */
    @Column(name = "equipment_alert_percent")
    private Integer equipmentAlertPercent;

    /** 1-12; null means October. */
    @Column(name = "equipment_alert_month")
    private Integer equipmentAlertMonth;

    /** Progress-report drafts (4.4). Mapped only so deleting the grant deletes them; read through GeneratedDraftRepository. */
    @Builder.Default
    @OneToMany(mappedBy = "award", cascade = CascadeType.REMOVE)
    private List<GeneratedDraft> drafts = new ArrayList<>();

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
