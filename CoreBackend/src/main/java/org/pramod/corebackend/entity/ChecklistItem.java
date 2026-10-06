/**
 * One requirement on an application's checklist: a document to attach, a
 * format limit, an eligibility proof, a budget rule, a submission detail or
 * a key date. AI items carry the guideline sentence they came from.
 *
 * Due dates: while the application has a deadline, an item's due date is
 * deadline minus dueOffsetDays, so moving the deadline moves every item.
 * Items with a date of their own in the guidelines, or a date the user set
 * while there was no deadline, have a fixed dueDate and no offset.
 */
package org.pramod.corebackend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.pramod.corebackend.enums.ChecklistCategory;
import org.pramod.corebackend.enums.ChecklistItemOrigin;
import org.pramod.corebackend.enums.ChecklistItemStatus;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "checklist_items",
        indexes = @Index(name = "idx_checklist_items_application", columnList = "application_id")
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChecklistItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "application_id", nullable = false)
    private Application application;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ChecklistCategory category;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String text;

    @Builder.Default
    @Column(nullable = false)
    private boolean mandatory = true;

    /** Needs a signature from outside the team (e.g. Head of Institution), so it's due earlier. */
    @Builder.Default
    @Column(name = "sign_off", nullable = false)
    private boolean signOff = false;

    @Column(name = "source_quote", columnDefinition = "TEXT")
    private String sourceQuote;

    @Column(name = "source_page")
    private Integer sourcePage;

    /** True when the quote was found in the guidelines text; null for manual items. */
    @Column(name = "source_verified")
    private Boolean sourceVerified;

    /** Free text such as "Ravi (JRF)"; team members don't need accounts. */
    @Column(name = "owner_name", length = 120)
    private String ownerName;

    @Column(name = "due_date")
    private LocalDate dueDate;

    /** Days before the application deadline; null when dueDate is fixed. */
    @Column(name = "due_offset_days")
    private Integer dueOffsetDays;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private ChecklistItemStatus status = ChecklistItemStatus.TODO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private ChecklistItemOrigin origin;

    @Column(nullable = false)
    private int position;

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
