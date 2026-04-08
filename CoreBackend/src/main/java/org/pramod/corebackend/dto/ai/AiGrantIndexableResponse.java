package org.pramod.corebackend.dto.ai;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AiGrantIndexableResponse {

    private Long id;
    private String grantTitle;
    private String fundingAgency;
    private String programName;
    private String description;
    private String grantUrl;
    private LocalDateTime applicationDeadline;
    private BigDecimal fundingAmountMin;
    private BigDecimal fundingAmountMax;
    private String fundingCurrency;
    private List<String> eligibleCountries;
    private List<String> eligibleApplicants;
    private List<String> institutionType;
    private List<String> field;
    private String applicationLink;
    private String checksum;
    private List<String> tags;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime lastScrapedAt;
}

