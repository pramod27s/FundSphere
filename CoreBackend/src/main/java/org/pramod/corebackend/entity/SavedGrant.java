/**
 * Bookmark linking an AppUser to a Grant.
 * One row per (user, grant) pair — uniqueness is enforced at the DB level
 * so we can blindly insert on save and rely on the constraint to deduplicate.
 */
package org.pramod.corebackend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.pramod.corebackend.enums.SavedGrantStatus;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "saved_grants",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_saved_grants_user_grant",
                columnNames = {"user_id", "grant_id"}
        ),
        indexes = {
                @Index(name = "idx_saved_grants_user", columnList = "user_id"),
                @Index(name = "idx_saved_grants_grant", columnList = "grant_id"),
                @Index(name = "idx_saved_grants_user_status", columnList = "user_id,status")
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SavedGrant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private AppUser user;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "grant_id", nullable = false)
    private Grant grant;

    /**
     * Where the user is in their workflow with this grant. Defaults to
     * INTERESTED on first save; users update it as they apply / submit.
     */
    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20, columnDefinition = "VARCHAR(20) DEFAULT 'INTERESTED'")
    private SavedGrantStatus status = SavedGrantStatus.INTERESTED;

    /**
     * Free-form personal notes the user keeps against this grant
     * ("ask Dr. X about co-authorship", "deadline conflicts with conference",
     * etc.). TEXT so it can be paragraphs.
     */
    @Column(name = "notes", columnDefinition = "TEXT")
    private String notes;

    @Column(name = "saved_at", updatable = false, nullable = false)
    private LocalDateTime savedAt;

    /**
     * NOT NULL with a CURRENT_TIMESTAMP default so Hibernate can add this
     * column to a table that already has rows (existing bookmarks get the
     * migration time as their updated_at). New rows are filled by
     * {@link #onCreate()} and {@link #onUpdate()}.
     */
    @Column(name = "updated_at", nullable = false, columnDefinition = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        this.savedAt = LocalDateTime.now();
        this.updatedAt = this.savedAt;
        if (this.status == null) {
            this.status = SavedGrantStatus.INTERESTED;
        }
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
