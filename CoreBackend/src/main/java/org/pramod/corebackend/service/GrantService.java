/**
 * This file contains the GrantService class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.service;

import org.pramod.corebackend.dto.GrantRequest;
import org.pramod.corebackend.dto.GrantResponse;
import org.pramod.corebackend.entity.Grant;
import org.pramod.corebackend.repository.GrantRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import org.springframework.web.client.RestTemplate;
import java.math.BigDecimal;
import java.util.concurrent.CompletableFuture;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class GrantService {

    private final GrantRepository grantRepository;
    private final GrantIndexingService grantIndexingService;

    public record SaveOrUpdateResult(GrantResponse response, boolean created) {}
    public record KeywordSearchHit(Long grantId, double keywordScore) {}
    private record DuplicateMatch(Grant grant, int confidence, boolean autoMerge) {}
    private record DuplicateMatchCandidate(Grant grant, DuplicateScore score) {}
    private record DuplicateScore(int score, double titleSimilarity, double agencySimilarity, boolean sameApplicationLink) {}

    public GrantService(GrantRepository grantRepository,
                        GrantIndexingService grantIndexingService) {
        this.grantRepository = grantRepository;
        this.grantIndexingService = grantIndexingService;
    }

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
        LocalDateTime now = LocalDateTime.now();

        if (existingOpt.isEmpty()) {
            // New grant — save it
            Optional<DuplicateMatch> duplicateOpt = findLikelyDuplicate(request);
            if (duplicateOpt.isPresent() && duplicateOpt.get().autoMerge()) {
                DuplicateMatch duplicate = duplicateOpt.get();
                Grant existing = duplicate.grant();
                String canonicalUrl = existing.getGrantUrl();
                updateEntity(existing, request);
                existing.setGrantUrl(canonicalUrl);
                existing.setChecksum(request.getChecksum());
                existing.setLastScrapedAt(now);
                existing.setLastVerifiedAt(now);
                existing.setPossibleDuplicateOfId(null);
                existing.setDuplicateConfidence(null);
                existing.setNeedsReindex(true);
                existing.setReindexAttempts(0);
                existing.setNextRetryAt(null);
                existing.setLastIndexError(null);
                Grant updated = grantRepository.save(existing);
                grantIndexingService.tryIndexAsync(updated.getId());
                return new SaveOrUpdateResult(mapToResponse(updated), false);
            }

            Grant grant = mapToEntity(request);
            duplicateOpt.ifPresent(duplicate -> {
                grant.setPossibleDuplicateOfId(duplicate.grant().getId());
                grant.setDuplicateConfidence(duplicate.confidence());
            });
            grant.setLastVerifiedAt(now);
            grant.setNeedsReindex(true);
            grant.setReindexAttempts(0);
            grant.setNextRetryAt(null);
            grant.setLastIndexError(null);
            Grant saved = grantRepository.save(grant);
            grantIndexingService.tryIndexAsync(saved.getId());
            return new SaveOrUpdateResult(mapToResponse(saved), true);
        }

        Grant existing = existingOpt.get();

        // Grant exists — compare checksum
        if (existing.getChecksum() != null && existing.getChecksum().equals(request.getChecksum())) {
            // Checksum is the same — content hasn't changed, but the scraper
            // *did* visit, so bump lastVerifiedAt for the freshness badge.
            // No reindex needed since content is unchanged.
            existing.setLastVerifiedAt(now);
            Grant verified = grantRepository.save(existing);
            return new SaveOrUpdateResult(mapToResponse(verified), false);
        }

        // Checksum is different — provider updated content, full update path
        updateEntity(existing, request);
        existing.setChecksum(request.getChecksum());
        existing.setLastScrapedAt(now);
        existing.setLastVerifiedAt(now);
        existing.setNeedsReindex(true);
        existing.setReindexAttempts(0);
        existing.setNextRetryAt(null);
        existing.setLastIndexError(null);
        Grant updated = grantRepository.save(existing);
        grantIndexingService.tryIndexAsync(updated.getId());
        return new SaveOrUpdateResult(mapToResponse(updated), false);
    }

    /**
     * Lightweight scraper hook: records that we visited this URL and the page
     * is still live + matches our last checksum. Bumps lastVerifiedAt only —
     * does NOT touch lastScrapedAt (which means "provider last changed
     * content"), does NOT trigger Pinecone reindex (data is unchanged).
     *
     * Returns true if the grant was found and updated, false if no grant
     * matches the URL (in which case the scheduler should fall through to
     * a full scrape).
     */
    @Transactional
    public boolean markVerifiedByUrl(String grantUrl) {
        String normalizedGrantUrl = normalizeGrantUrl(grantUrl);
        Optional<Grant> grantOpt = findExistingByGrantUrl(normalizedGrantUrl);
        if (grantOpt.isEmpty()) {
            return false;
        }
        Grant grant = grantOpt.get();
        grant.setLastVerifiedAt(LocalDateTime.now());
        grantRepository.save(grant);
        return true;
    }

    public List<String> getAllGrantUrls() {
        return grantRepository.findAll()
                .stream()
                .map(Grant::getGrantUrl)
                .filter(url -> url != null && !url.isBlank())
                .toList();
    }

    public List<GrantResponse> getAllGrants() {
        return grantRepository.findAll()
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    public Page<GrantResponse> getPagedGrants(Pageable pageable) {
        return grantRepository.findAll(pageable)
                .map(this::mapToResponse);
    }

    public GrantResponse getGrantById(Long id) {
        Grant grant = grantRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Grant not found with id: " + id));
        return mapToResponse(grant);
    }

    @Transactional
    public GrantResponse updateGrant(Long id, GrantRequest request) {
        Grant existing = grantRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Grant not found with id: " + id));

        updateEntity(existing, request);
        existing.setNeedsReindex(true);
        existing.setReindexAttempts(0);
        existing.setNextRetryAt(null);
        existing.setLastIndexError(null);
        Grant updated = grantRepository.save(existing);
        grantIndexingService.tryIndexAsync(updated.getId());
        return mapToResponse(updated);
    }

    @Transactional
    public void deleteGrant(Long id) {
        if (!grantRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Grant not found with id: " + id);
        }
        grantRepository.deleteById(id);
        triggerPineconeDeletion(id);
    }

    public GrantResponse getGrantByUrl(String grantUrl) {
        Grant grant = findExistingByGrantUrl(normalizeGrantUrl(grantUrl))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Grant not found with URL: " + grantUrl));
        return mapToResponse(grant);
    }

    private Optional<DuplicateMatch> findLikelyDuplicate(GrantRequest request) {
        Map<Long, Grant> candidates = new LinkedHashMap<>();

        String applicationLink = normalizeGrantUrl(request.getApplicationLink());
        if (hasText(applicationLink)) {
            grantRepository.findFirstByApplicationLinkIgnoreCase(applicationLink)
                    .ifPresent(grant -> candidates.put(grant.getId(), grant));
        }

        if (hasText(request.getFundingAgency())) {
            grantRepository.findTop100ByFundingAgencyContainingIgnoreCaseOrderByUpdatedAtDesc(request.getFundingAgency().trim())
                    .forEach(grant -> candidates.put(grant.getId(), grant));
        }

        String titleToken = strongestTitleToken(request.getGrantTitle());
        if (hasText(titleToken)) {
            grantRepository.findTop100ByGrantTitleContainingIgnoreCaseOrderByUpdatedAtDesc(titleToken)
                    .forEach(grant -> candidates.put(grant.getId(), grant));
        }

        return candidates.values().stream()
                .map(grant -> new DuplicateMatchCandidate(grant, scoreDuplicate(request, grant)))
                .filter(candidate -> candidate.score().score() >= 65)
                .max(Comparator.comparingInt(candidate -> candidate.score().score()))
                .map(candidate -> {
                    DuplicateScore score = candidate.score();
                    boolean autoMerge = score.score() >= 85
                            && (score.sameApplicationLink()
                            || (score.titleSimilarity() >= 0.75 && score.agencySimilarity() >= 0.70));
                    return new DuplicateMatch(candidate.grant(), score.score(), autoMerge);
                });
    }

    private DuplicateScore scoreDuplicate(GrantRequest request, Grant grant) {
        String requestTitle = normalizeText(request.getGrantTitle());
        String existingTitle = normalizeText(grant.getGrantTitle());
        String requestAgency = normalizeText(request.getFundingAgency());
        String existingAgency = normalizeText(grant.getFundingAgency());

        double titleSimilarity = tokenSimilarity(requestTitle, existingTitle);
        double agencySimilarity = tokenSimilarity(requestAgency, existingAgency);
        boolean sameApplicationLink = sameNormalizedUrl(request.getApplicationLink(), grant.getApplicationLink());

        int score = 0;
        if (sameApplicationLink) {
            score += 35;
        }
        score += Math.round((float) titleSimilarity * 40);
        score += Math.round((float) agencySimilarity * 25);
        if (sameDeadlineYear(request.getApplicationDeadline(), grant.getApplicationDeadline())) {
            score += 15;
        }
        if (sameNormalizedText(request.getGrantType(), grant.getGrantType())) {
            score += 10;
        }
        if (similarFundingRange(request, grant)) {
            score += 10;
        }

        return new DuplicateScore(Math.min(score, 100), titleSimilarity, agencySimilarity, sameApplicationLink);
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
                .openingDate(request.getOpeningDate())
                .loiDeadline(request.getLoiDeadline())
                .decisionDate(request.getDecisionDate())
                .projectStartDate(request.getProjectStartDate())
                .fundingAmountMin(request.getFundingAmountMin())
                .fundingAmountMax(request.getFundingAmountMax())
                .fundingCurrency(request.getFundingCurrency())
                .eligibleCountries(request.getEligibleCountries())
                .eligibleApplicants(request.getEligibleApplicants())
                .institutionType(request.getInstitutionType())
                .field(request.getField())
                .applicationLink(request.getApplicationLink())
                .checksum(request.getChecksum())
                .possibleDuplicateOfId(null)
                .duplicateConfidence(null)
                .tags(request.getTags())
                .objectives(request.getObjectives())
                .fundingScope(request.getFundingScope())
                .eligibilityCriteria(request.getEligibilityCriteria())
                .selectionCriteria(request.getSelectionCriteria())
                .grantDuration(request.getGrantDuration())
                .researchThemes(request.getResearchThemes())
                .requiresPhd(request.getRequiresPhd())
                .minExperienceYears(request.getMinExperienceYears())
                .citizenshipRequired(request.getCitizenshipRequired())
                .grantType(request.getGrantType())
                .targetCareerStages(request.getTargetCareerStages())
                .build();
    }

    private void updateEntity(Grant entity, GrantRequest request) {
        entity.setGrantTitle(request.getGrantTitle());
        entity.setFundingAgency(request.getFundingAgency());
        entity.setProgramName(request.getProgramName());
        entity.setDescription(request.getDescription());
        entity.setGrantUrl(normalizeGrantUrl(request.getGrantUrl()));
        entity.setApplicationDeadline(request.getApplicationDeadline());
        entity.setOpeningDate(request.getOpeningDate());
        entity.setLoiDeadline(request.getLoiDeadline());
        entity.setDecisionDate(request.getDecisionDate());
        entity.setProjectStartDate(request.getProjectStartDate());
        entity.setFundingAmountMin(request.getFundingAmountMin());
        entity.setFundingAmountMax(request.getFundingAmountMax());
        entity.setFundingCurrency(request.getFundingCurrency());
        entity.setEligibleCountries(request.getEligibleCountries());
        entity.setEligibleApplicants(request.getEligibleApplicants());
        entity.setInstitutionType(request.getInstitutionType());
        entity.setField(request.getField());
        entity.setApplicationLink(request.getApplicationLink());
        entity.setChecksum(request.getChecksum());
        entity.setPossibleDuplicateOfId(null);
        entity.setDuplicateConfidence(null);
        entity.setTags(request.getTags());
        entity.setObjectives(request.getObjectives());
        entity.setFundingScope(request.getFundingScope());
        entity.setEligibilityCriteria(request.getEligibilityCriteria());
        entity.setSelectionCriteria(request.getSelectionCriteria());
        entity.setGrantDuration(request.getGrantDuration());
        entity.setResearchThemes(request.getResearchThemes());
        entity.setRequiresPhd(request.getRequiresPhd());
        entity.setMinExperienceYears(request.getMinExperienceYears());
        entity.setCitizenshipRequired(request.getCitizenshipRequired());
        entity.setGrantType(request.getGrantType());
        entity.setTargetCareerStages(request.getTargetCareerStages());
        entity.setLastScrapedAt(LocalDateTime.now());
    }

    public GrantResponse mapToResponse(Grant grant) {
        return GrantResponse.builder()
                .id(grant.getId())
                .grantTitle(grant.getGrantTitle())
                .fundingAgency(grant.getFundingAgency())
                .programName(grant.getProgramName())
                .description(grant.getDescription())
                .grantUrl(grant.getGrantUrl())
                .applicationDeadline(grant.getApplicationDeadline())
                .openingDate(grant.getOpeningDate())
                .loiDeadline(grant.getLoiDeadline())
                .decisionDate(grant.getDecisionDate())
                .projectStartDate(grant.getProjectStartDate())
                .fundingAmountMin(grant.getFundingAmountMin())
                .fundingAmountMax(grant.getFundingAmountMax())
                .fundingCurrency(grant.getFundingCurrency())
                .eligibleCountries(grant.getEligibleCountries())
                .eligibleApplicants(grant.getEligibleApplicants())
                .institutionType(grant.getInstitutionType())
                .field(grant.getField())
                .applicationLink(grant.getApplicationLink())
                .checksum(grant.getChecksum())
                .possibleDuplicateOfId(grant.getPossibleDuplicateOfId())
                .duplicateConfidence(grant.getDuplicateConfidence())
                .tags(grant.getTags())
                .objectives(grant.getObjectives())
                .fundingScope(grant.getFundingScope())
                .eligibilityCriteria(grant.getEligibilityCriteria())
                .selectionCriteria(grant.getSelectionCriteria())
                .grantDuration(grant.getGrantDuration())
                .researchThemes(grant.getResearchThemes())
                .requiresPhd(grant.getRequiresPhd())
                .minExperienceYears(grant.getMinExperienceYears())
                .citizenshipRequired(grant.getCitizenshipRequired())
                .grantType(grant.getGrantType())
                .targetCareerStages(grant.getTargetCareerStages())
                .createdAt(grant.getCreatedAt())
                .updatedAt(grant.getUpdatedAt())
                .lastScrapedAt(grant.getLastScrapedAt())
                .lastVerifiedAt(grant.getLastVerifiedAt())
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

    private boolean sameNormalizedUrl(String left, String right) {
        String normalizedLeft = normalizeGrantUrl(left);
        String normalizedRight = normalizeGrantUrl(right);
        return hasText(normalizedLeft) && normalizedLeft.equalsIgnoreCase(normalizedRight);
    }

    private boolean sameNormalizedText(String left, String right) {
        String normalizedLeft = normalizeText(left);
        String normalizedRight = normalizeText(right);
        return hasText(normalizedLeft) && normalizedLeft.equals(normalizedRight);
    }

    private boolean sameDeadlineYear(LocalDateTime left, LocalDateTime right) {
        return left != null && right != null && left.getYear() == right.getYear();
    }

    private boolean similarFundingRange(GrantRequest request, Grant grant) {
        BigDecimal requestAmount = firstNonNull(request.getFundingAmountMax(), request.getFundingAmountMin());
        BigDecimal existingAmount = firstNonNull(grant.getFundingAmountMax(), grant.getFundingAmountMin());
        if (requestAmount == null || existingAmount == null) {
            return false;
        }
        if (!sameNormalizedText(request.getFundingCurrency(), grant.getFundingCurrency())) {
            return false;
        }
        BigDecimal larger = requestAmount.max(existingAmount);
        if (larger.compareTo(BigDecimal.ZERO) == 0) {
            return true;
        }
        BigDecimal difference = requestAmount.subtract(existingAmount).abs();
        return difference.divide(larger, 4, java.math.RoundingMode.HALF_UP)
                .compareTo(new BigDecimal("0.10")) <= 0;
    }

    private BigDecimal firstNonNull(BigDecimal first, BigDecimal second) {
        return first != null ? first : second;
    }

    private String strongestTitleToken(String title) {
        return tokenize(normalizeText(title)).stream()
                .filter(token -> token.length() >= 4)
                .filter(token -> !isStopword(token))
                .max(Comparator.comparingInt(String::length))
                .orElse(null);
    }

    private boolean isStopword(String token) {
        return Set.of("grant", "scheme", "program", "programme", "fellowship", "award", "funding", "call", "proposal")
                .contains(token);
    }

    private double tokenSimilarity(String left, String right) {
        Set<String> leftTokens = tokenize(left);
        Set<String> rightTokens = tokenize(right);
        if (leftTokens.isEmpty() || rightTokens.isEmpty()) {
            return 0.0;
        }
        long intersection = leftTokens.stream().filter(rightTokens::contains).count();
        Set<String> unionTokens = new java.util.HashSet<>(leftTokens);
        unionTokens.addAll(rightTokens);
        double jaccard = unionTokens.isEmpty() ? 0.0 : (double) intersection / unionTokens.size();

        if (left.contains(right) || right.contains(left)) {
            return Math.max(jaccard, 0.85);
        }
        return jaccard;
    }

    private String normalizeText(String value) {
        if (value == null) {
            return "";
        }
        return value.toLowerCase()
                .replace("&", " and ")
                .replaceAll("[^a-z0-9]+", " ")
                .trim()
                .replaceAll("\\s+", " ");
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
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
