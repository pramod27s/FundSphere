/**
 * This file contains the AiBridgeController class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.GrantResponse;
import org.pramod.corebackend.dto.ResearcherResponse;
import org.pramod.corebackend.dto.ai.AiGrantIndexableResponse;
import org.pramod.corebackend.dto.ai.AiKeywordCandidateResponse;
import org.pramod.corebackend.dto.ai.AiKeywordSearchRequest;
import org.pramod.corebackend.dto.ai.AiUserProfileResponse;
import org.pramod.corebackend.service.AiServiceClient;
import org.pramod.corebackend.service.GrantService;
import org.pramod.corebackend.service.ResearcherService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@RestController
@RequestMapping("/api/ai")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class AiBridgeController {

    private final GrantService grantService;
    private final ResearcherService researcherService;
    private final AiServiceClient aiServiceClient;

    @Value("${integration.api-key:}")
    private String expectedApiKey;

    /**
     * Fetches a grant by ID formatted for indexing by the AI service.
     * @param id The ID of the grant to index.
     * @param apiKey Internal integration key.
     * @return AI indexable format.
     */
    @GetMapping("/grants/{id}/indexable")
    public ResponseEntity<AiGrantIndexableResponse> getGrantForIndexing(@PathVariable Long id,
                                                                         @RequestHeader(value = "X-API-KEY", required = false) String apiKey) {
        verifyApiKey(apiKey);
        GrantResponse grant = grantService.getGrantById(id);

        AiGrantIndexableResponse response = AiGrantIndexableResponse.builder()
                .id(grant.getId())
                .grantTitle(grant.getGrantTitle())
                .fundingAgency(grant.getFundingAgency())
                .programName(grant.getProgramName())
                .description(grant.getDescription())
                .grantUrl(grant.getGrantUrl())
                .applicationDeadline(grant.getApplicationDeadline())
                .fundingAmountMin(grant.getFundingAmountMin())
                .fundingAmountMax(grant.getFundingAmountMax())
                .fundingCurrency(grant.getFundingCurrency())
                .eligibleCountries(toList(grant.getEligibleCountries()))
                .eligibleApplicants(toList(grant.getEligibleApplicants()))
                .institutionType(toList(grant.getInstitutionType()))
                .field(toList(grant.getField()))
                .applicationLink(grant.getApplicationLink())
                .checksum(grant.getChecksum())
                .tags(grant.getTags() == null ? List.of() : grant.getTags())
                .createdAt(grant.getCreatedAt())
                .updatedAt(grant.getUpdatedAt())
                .lastScrapedAt(grant.getLastScrapedAt())
                .build();

        return ResponseEntity.ok(response);
    }

    /**
     * Fetches a user's details tailored for the AI recommendation process.
     * @param id User ID.
     * @param apiKey Internal integration key.
     * @return Formatted AI user profile response.
     */
    @GetMapping("/users/{id}/grant-profile")
    public ResponseEntity<AiUserProfileResponse> getUserProfile(@PathVariable Long id,
                                                                @RequestHeader(value = "X-API-KEY", required = false) String apiKey) {
        verifyApiKey(apiKey);
        // The ID passed from the frontend is the researcher ID (from ResearcherResponse.id)
        // Not the AppUser.id, so we must load by researcher ID!
        ResearcherResponse researcher = researcherService.getResearcherById(id);

        AiUserProfileResponse response = AiUserProfileResponse.builder()
                .userId(researcher.getId())
                .country(researcher.getCountry())
                .institutionType(null)
                .applicantType(researcher.getUserType() == null ? null : researcher.getUserType().name())
                .careerStage(researcher.getPosition() == null ? null : researcher.getPosition().name())
                .department(researcher.getDepartment())
                .researchBio(null)
                .researchInterests(researcher.getPrimaryField() == null
                        ? List.of()
                        : List.of(researcher.getPrimaryField().name()))
                .keywords(researcher.getKeywords() == null ? List.of() : researcher.getKeywords())
                .preferredMinAmount(researcher.getMinFundingAmount())
                .preferredMaxAmount(researcher.getMaxFundingAmount())
                .preferredCurrency("USD")
                .build();

        return ResponseEntity.ok(response);
    }

    /**
     * Conducts a keyword text search to retrieve the top grant candidates.
     * @param request Search query and filtering criteria.
     * @param apiKey Internal integration key.
     * @return List of matching grant candidates with scores.
     */
    @PostMapping("/grants/keyword-search")
    public ResponseEntity<List<AiKeywordCandidateResponse>> keywordSearch(@RequestBody AiKeywordSearchRequest request,
                                                                           @RequestHeader(value = "X-API-KEY", required = false) String apiKey) {
        verifyApiKey(apiKey);

        int topK = request.getTopK() == null ? 20 : request.getTopK();
        List<AiKeywordCandidateResponse> results = grantService.keywordSearch(
                        request.getQuery(),
                        request.getCountry(),
                        request.getInstitutionType(),
                        request.getApplicantType(),
                        topK)
                .stream()
                .map(hit -> AiKeywordCandidateResponse.builder()
                        .grantId(hit.grantId())
                        .keywordScore(hit.keywordScore())
                        .build())
                .toList();

        return ResponseEntity.ok(results);
    }

    /**
     * Retrieves IDs of grants that have been modified after a certain date.
     * Used by the AI service to selectively re-index updated chunks.
     * @param since The datetime from which to check.
     * @param apiKey Internal integration key.
     * @return List of grant IDs.
     */
    @GetMapping("/grants/changed-ids")
    public ResponseEntity<List<Long>> getChangedGrantIds(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime since,
            @RequestHeader(value = "X-API-KEY", required = false) String apiKey) {
        verifyApiKey(apiKey);
        return ResponseEntity.ok(grantService.getChangedGrantIds(since));
    }


    /**
     * Proxy endpoint: Forwards a recommendation request to the Python AI service.
     * @param request AI Service generic payload.
     * @param apiKey Expected client payload (if applicable).
     * @return AI recommender output.
     *
     * called by the frontend i guess , if @RequestHeader(value = "X-API-KEY", required = false) String apiKey is null not a problem , its fine
     */
    @PostMapping("/rag/recommend")
    public ResponseEntity<Object> recommend(@RequestBody Map<String, Object> request,
                                            @RequestHeader(value = "X-API-KEY", required = false) String apiKey) {
        return ResponseEntity.ok(aiServiceClient.recommend(request));
    }

    /**
     * Proxy endpoint: Commands the Python AI service to embed and index a single grant in Vector DB.
     * @param request AI Service generic payload.
     * @param apiKey Internal integration key.
     * @return Indexing confirmation.
     */
    @PostMapping("/rag/index-grant")
    public ResponseEntity<Object> indexGrant(@RequestBody Map<String, Object> request,
                                             @RequestHeader(value = "X-API-KEY", required = false) String apiKey) {
        verifyApiKey(apiKey);
        return ResponseEntity.ok(aiServiceClient.indexGrant(request));
    }

    /**
     * Proxy endpoint: Commands the Python AI service to bulk embed and index multiple grants in Vector DB.
     * @param request AI Service generic payload.
     * @param apiKey Internal integration key.
     * @return Batch Indexing confirmation.
     */
    @PostMapping("/rag/index-grants")
    public ResponseEntity<Object> indexGrants(@RequestBody Map<String, Object> request,
                                              @RequestHeader(value = "X-API-KEY", required = false) String apiKey) {
        verifyApiKey(apiKey);
        return ResponseEntity.ok(aiServiceClient.indexGrants(request));
    }

    private List<String> toList(String raw) {
        if (!StringUtils.hasText(raw)) {
            return List.of();
        }

        return Arrays.stream(raw.split("[,;/|]"))
                .map(String::trim)
                .filter(StringUtils::hasText)
                .toList();
    }

    private void verifyApiKey(String apiKey) {
        if (!StringUtils.hasText(expectedApiKey)) {
            return;
        }
        if (!StringUtils.hasText(apiKey) || !expectedApiKey.equals(apiKey)) {
            throw new ResponseStatusException(UNAUTHORIZED, "Invalid API key");
        }
    }
}
