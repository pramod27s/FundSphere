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

    @GetMapping("/users/{id}/grant-profile")
    public ResponseEntity<AiUserProfileResponse> getUserProfile(@PathVariable Long id,
                                                                @RequestHeader(value = "X-API-KEY", required = false) String apiKey) {
        verifyApiKey(apiKey);
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

    @GetMapping("/grants/changed-ids")
    public ResponseEntity<List<Long>> getChangedGrantIds(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime since,
            @RequestHeader(value = "X-API-KEY", required = false) String apiKey) {
        verifyApiKey(apiKey);
        return ResponseEntity.ok(grantService.getChangedGrantIds(since));
    }

    @PostMapping("/rag/recommend")
    public ResponseEntity<Object> recommend(@RequestBody Map<String, Object> request,
                                            @RequestHeader(value = "X-API-KEY", required = false) String apiKey) {
        verifyApiKey(apiKey);
        return ResponseEntity.ok(aiServiceClient.recommend(request));
    }

    @PostMapping("/rag/index-grant")
    public ResponseEntity<Object> indexGrant(@RequestBody Map<String, Object> request,
                                             @RequestHeader(value = "X-API-KEY", required = false) String apiKey) {
        verifyApiKey(apiKey);
        return ResponseEntity.ok(aiServiceClient.indexGrant(request));
    }

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

