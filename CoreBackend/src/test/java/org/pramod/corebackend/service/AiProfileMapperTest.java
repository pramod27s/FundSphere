package org.pramod.corebackend.service;

import org.junit.jupiter.api.Test;
import org.pramod.corebackend.dto.ResearcherResponse;
import org.pramod.corebackend.enums.Position;
import org.pramod.corebackend.enums.PrimaryField;

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
    void eligibilityStillTravelsInItsOwnFields() {
        var profile = mapper.mapToAiUserProfile(researcher());

        assertEquals("India", profile.getCountry());
        assertEquals("Professor", profile.getCareerStage());
        assertFalse(profile.getResearchBio().contains("India"));
        assertFalse(profile.getResearchBio().contains("IIT Bombay"));
        assertFalse(profile.getResearchBio().contains("Professor"));
    }
}
