package org.pramod.corebackend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.LocalDateTime;

/**
 * A researcher's profile photo, kept in its own table so loading a profile
 * doesn't also load the image bytes. One photo per researcher: the row shares
 * the researcher's id, and is removed with the researcher.
 */
@Entity
@Table(name = "researcher_photos")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResearcherPhoto {

    @Id
    private Long researcherId;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "researcher_id")
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Researcher researcher;

    /** image/jpeg, image/png or image/webp, worked out from the bytes rather than the upload's header. */
    @Column(nullable = false, length = 32)
    private String contentType;

    /** Stored as bytea. Not @Lob, which PostgreSQL would turn into a large object. */
    @Column(nullable = false)
    private byte[] data;

    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    protected void touch() {
        this.updatedAt = LocalDateTime.now();
    }
}
