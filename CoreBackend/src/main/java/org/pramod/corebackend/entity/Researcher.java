/**
 * This file contains the Researcher class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.pramod.corebackend.enums.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "researchers")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Researcher {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", unique = true)
    private AppUser user;

    // --- Section 2: User Type ---
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserType userType;

    // --- Section 3: Organization / Institution Details ---
    @Column(nullable = false)
    private String institutionName;

    private String department;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Position position;

    /** Explicit institution category (University, Govt Lab, Startup, …). */
    @Enumerated(EnumType.STRING)
    private InstitutionType institutionType;

    // --- Section 4: Research / Interest Area ---
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PrimaryField primaryField;

    /** Additional fields the researcher works in beyond their primary field. */
    @ElementCollection
    @CollectionTable(name = "researcher_additional_fields", joinColumns = @JoinColumn(name = "researcher_id"))
    @Column(name = "field")
    private List<String> additionalFields;

    @ElementCollection
    @CollectionTable(name = "researcher_keywords", joinColumns = @JoinColumn(name = "researcher_id"))
    @Column(name = "keyword")
    private List<String> keywords;

    /**
     * The researcher's own free-text description of their work. This is the
     * single most valuable field for semantic matching — embeddings, HyDE, and
     * query expansion all run on the research bio, and real prose retrieves far
     * better than the templated bio synthesized from enum fields.
     */
    @Column(columnDefinition = "TEXT")
    private String researchSummary;

    /** ORCID iD (e.g. "0000-0002-1825-0097"), if the researcher linked one.
     * Stored for optional re-sync; profile enrichment prefills from it. */
    private String orcidId;

    // --- Section 5: Location Information ---
    @Column(nullable = false)
    private String country;

    private String state;

    private String city;

    /** Legal citizenship/nationality — distinct from country of residence;
     * drives the recommender's citizenship eligibility guard. */
    private String citizenship;

    // --- Section 6: Funding Preferences ---
    private BigDecimal minFundingAmount;

    private BigDecimal maxFundingAmount;

    @Enumerated(EnumType.STRING)
    private GrantType preferredGrantType;

    // --- Section 7: Experience / Background ---
    private Integer yearsOfExperience;

    @Enumerated(EnumType.STRING)
    private EducationLevel educationLevel;

    /** Whether a PhD/doctorate has actually been *completed* — distinct from
     * educationLevel, which can mean "currently pursuing". Drives the
     * recommender's PhD-required eligibility guard. */
    private Boolean hasCompletedPhd;

    @Builder.Default
    @Column(nullable = false)
    private Boolean previousGrantsReceived = false;

    // --- Section 8: Notification Preferences ---
    @Builder.Default
    @Column(nullable = false)
    private Boolean emailNotifications = false;

    @Builder.Default
    @Column(nullable = false)
    private Boolean deadlineReminders = false;

    @Builder.Default
    @Column(nullable = false)
    private Boolean weeklyGrantRecommendations = false;

    // --- Timestamps ---
    @Column(updatable = false)
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }
}


