/**
 * A funding application a user is preparing (Objective 3).
 * Started from a grant in FundSphere (grant set) or from a call outside it
 * (grant null). Title, agency, link and deadline are copied from the grant
 * at start so the application keeps working if the scraper later removes
 * or changes the grant.
 */
package org.pramod.corebackend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.pramod.corebackend.enums.ApplicationStatus;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(
        name = "applications",
        indexes = {
                @Index(name = "idx_applications_owner", columnList = "owner_id"),
                @Index(name = "idx_applications_owner_grant", columnList = "owner_id,grant_id")
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Application {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private AppUser owner;

    /** Null for calls added by hand, or after the grant was deleted. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "grant_id")
    private Grant grant;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String title;

    @Column(columnDefinition = "TEXT")
    private String agency;

    @Column(name = "call_url", columnDefinition = "TEXT")
    private String callUrl;

    /** The call's submission deadline. Checklist due dates are counted back from it. */
    private LocalDate deadline;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ApplicationStatus status = ApplicationStatus.PREPARING;

    @Column(name = "status_changed_at", nullable = false)
    private LocalDateTime statusChangedAt;

    @Column(columnDefinition = "TEXT")
    private String notes;

    /** The stored reading of this call's guidelines (checklist + proposal rules); null until extracted. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "guideline_extraction_id")
    private GuidelineExtraction guidelineExtraction;

    /** File name or URL the current AI checklist was extracted from. */
    @Column(name = "guidelines_source", columnDefinition = "TEXT")
    private String guidelinesSource;

    /** Warnings from the last extraction, one per line (e.g. unverified quotes). */
    @Column(name = "checklist_warnings", columnDefinition = "TEXT")
    private String checklistWarnings;

    @Column(name = "checklist_generated_at")
    private LocalDateTime checklistGeneratedAt;

    @Builder.Default
    @OneToMany(mappedBy = "application", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC, id ASC")
    private List<ChecklistItem> items = new ArrayList<>();

    @Builder.Default
    @OneToMany(mappedBy = "application", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("changedAt ASC, id ASC")
    private List<ApplicationStatusChange> statusHistory = new ArrayList<>();

    @Column(name = "created_at", updatable = false, nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = this.createdAt;
        if (this.status == null) {
            this.status = ApplicationStatus.PREPARING;
        }
        if (this.statusChangedAt == null) {
            this.statusChangedAt = this.createdAt;
        }
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
