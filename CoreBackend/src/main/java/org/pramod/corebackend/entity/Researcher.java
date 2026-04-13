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

    // --- Section 4: Research / Interest Area ---
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PrimaryField primaryField;

    @ElementCollection
    @CollectionTable(name = "researcher_keywords", joinColumns = @JoinColumn(name = "researcher_id"))
    @Column(name = "keyword")
    private List<String> keywords;

    // --- Section 5: Location Information ---
    @Column(nullable = false)
    private String country;

    private String state;

    private String city;

    // --- Section 6: Funding Preferences ---
    private BigDecimal minFundingAmount;

    private BigDecimal maxFundingAmount;

    @Enumerated(EnumType.STRING)
    private GrantType preferredGrantType;

    // --- Section 7: Experience / Background ---
    private Integer yearsOfExperience;

    @Enumerated(EnumType.STRING)
    private EducationLevel educationLevel;

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

