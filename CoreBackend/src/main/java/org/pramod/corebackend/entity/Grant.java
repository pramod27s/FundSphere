/**
 * This file contains the Grant class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "grants")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Grant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String grantTitle;

    private String fundingAgency;

    private String programName;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, unique = true)
    private String grantUrl;

    private LocalDateTime applicationDeadline;

    private BigDecimal fundingAmountMin;

    private BigDecimal fundingAmountMax;

    private String fundingCurrency;

    private String eligibleCountries;

    private String eligibleApplicants;

    private String institutionType;

    private String field;

    @Column(columnDefinition = "TEXT")
    private String objectives;

    @Column(columnDefinition = "TEXT")
    private String fundingScope;

    @Column(columnDefinition = "TEXT")
    private String eligibilityCriteria;

    @Column(columnDefinition = "TEXT")
    private String selectionCriteria;

    private String grantDuration;

    @Column(columnDefinition = "TEXT")
    private String researchThemes;

    private String applicationLink;

    @Column(nullable = false)
    private String checksum;

    @ElementCollection
    @CollectionTable(name = "grant_tags", joinColumns = @JoinColumn(name = "grant_id"))
    @Column(name = "tag")
    private List<String> tags;

    @Column(updatable = false)
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    private LocalDateTime lastScrapedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
        this.lastScrapedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}
