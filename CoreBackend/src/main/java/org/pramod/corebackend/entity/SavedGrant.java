/**
 * Bookmark linking an AppUser to a Grant.
 * One row per (user, grant) pair — uniqueness is enforced at the DB level
 * so we can blindly insert on save and rely on the constraint to deduplicate.
 */
package org.pramod.corebackend.entity;

import jakarta.persistence.*;
import lombok.*;

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
                @Index(name = "idx_saved_grants_grant", columnList = "grant_id")
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

    @Column(name = "saved_at", updatable = false, nullable = false)
    private LocalDateTime savedAt;

    @PrePersist
    protected void onCreate() {
        this.savedAt = LocalDateTime.now();
    }
}
