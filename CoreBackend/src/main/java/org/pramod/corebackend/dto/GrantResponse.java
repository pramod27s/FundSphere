/**
 * This file contains the GrantResponse class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.dto;

import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GrantResponse {

    private Long id;
    private String grantTitle;
    private String fundingAgency;
    private String programName;
    private String description;
    private String grantUrl;
    private LocalDateTime applicationDeadline;
    private LocalDateTime openingDate;
    private LocalDateTime loiDeadline;
    private LocalDateTime decisionDate;
    private LocalDateTime projectStartDate;
    private BigDecimal fundingAmountMin;
    private BigDecimal fundingAmountMax;
    private String fundingCurrency;
    private String eligibleCountries;
    private String eligibleApplicants;
    private String institutionType;
    private String field;
    private String applicationLink;
    private String checksum;
    private Long possibleDuplicateOfId;
    private Integer duplicateConfidence;
    private List<String> tags;
    private String objectives;
    private String fundingScope;
    private String eligibilityCriteria;
    private String selectionCriteria;
    private String grantDuration;
    private String researchThemes;
    private Boolean requiresPhd;
    private Integer minExperienceYears;
    private String citizenshipRequired;
    private String grantType;
    private String targetCareerStages;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime lastScrapedAt;
    private LocalDateTime lastVerifiedAt;
}
