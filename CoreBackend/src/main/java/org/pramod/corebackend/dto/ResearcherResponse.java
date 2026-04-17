/**
 * This file contains the ResearcherResponse class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.dto;

import lombok.*;
import org.pramod.corebackend.enums.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResearcherResponse {

    private Long id;

    // User Type
    private UserType userType;

    // Organization / Institution Details
    private String institutionName;
    private String department;
    private Position position;

    // Research / Interest Area
    private PrimaryField primaryField;
    private List<String> keywords;

    // Location Information
    private String country;
    private String state;
    private String city;

    // Funding Preferences
    private BigDecimal minFundingAmount;
    private BigDecimal maxFundingAmount;
    private GrantType preferredGrantType;

    // Experience / Background
    private Integer yearsOfExperience;
    private EducationLevel educationLevel;
    private Boolean previousGrantsReceived;

    // Notification Preferences
    private Boolean emailNotifications;
    private Boolean deadlineReminders;
    private Boolean weeklyGrantRecommendations;

    // Timestamps
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}


