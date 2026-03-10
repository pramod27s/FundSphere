package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.GrantRequest;
import org.pramod.corebackend.dto.GrantResponse;
import org.pramod.corebackend.entity.Grant;
import org.pramod.corebackend.repository.GrantRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class GrantService {

    private final GrantRepository grantRepository;

    /**
     * SaveOrUpdate Logic (called by FastAPI):
     * Step 1: Check if a grant with the same grantUrl already exists.
     * Step 2: If it does not exist → Save it as a new record.
     * Step 3: If it exists → Compare checksum.
     *         - If checksum is the same → Do nothing (grant page has not changed).
     *         - If checksum is different → Update the grant record, checksum, and updatedAt.
     */
    @Transactional
    public GrantResponse saveOrUpdateGrant(GrantRequest request) {
        Optional<Grant> existingOpt = grantRepository.findByGrantUrl(request.getGrantUrl());

        if (existingOpt.isEmpty()) {
            // New grant — save it
            Grant grant = mapToEntity(request);
            Grant saved = grantRepository.save(grant);
            return mapToResponse(saved);
        }

        Grant existing = existingOpt.get();

        // Grant exists — compare checksum
        if (existing.getChecksum() != null && existing.getChecksum().equals(request.getChecksum())) {
            // Checksum is the same — no update needed
            return mapToResponse(existing);
        }

        // Checksum is different — update the grant
        updateEntity(existing, request);
        existing.setChecksum(request.getChecksum());
        existing.setLastScrapedAt(LocalDateTime.now());
        Grant updated = grantRepository.save(existing);
        return mapToResponse(updated);
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
        return mapToResponse(updated);
    }

    @Transactional
    public void deleteGrant(Long id) {
        if (!grantRepository.existsById(id)) {
            throw new RuntimeException("Grant not found with id: " + id);
        }
        grantRepository.deleteById(id);
    }

    public GrantResponse getGrantByUrl(String grantUrl) {
        Grant grant = grantRepository.findByGrantUrl(grantUrl)
                .orElseThrow(() -> new RuntimeException("Grant not found with URL: " + grantUrl));
        return mapToResponse(grant);
    }

    // --- Mapping helpers ---

    private Grant mapToEntity(GrantRequest request) {
        return Grant.builder()
                .grantTitle(request.getGrantTitle())
                .fundingAgency(request.getFundingAgency())
                .programName(request.getProgramName())
                .description(request.getDescription())
                .grantUrl(request.getGrantUrl())
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
                .build();
    }

    private void updateEntity(Grant entity, GrantRequest request) {
        entity.setGrantTitle(request.getGrantTitle());
        entity.setFundingAgency(request.getFundingAgency());
        entity.setProgramName(request.getProgramName());
        entity.setDescription(request.getDescription());
        entity.setGrantUrl(request.getGrantUrl());
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
                .createdAt(grant.getCreatedAt())
                .updatedAt(grant.getUpdatedAt())
                .lastScrapedAt(grant.getLastScrapedAt())
                .build();
    }
}

