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
    private BigDecimal fundingAmountMin;
    private BigDecimal fundingAmountMax;
    private String fundingCurrency;
    private String eligibleCountries;
    private String eligibleApplicants;
    private String institutionType;
    private String field;
    private String applicationLink;
    private String checksum;
    private List<String> tags;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime lastScrapedAt;
}

