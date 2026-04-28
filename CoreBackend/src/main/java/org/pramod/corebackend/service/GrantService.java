/**
 * This file contains the GrantService class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.GrantRequest;
import org.pramod.corebackend.dto.GrantResponse;
import org.pramod.corebackend.entity.Grant;
import org.pramod.corebackend.repository.GrantRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.web.client.RestTemplate;
import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.CompletableFuture;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class GrantService {

    private final GrantRepository grantRepository;

    public record SaveOrUpdateResult(GrantResponse response, boolean created) {}
    public record KeywordSearchHit(Long grantId, double keywordScore) {}

    /**
     * SaveOrUpdate Logic (called by FastAPI):
     * Step 1: Check if a grant with the same grantUrl already exists.
     * Step 2: If it does not exist → Save it as a new record.
     * Step 3: If it exists → Compare checksum.
     *         - If checksum is the same → Do nothing (grant page has not changed).
     *         - If checksum is different → Update the grant record, checksum, and updatedAt.
     */
    @Transactional
    public SaveOrUpdateResult saveOrUpdateGrant(GrantRequest request) {
        String normalizedGrantUrl = normalizeGrantUrl(request.getGrantUrl());
        Optional<Grant> existingOpt = findExistingByGrantUrl(normalizedGrantUrl);

        if (existingOpt.isEmpty()) {
            // New grant — save it
            Grant grant = mapToEntity(request);
            Grant saved = grantRepository.save(grant);
            triggerPineconeIndexing(saved.getId());
            return new SaveOrUpdateResult(mapToResponse(saved), true);
        }

        Grant existing = existingOpt.get();

        // Grant exists — compare checksum
        if (existing.getChecksum() != null && existing.getChecksum().equals(request.getChecksum())) {
            // Checksum is the same — no update needed
            return new SaveOrUpdateResult(mapToResponse(existing), false);
        }

        // Checksum is different — update the grant
        updateEntity(existing, request);
        existing.setChecksum(request.getChecksum());
        existing.setLastScrapedAt(LocalDateTime.now());
        Grant updated = grantRepository.save(existing);
        triggerPineconeIndexing(updated.getId());
        return new SaveOrUpdateResult(mapToResponse(updated), false);
    }

    public List<GrantResponse> getAllGrants() {
        return grantRepository.findAll()
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    public GrantResponse getGrantById(Long id) {
        Grant grant = grantRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Grant not found with id: " + id));
        return mapToResponse(grant);
    }

    @Transactional
    public GrantResponse updateGrant(Long id, GrantRequest request) {
        Grant existing = grantRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Grant not found with id: " + id));

        updateEntity(existing, request);
        Grant updated = grantRepository.save(existing);
        triggerPineconeIndexing(updated.getId());
        return mapToResponse(updated);
    }

    @Transactional
    public void deleteGrant(Long id) {
        if (!grantRepository.existsById(id)) {
            throw new RuntimeException("Grant not found with id: " + id);
        }
        grantRepository.deleteById(id);
        triggerPineconeDeletion(id);
    }

    public GrantResponse getGrantByUrl(String grantUrl) {
        Grant grant = findExistingByGrantUrl(normalizeGrantUrl(grantUrl))
                .orElseThrow(() -> new RuntimeException("Grant not found with URL: " + grantUrl));
        return mapToResponse(grant);
    }

    public List<Long> getChangedGrantIds(LocalDateTime since) {
        return grantRepository.findAll().stream()
                .filter(grant -> isAfterOrEqual(grant.getUpdatedAt(), since)
                        || isAfterOrEqual(grant.getLastScrapedAt(), since)
                        || isAfterOrEqual(grant.getCreatedAt(), since))
                .map(Grant::getId)
                .toList();
    }

    public List<KeywordSearchHit> keywordSearch(String query,
                                                String country,
                                                String institutionType,
                                                String applicantType,
                                                int topK) {
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase();
        Set<String> queryTokens = tokenize(normalizedQuery);

        return grantRepository.findAll().stream()
                .filter(grant -> matchesFilters(grant, country, institutionType, applicantType))
                .map(grant -> new KeywordSearchHit(grant.getId(), keywordScore(grant, normalizedQuery, queryTokens)))
                .filter(hit -> hit.keywordScore() > 0)
                .sorted((a, b) -> Double.compare(b.keywordScore(), a.keywordScore()))
                .limit(Math.max(topK, 1))
                .toList();
    }

    private void triggerPineconeIndexing(Long grantId) {
        CompletableFuture.runAsync(() -> {
            try {
                RestTemplate restTemplate = new RestTemplate();
                Map<String, Long> request = new HashMap<>();
                request.put("grantId", grantId);
                restTemplate.postForObject("http://localhost:8000/rag/index-grant", request, String.class);
            } catch (Exception e) {
                System.err.println("Failed to index grant in Pinecone for grantId: " + grantId + " - " + e.getMessage());
            }
        });
    }

    private void triggerPineconeDeletion(Long grantId) {
        CompletableFuture.runAsync(() -> {
            try {
                RestTemplate restTemplate = new RestTemplate();
                restTemplate.delete("http://localhost:8000/rag/grant/" + grantId);
            } catch (Exception e) {
                System.err.println("Failed to delete grant from Pinecone for grantId: " + grantId + " - " + e.getMessage());
            }
        });
    }

    // --- Mapping helpers ---

    private Grant mapToEntity(GrantRequest request) {
        return Grant.builder()
                .grantTitle(request.getGrantTitle())
                .fundingAgency(request.getFundingAgency())
                .programName(request.getProgramName())
                .description(request.getDescription())
                .grantUrl(normalizeGrantUrl(request.getGrantUrl()))
                .applicationDeadline(request.getApplicationDeadline())
                .fundingAmountMin(request.getFundingAmountMin())
                .fundingAmountMax(request.getFundingAmountMax())
                .fundingCurrency(request.getFundingCurrency())
                .eligibleCountries(request.getEligibleCountries())
                .eligibleApplicants(request.getEligibleApplicants())
                .institutionType(request.getInstitutionType())
                .field(request.getField())
                .applicationLink(request.getApplicationLink())
                .checksum(request.getChecksum())
                .tags(request.getTags())
                .objectives(request.getObjectives())
                .fundingScope(request.getFundingScope())
                .eligibilityCriteria(request.getEligibilityCriteria())
                .selectionCriteria(request.getSelectionCriteria())
                .grantDuration(request.getGrantDuration())
                .researchThemes(request.getResearchThemes())
                .build();
    }

    private void updateEntity(Grant entity, GrantRequest request) {
        entity.setGrantTitle(request.getGrantTitle());
        entity.setFundingAgency(request.getFundingAgency());
        entity.setProgramName(request.getProgramName());
        entity.setDescription(request.getDescription());
        entity.setGrantUrl(normalizeGrantUrl(request.getGrantUrl()));
        entity.setApplicationDeadline(request.getApplicationDeadline());
        entity.setFundingAmountMin(request.getFundingAmountMin());
        entity.setFundingAmountMax(request.getFundingAmountMax());
        entity.setFundingCurrency(request.getFundingCurrency());
        entity.setEligibleCountries(request.getEligibleCountries());
        entity.setEligibleApplicants(request.getEligibleApplicants());
        entity.setInstitutionType(request.getInstitutionType());
        entity.setField(request.getField());
        entity.setApplicationLink(request.getApplicationLink());
        entity.setChecksum(request.getChecksum());
        entity.setTags(request.getTags());
        entity.setObjectives(request.getObjectives());
        entity.setFundingScope(request.getFundingScope());
        entity.setEligibilityCriteria(request.getEligibilityCriteria());
        entity.setSelectionCriteria(request.getSelectionCriteria());
        entity.setGrantDuration(request.getGrantDuration());
        entity.setResearchThemes(request.getResearchThemes());
        entity.setLastScrapedAt(LocalDateTime.now());
    }

    private GrantResponse mapToResponse(Grant grant) {
        return GrantResponse.builder()
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
                .eligibleCountries(grant.getEligibleCountries())
                .eligibleApplicants(grant.getEligibleApplicants())
                .institutionType(grant.getInstitutionType())
                .field(grant.getField())
                .applicationLink(grant.getApplicationLink())
                .checksum(grant.getChecksum())
                .tags(grant.getTags())
                .objectives(grant.getObjectives())
                .fundingScope(grant.getFundingScope())
                .eligibilityCriteria(grant.getEligibilityCriteria())
                .selectionCriteria(grant.getSelectionCriteria())
                .grantDuration(grant.getGrantDuration())
                .researchThemes(grant.getResearchThemes())
                .createdAt(grant.getCreatedAt())
                .updatedAt(grant.getUpdatedAt())
                .lastScrapedAt(grant.getLastScrapedAt())
                .build();
    }

    private String normalizeGrantUrl(String grantUrl) {
        if (grantUrl == null) {
            return null;
        }

        String normalized = grantUrl.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private Optional<Grant> findExistingByGrantUrl(String normalizedGrantUrl) {
        Optional<Grant> exactMatch = grantRepository.findByGrantUrl(normalizedGrantUrl);
        if (exactMatch.isPresent()) {
            return exactMatch;
        }

        // Fallback for rows inserted before URL normalization existed.
        return grantRepository.findAll().stream()
                .filter(grant -> normalizedGrantUrl != null
                        && normalizedGrantUrl.equals(normalizeGrantUrl(grant.getGrantUrl())))
                .findFirst();
    }

    private boolean isAfterOrEqual(LocalDateTime value, LocalDateTime threshold) {
        if (value == null || threshold == null) {
            return false;
        }
        return !value.isBefore(threshold);
    }

    private Set<String> tokenize(String text) {
        if (text == null || text.isBlank()) {
            return Set.of();
        }
        return Arrays.stream(text.split("[^a-z0-9]+"))
                .map(String::trim)
                .filter(token -> token.length() > 1)
                .collect(Collectors.toSet());
    }

    private boolean matchesFilters(Grant grant, String country, String institutionType, String applicantType) {
        return matchesGrantListField(grant.getEligibleCountries(), country)
                && matchesGrantListField(grant.getInstitutionType(), institutionType)
                && matchesGrantListField(grant.getEligibleApplicants(), applicantType);
    }

    private boolean matchesGrantListField(String rawField, String requestedValue) {
        if (requestedValue == null || requestedValue.isBlank()) {
            return true;
        }

        String expected = requestedValue.trim().toLowerCase();
        if (rawField == null || rawField.isBlank()) {
            return false;
        }

        return Arrays.stream(rawField.split("[,;/|]"))
                .map(String::trim)
                .map(String::toLowerCase)
                .anyMatch(value -> value.equals("global") || value.equals("any") || value.equals(expected));
    }

    private double keywordScore(Grant grant, String normalizedQuery, Set<String> queryTokens) {
        String corpus = String.join(" ",
                safe(grant.getGrantTitle()),
                safe(grant.getFundingAgency()),
                safe(grant.getProgramName()),
                safe(grant.getDescription()),
                safe(grant.getField()),
                safe(grant.getEligibleApplicants()),
                String.join(" ", grant.getTags() == null ? List.of() : grant.getTags())
        ).toLowerCase();

        if (queryTokens.isEmpty()) {
            return 0.1;
        }

        long tokenMatches = queryTokens.stream().filter(corpus::contains).count();
        double score = (double) tokenMatches / (double) queryTokens.size();

        if (!normalizedQuery.isBlank() && safe(grant.getGrantTitle()).toLowerCase().contains(normalizedQuery)) {
            score += 0.2;
        }

        return Math.min(score, 1.0);
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }
}


