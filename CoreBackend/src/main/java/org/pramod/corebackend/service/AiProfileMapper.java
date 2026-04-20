package org.pramod.corebackend.service;

import org.pramod.corebackend.dto.ResearcherResponse;
import org.pramod.corebackend.dto.ai.AiUserProfileResponse;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class AiProfileMapper {

    public AiUserProfileResponse mapToAiUserProfile(ResearcherResponse researcher) {
        return AiUserProfileResponse.builder()
                .userId(researcher.getId())
                .country(researcher.getCountry())
                .institutionType(inferInstitutionType(researcher.getInstitutionName()))
                .applicantType(researcher.getUserType() == null ? null : humanizeEnum(researcher.getUserType().name()))
                .careerStage(researcher.getPosition() == null ? null : humanizeEnum(researcher.getPosition().name()))
                .department(researcher.getDepartment())
                .researchBio(buildResearchBio(researcher))
                .researchInterests(buildResearchInterests(researcher))
                .keywords(researcher.getKeywords() == null ? List.of() : researcher.getKeywords())
                .preferredMinAmount(researcher.getMinFundingAmount())
                .preferredMaxAmount(researcher.getMaxFundingAmount())
                .preferredCurrency("USD")
                .build();
    }

    public String buildQueryText(AiUserProfileResponse profile) {
        StringBuilder parts = new StringBuilder();
        if (profile.getResearchBio() != null && !profile.getResearchBio().isBlank()) {
            parts.append(profile.getResearchBio()).append(" ");
        }
        if (profile.getResearchInterests() != null && !profile.getResearchInterests().isEmpty()) {
            parts.append(String.join(", ", profile.getResearchInterests())).append(" ");
        }
        if (profile.getKeywords() != null && !profile.getKeywords().isEmpty()) {
            parts.append(String.join(", ", profile.getKeywords())).append(" ");
        }
        if (profile.getDepartment() != null && !profile.getDepartment().isBlank()) {
            parts.append(profile.getDepartment()).append(" ");
        }
        if (profile.getCountry() != null && !profile.getCountry().isBlank()) {
            parts.append(profile.getCountry()).append(" ");
        }
        return parts.toString().trim();
    }

    private String buildResearchBio(ResearcherResponse researcher) {
        StringBuilder bio = new StringBuilder();

        String position = researcher.getPosition() != null ? humanizeEnum(researcher.getPosition().name()) : null;
        String field = researcher.getPrimaryField() != null ? humanizeEnum(researcher.getPrimaryField().name()) : null;
        String dept = researcher.getDepartment();
        String institution = researcher.getInstitutionName();
        String country = researcher.getCountry();
        List<String> keywords = researcher.getKeywords();

        if (position != null) {
            bio.append(position);
        }
        if (dept != null && !dept.isBlank()) {
            bio.append(bio.length() > 0 ? " in the department of " : "Department of ");
            bio.append(dept);
        }
        if (institution != null && !institution.isBlank()) {
            bio.append(bio.length() > 0 ? " at " : "At ");
            bio.append(institution);
        }
        if (country != null && !country.isBlank()) {
            bio.append(", ").append(country);
        }
        if (bio.length() > 0) {
            bio.append(". ");
        }
        if (field != null) {
            bio.append("Research focus: ").append(field).append(". ");
        }
        if (keywords != null && !keywords.isEmpty()) {
            bio.append("Keywords: ").append(String.join(", ", keywords)).append(".");
        }

        String result = bio.toString().trim();
        return result.isEmpty() ? null : result;
    }

    private String inferInstitutionType(String institutionName) {
        if (institutionName == null || institutionName.isBlank()) {
            return null;
        }
        String lower = institutionName.trim().toLowerCase();
        if (lower.contains("university") || lower.contains("universit")) {
            return "University";
        }
        if (lower.contains("college")) {
            return "College";
        }
        if (lower.contains("institute") || lower.contains("institution")) {
            return "Academic Institutions";
        }
        if (lower.contains("hospital") || lower.contains("medical") || lower.contains("clinic")) {
            return "Medical Institution";
        }
        if (lower.contains("lab") || lower.contains("laboratory") || lower.contains("research center") || lower.contains("research centre")) {
            return "Research Lab";
        }
        if (lower.contains("startup") || lower.contains("inc") || lower.contains("llc") || lower.contains("ltd") || lower.contains("corp")) {
            return "Startup";
        }
        if (lower.contains("ngo") || lower.contains("non-profit") || lower.contains("nonprofit") || lower.contains("foundation") || lower.contains("trust")) {
            return "NGO";
        }
        return "Academic Institutions";
    }

    private List<String> buildResearchInterests(ResearcherResponse researcher) {
        List<String> interests = new ArrayList<>();
        if (researcher.getPrimaryField() != null) {
            interests.add(humanizeEnum(researcher.getPrimaryField().name()));
        }
        if (researcher.getKeywords() != null) {
            for (String keyword : researcher.getKeywords()) {
                if (keyword != null && !keyword.isBlank() && !interests.contains(keyword.trim())) {
                    interests.add(keyword.trim());
                }
            }
        }
        return interests;
    }

    private String humanizeEnum(String enumName) {
        if (enumName == null || enumName.isBlank()) {
            return null;
        }
        String[] words = enumName.toLowerCase().split("_");
        StringBuilder sb = new StringBuilder();
        for (String word : words) {
            if (!word.isEmpty()) {
                if (sb.length() > 0) sb.append(" ");
                sb.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
            }
        }
        return sb.toString();
    }
}
