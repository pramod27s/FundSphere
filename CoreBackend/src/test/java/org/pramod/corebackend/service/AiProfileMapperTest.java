package org.pramod.corebackend.service;

import org.junit.jupiter.api.Test;
import org.pramod.corebackend.dto.ResearcherResponse;
import org.pramod.corebackend.enums.Position;
import org.pramod.corebackend.enums.PrimaryField;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AiProfileMapperTest {

    private final AiProfileMapper mapper = new AiProfileMapper();

    private static ResearcherResponse researcher() {
        return ResearcherResponse.builder()
                .researchSummary("I study perovskite solar cell stability")
                .position(Position.PROFESSOR)
                .department("Materials Science")
                .institutionName("IIT Bombay")
                .country("India")
                .primaryField(PrimaryField.HEALTHCARE)
                .keywords(List.of("perovskite", "photovoltaics"))
                .build();
    }

    @Test
    void bioDescribesTheResearchTopicOnly() {
        String bio = mapper.buildResearchBio(researcher());

        assertEquals("I study perovskite solar cell stability. Department of Materials Science. "
                + "Research focus: Healthcare. Keywords: perovskite, photovoltaics.", bio);
    }

    @Test
    void aZeroOrMissingBudgetIsNoPreference() {
        ResearcherResponse zero = researcher();
        zero.setMinFundingAmount(BigDecimal.ZERO);
        zero.setMaxFundingAmount(BigDecimal.ZERO);
        var profile = mapper.mapToAiUserProfile(zero);

        assertNull(profile.getPreferredMinAmount());
        assertNull(profile.getPreferredMaxAmount());
        assertNull(mapper.mapToAiUserProfile(researcher()).getPreferredMaxAmount());
    }

    @Test
    void aRealBudgetIsSentInRupees() {
        ResearcherResponse set = researcher();
        set.setMinFundingAmount(new BigDecimal("500000"));
        set.setMaxFundingAmount(new BigDecimal("5000000"));
        var profile = mapper.mapToAiUserProfile(set);

        assertEquals(new BigDecimal("500000"), profile.getPreferredMinAmount());
        assertEquals(new BigDecimal("5000000"), profile.getPreferredMaxAmount());
        assertEquals("INR", profile.getPreferredCurrency());
    }

    @Test
    void eligibilityStillTravelsInItsOwnFields() {
        var profile = mapper.mapToAiUserProfile(researcher());

        assertEquals("India", profile.getCountry());
        assertEquals("Professor", profile.getCareerStage());
        assertFalse(profile.getResearchBio().contains("India"));
        assertFalse(profile.getResearchBio().contains("IIT Bombay"));
        assertFalse(profile.getResearchBio().contains("Professor"));
    }
}
