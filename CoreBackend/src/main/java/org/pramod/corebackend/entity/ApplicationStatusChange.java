/**
 * One status change on an application (e.g. PREPARING -> SUBMITTED on 2 Nov),
 * kept so the application page can show its history.
 */
package org.pramod.corebackend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.pramod.corebackend.enums.ApplicationStatus;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "application_status_changes",
        indexes = @Index(name = "idx_application_status_changes_application", columnList = "application_id")
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ApplicationStatusChange {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "application_id", nullable = false)
    private Application application;

    /** Null for the first entry, when the application was started. */
    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 20)
    private ApplicationStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", nullable = false, length = 20)
    private ApplicationStatus toStatus;

    @Column(name = "changed_at", nullable = false)
    private LocalDateTime changedAt;
}
