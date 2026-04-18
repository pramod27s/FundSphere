/**
 * This file contains the ResearcherController class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.ResearcherRequest;
import org.pramod.corebackend.dto.ResearcherResponse;
import org.pramod.corebackend.enums.PrimaryField;
import org.pramod.corebackend.enums.UserType;
import org.pramod.corebackend.security.UserPrincipal;
import org.pramod.corebackend.service.AiServiceClient;
import org.pramod.corebackend.service.GrantService;
import org.pramod.corebackend.service.ResearcherService;
import org.pramod.corebackend.dto.ai.AiUserProfileResponse;
import org.pramod.corebackend.dto.ai.AiKeywordCandidateResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/researchers")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class ResearcherController {

    private final ResearcherService researcherService;
    private final AiServiceClient aiServiceClient;
    private final GrantService grantService;

    /**
     * Creates or updates the researcher profile for the currently authenticated user.
     * @param principal The security principal of the logged-in user.
     * @param request The researcher profile details.
     * @return The created or updated ResearcherResponse.
     */
    @PostMapping
    public ResponseEntity<ResearcherResponse> createResearcher(@AuthenticationPrincipal UserPrincipal principal,
                                                               @RequestBody ResearcherRequest request) {
        ResearcherResponse response = researcherService.createOrUpdateForUser(principal.getId(), request);
        return ResponseEntity.ok(response);
    }

    /**
     * Retrieves the researcher profile of the currently logged-in user.
     * @param principal The security principal of the logged-in user.
     * @return The researcher's profile response.
     */
    @GetMapping("/me")
    public ResponseEntity<ResearcherResponse> getMyResearcher(@AuthenticationPrincipal UserPrincipal principal) {
        ResearcherResponse response = researcherService.getResearcherByUserId(principal.getId());
        return ResponseEntity.ok(response);
    }

    /**
     * Retrieves AI-powered grant recommendations tailored to the current user's profile.
     * The researcher ID is resolved server-side from the authenticated user to avoid client-side ID mismatch bugs.
     * @param principal The security principal of the logged-in user.
     * @param request Optional request with userQuery and topK.
     * @return AI recommendations specific to the researcher.
     */
    @PostMapping("/me/matches")
    public ResponseEntity<Object> getMyMatches(@AuthenticationPrincipal UserPrincipal principal,
                                               @RequestBody(required = false) Map<String, Object> request) {
        ResearcherResponse researcher = researcherService.getResearcherByUserId(principal.getId());

        AiUserProfileResponse userProfile = AiUserProfileResponse.builder()
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

        int topK = parseTopK(request);
        String userQuery = parseUserQuery(request);

        // Always include profile context in keyword search; append user query if present.
        String profileQuery = buildQueryText(userProfile);
        String queryText = userQuery != null
                ? profileQuery + " " + userQuery
                : profileQuery;

        List<AiKeywordCandidateResponse> keywordCandidates = grantService.keywordSearch(
                        queryText,
                        userProfile.getCountry(),
                        userProfile.getInstitutionType(),
                        userProfile.getApplicantType(),
                        Math.max(topK * 3, 20))
                .stream()
                .map(hit -> AiKeywordCandidateResponse.builder()
                        .grantId(hit.grantId())
                        .keywordScore(hit.keywordScore())
                        .build())
                .toList();

        Map<String, Object> requestToAi = new HashMap<>();
        requestToAi.put("userId", researcher.getId());
        requestToAi.put("userProfile", userProfile);
        requestToAi.put("keywordCandidates", keywordCandidates);
        requestToAi.put("topK", topK);
        requestToAi.put("useRerank", parseUseRerank(request));
        requestToAi.put("userQuery", userQuery);

        return ResponseEntity.ok(aiServiceClient.recommend(requestToAi));
    }

    private String buildQueryText(AiUserProfileResponse profile) {
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

    /**
     * Synthesizes a research bio from available researcher fields.
     * This gives the AI service a rich textual description of the user for semantic matching.
     */
    private String buildResearchBio(ResearcherResponse researcher) {
        StringBuilder bio = new StringBuilder();

        String position = researcher.getPosition() != null ? humanizeEnum(researcher.getPosition().name()) : null;
        String field = researcher.getPrimaryField() != null ? humanizeEnum(researcher.getPrimaryField().name()) : null;
        String dept = researcher.getDepartment();
        String institution = researcher.getInstitutionName();
        String country = researcher.getCountry();
        List<String> keywords = researcher.getKeywords();

        // Build a natural-language description, e.g.:
        // "Professor in the department of Computer Science at MIT, India.
        //  Research focus: Artificial Intelligence. Keywords: deep learning, NLP, transformers."
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

    /**
     * Infers a general institution type category from the institution name.
     * Used as a metadata filter for Pinecone searches.
     */
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
        // Default: treat as an academic institution if we can't determine.
        return "Academic Institutions";
    }

    /**
     * Builds a list of human-readable research interests from primaryField and keywords.
     */
    private List<String> buildResearchInterests(ResearcherResponse researcher) {
        List<String> interests = new ArrayList<>();
        if (researcher.getPrimaryField() != null) {
            interests.add(humanizeEnum(researcher.getPrimaryField().name()));
        }
        // Include keywords as secondary interests for broader semantic matching.
        if (researcher.getKeywords() != null) {
            for (String keyword : researcher.getKeywords()) {
                if (keyword != null && !keyword.isBlank() && !interests.contains(keyword.trim())) {
                    interests.add(keyword.trim());
                }
            }
        }
        return interests;
    }

    /**
     * Converts an UPPER_SNAKE_CASE enum name to a human-readable Title Case string.
     * e.g. "ARTIFICIAL_INTELLIGENCE" → "Artificial Intelligence"
     */
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

    /**
     * Backward-compatible GET endpoint for existing clients.
     */
    @GetMapping("/me/matches")
    public ResponseEntity<Object> getMyMatchesLegacy(@AuthenticationPrincipal UserPrincipal principal) {
        return getMyMatches(principal, null);
    }

    private int parseTopK(Map<String, Object> request) {
        int defaultTopK = 12;
        int minTopK = 1;
        int maxTopK = 50;

        if (request == null || request.get("topK") == null) {
            return defaultTopK;
        }

        Object raw = request.get("topK");
        int parsed;

        if (raw instanceof Number number) {
            parsed = number.intValue();
        } else {
            try {
                parsed = Integer.parseInt(raw.toString());
            } catch (NumberFormatException ex) {
                return defaultTopK;
            }
        }

        return Math.max(minTopK, Math.min(maxTopK, parsed));
    }

    private String parseUserQuery(Map<String, Object> request) {
        if (request == null || request.get("userQuery") == null) {
            return null;
        }

        String value = request.get("userQuery").toString().trim();
        return value.isEmpty() ? null : value;
    }

    private boolean parseUseRerank(Map<String, Object> request) {
        if (request == null || request.get("useRerank") == null) {
            return false;
        }

        Object raw = request.get("useRerank");
        if (raw instanceof Boolean value) {
            return value;
        }

        String value = raw.toString().trim().toLowerCase();
        return "true".equals(value) || "1".equals(value) || "yes".equals(value) || "y".equals(value) || "on".equals(value);
    }

    /**
     * Retrieves a list of all researcher profiles in the system.
     * @return List of ResearcherResponse objects.
     */
    @GetMapping
    public ResponseEntity<List<ResearcherResponse>> getAllResearchers() {
        List<ResearcherResponse> researchers = researcherService.getAllResearchers();
        return ResponseEntity.ok(researchers);
    }

    /**
     * Retrieves a specific researcher profile by its unique ID.
     * @param id The primary key of the researcher profile.
     * @return The matching ResearcherResponse.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ResearcherResponse> getResearcherById(@PathVariable Long id) {
        ResearcherResponse response = researcherService.getResearcherById(id);
        return ResponseEntity.ok(response);
    }

    /**
     * Updates an existing researcher profile by its ID.
     * @param id The primary key of the target researcher profile.
     * @param request The new data to update the profile with.
     * @return The updated ResearcherResponse.
     */
    @PutMapping("/{id}")
    public ResponseEntity<ResearcherResponse> updateResearcher(@PathVariable Long id,
                                                                @RequestBody ResearcherRequest request) {
        ResearcherResponse response = researcherService.updateResearcher(id, request);
        return ResponseEntity.ok(response);
    }

    /**
     * Deletes a researcher profile by its ID.
     * @param id The primary key of the researcher profile to delete.
     * @return A success message alongside the deleted profile's ID.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> deleteResearcher(@PathVariable Long id) {
        researcherService.deleteResearcher(id);
        return ResponseEntity.ok(Map.of("message", "Researcher deleted successfully", "id", id.toString()));
    }

    /**
     * Filters and retrieves researchers based on their UserType (e.g., ACADEMIC, STARTUP).
     * @param userType The user type to filter by.
     * @return List of matching ResearcherResponse objects.
     */
    @GetMapping("/filter/user-type/{userType}")
    public ResponseEntity<List<ResearcherResponse>> getByUserType(@PathVariable UserType userType) {
        List<ResearcherResponse> researchers = researcherService.getByUserType(userType);
        return ResponseEntity.ok(researchers);
    }

    /**
     * Filters and retrieves researchers based on their PrimaryField of study.
     * @param primaryField The domain/field to filter by (e.g., COMPUTER_SCIENCE).
     * @return List of matching ResearcherResponse objects.
     */
    @GetMapping("/filter/primary-field/{primaryField}")
    public ResponseEntity<List<ResearcherResponse>> getByPrimaryField(@PathVariable PrimaryField primaryField) {
        List<ResearcherResponse> researchers = researcherService.getByPrimaryField(primaryField);
        return ResponseEntity.ok(researchers);
    }

    /**
     * Filters and retrieves researchers residing in a specific country.
     * @param country The name of the country.
     * @return List of matching ResearcherResponse objects.
     */
    @GetMapping("/filter/country/{country}")
    public ResponseEntity<List<ResearcherResponse>> getByCountry(@PathVariable String country) {
        List<ResearcherResponse> researchers = researcherService.getByCountry(country);
        return ResponseEntity.ok(researchers);
    }

    /**
     * Searches for researchers associated with a particular institution name.
     * @param name The name or partial name of the institution.
     * @return List of matching ResearcherResponse objects.
     */
    @GetMapping("/search/institution")
    public ResponseEntity<List<ResearcherResponse>> getByInstitution(@RequestParam String name) {
        List<ResearcherResponse> researchers = researcherService.getByInstitution(name);
        return ResponseEntity.ok(researchers);
    }
}
