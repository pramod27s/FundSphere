/**
 * This file contains the AiUserProfileResponse class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.dto.ai;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AiUserProfileResponse {

    private Long userId;
    private String country;
    private String institutionType;
    private String applicantType;
    private String careerStage;
    private String department;
    private String researchBio;
    private List<String> researchInterests;
    private List<String> keywords;
    private BigDecimal preferredMinAmount;
    private BigDecimal preferredMaxAmount;
    private String preferredCurrency;
}


