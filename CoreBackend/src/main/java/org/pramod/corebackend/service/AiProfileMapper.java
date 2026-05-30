package org.pramod.corebackend.service;

import org.pramod.corebackend.dto.ResearcherResponse;
import org.pramod.corebackend.dto.ai.AiUserProfileResponse;
import org.pramod.corebackend.enums.EducationLevel;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class AiProfileMapper {

    public AiUserProfileResponse mapToAiUserProfile(ResearcherResponse researcher) {
        return AiUserProfileResponse.builder()
                .userId(researcher.getId())
                .country(researcher.getCountry())
                .institutionType(resolveInstitutionType(researcher))
                .applicantType(researcher.getUserType() == null ? null : humanizeEnum(researcher.getUserType().name()))
                .careerStage(researcher.getPosition() == null ? null : humanizeEnum(researcher.getPosition().name()))
                .department(researcher.getDepartment())
                .researchBio(buildResearchBio(researcher))
                .researchInterests(buildResearchInterests(researcher))
                .keywords(researcher.getKeywords() == null ? List.of() : researcher.getKeywords())
                .preferredMinAmount(researcher.getMinFundingAmount())
                .preferredMaxAmount(researcher.getMaxFundingAmount())
                .preferredCurrency("USD")
                // Eligibility signals. Prefer the explicit onboarding fields;
                // fall back to derivations for researchers created before these
                // columns existed.
                //  - hasPhd: explicit "completed PhD" flag, else inferred from education level
                //  - yearsOfExperience: collected directly in onboarding
                //  - citizenship: explicit field, else falls back to country of residence
                .hasPhd(resolveHasPhd(researcher))
                .yearsOfExperience(researcher.getYearsOfExperience())
                .citizenship(hasText(researcher.getCitizenship())
                        ? researcher.getCitizenship()
                        : researcher.getCountry())
                // Previously collected at onboarding but never sent to the
                // recommender — now humanized so it can match a grant's type.
                .preferredGrantType(researcher.getPreferredGrantType() == null
                        ? null
                        : humanizeEnum(researcher.getPreferredGrantType().name()))
                .build();
    }

    /**
     * Prefer the explicit completed-PhD flag. For older profiles that predate
     * it, fall back to education level (PHD ⇒ has PhD) — imperfect because that
     * enum conflates "pursuing" with "completed", which is exactly why the
     * explicit flag now exists.
     */
    private Boolean resolveHasPhd(ResearcherResponse researcher) {
        if (researcher.getHasCompletedPhd() != null) {
            return researcher.getHasCompletedPhd();
        }
        EducationLevel educationLevel = researcher.getEducationLevel();
        if (educationLevel == null) {
            return null;
        }
        return educationLevel == EducationLevel.PHD;
    }

    /**
     * Prefer the explicit institution-type selection; fall back to guessing
     * from the institution name for profiles created before the field existed.
     */
    private String resolveInstitutionType(ResearcherResponse researcher) {
        if (researcher.getInstitutionType() != null) {
            return humanizeEnum(researcher.getInstitutionType().name());
        }
        return inferInstitutionType(researcher.getInstitutionName());
    }

    private boolean hasText(String s) {
        return s != null && !s.isBlank();
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

        // Lead with the researcher's own free-text summary when available — it
        // is the richest semantic signal and embeds far better than the
        // structured context that follows.
        String summary = researcher.getResearchSummary();
        if (summary != null && !summary.isBlank()) {
            bio.append(summary.trim());
            if (!summary.trim().endsWith(".")) {
                bio.append(".");
            }
            bio.append(" ");
        }

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
        if (researcher.getAdditionalFields() != null) {
            for (String field : researcher.getAdditionalFields()) {
                if (field != null && !field.isBlank() && !interests.contains(field.trim())) {
                    interests.add(field.trim());
                }
            }
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
