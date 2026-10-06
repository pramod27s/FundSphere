/**
 * A call's guidelines, read once by the AI and stored: the application
 * checklist (Objective 3) and the rules, criteria and required sections the
 * Proposal Assistant checks drafts against.
 *
 * Keyed by a hash of the guidelines' text, so the same document is never
 * read twice, whether it was uploaded or fetched from a link, and whichever
 * user or application it came from.
 */
package org.pramod.corebackend.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "guideline_extractions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GuidelineExtraction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "content_hash", nullable = false, unique = true, length = 64)
    private String contentHash;

    @Column(name = "source_name", columnDefinition = "TEXT")
    private String sourceName;

    /** The ai-service extraction response as JSON (items, proposal guidance, deadline, warnings). */
    @Column(name = "extraction_json", nullable = false, columnDefinition = "TEXT")
    private String extractionJson;

    @Column(name = "created_at", nullable = false, updatable = false)
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
