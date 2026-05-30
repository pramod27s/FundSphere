/**
 * This file contains the ResearcherService class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.ResearcherRequest;
import org.pramod.corebackend.dto.ResearcherResponse;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.entity.Researcher;
import org.pramod.corebackend.enums.PrimaryField;
import org.pramod.corebackend.enums.UserType;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.repository.ResearcherRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ResearcherService {

    private final ResearcherRepository researcherRepository;
    private final AppUserRepository appUserRepository;

    @Transactional
    public ResearcherResponse createOrUpdateForUser(Long userId, ResearcherRequest request) {
        AppUser user = appUserRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        Researcher saved = researcherRepository.findByUserId(userId)
                .map(existing -> {
                    updateEntity(existing, request);
                    return researcherRepository.save(existing);
                })
                .orElseGet(() -> researcherRepository.save(mapToEntity(request, user)));

        return mapToResponse(saved);
    }

    public ResearcherResponse getResearcherByUserId(Long userId) {
        Researcher researcher = researcherRepository.findByUserId(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Researcher profile not found for user"));
        return mapToResponse(researcher);
    }

    public ResearcherResponse getResearcherById(Long id) {
        Researcher researcher = researcherRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Researcher not found with id: " + id));
        return mapToResponse(researcher);
    }

    public List<ResearcherResponse> getAllResearchers() {
        return researcherRepository.findAll()
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public ResearcherResponse updateResearcher(Long id, ResearcherRequest request) {
        Researcher existing = researcherRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Researcher not found with id: " + id));

        updateEntity(existing, request);
        Researcher updated = researcherRepository.save(existing);
        return mapToResponse(updated);
    }

    @Transactional
    public void deleteResearcher(Long id) {
        if (!researcherRepository.existsById(id)) {
            throw new RuntimeException("Researcher not found with id: " + id);
        }
        researcherRepository.deleteById(id);
    }

    public List<ResearcherResponse> getByUserType(UserType userType) {
        return researcherRepository.findByUserType(userType)
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    public List<ResearcherResponse> getByPrimaryField(PrimaryField primaryField) {
        return researcherRepository.findByPrimaryField(primaryField)
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    public List<ResearcherResponse> getByCountry(String country) {
        return researcherRepository.findByCountry(country)
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    public List<ResearcherResponse> getByInstitution(String institutionName) {
        return researcherRepository.findByInstitutionNameContainingIgnoreCase(institutionName)
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    // --- Mapping helpers ---

    private Researcher mapToEntity(ResearcherRequest request, AppUser user) {
        return Researcher.builder()
                .user(user)
                .userType(request.getUserType())
                .institutionName(request.getInstitutionName())
                .department(request.getDepartment())
                .position(request.getPosition())
                .institutionType(request.getInstitutionType())
                .primaryField(request.getPrimaryField())
                .additionalFields(request.getAdditionalFields())
                .keywords(request.getKeywords())
                .researchSummary(request.getResearchSummary())
                .orcidId(request.getOrcidId())
                .country(request.getCountry())
                .state(request.getState())
                .city(request.getCity())
                .citizenship(request.getCitizenship())
                .minFundingAmount(request.getMinFundingAmount())
                .maxFundingAmount(request.getMaxFundingAmount())
                .preferredGrantType(request.getPreferredGrantType())
                .yearsOfExperience(request.getYearsOfExperience())
                .educationLevel(request.getEducationLevel())
                .hasCompletedPhd(request.getHasCompletedPhd())
                .previousGrantsReceived(request.getPreviousGrantsReceived() != null ? request.getPreviousGrantsReceived() : false)
                .emailNotifications(request.getEmailNotifications() != null ? request.getEmailNotifications() : false)
                .deadlineReminders(request.getDeadlineReminders() != null ? request.getDeadlineReminders() : false)
                .weeklyGrantRecommendations(request.getWeeklyGrantRecommendations() != null ? request.getWeeklyGrantRecommendations() : false)
                .build();
    }

    private void updateEntity(Researcher entity, ResearcherRequest request) {
        entity.setUserType(request.getUserType());
        entity.setInstitutionName(request.getInstitutionName());
        entity.setDepartment(request.getDepartment());
        entity.setPosition(request.getPosition());
        entity.setInstitutionType(request.getInstitutionType());
        entity.setPrimaryField(request.getPrimaryField());
        entity.setAdditionalFields(request.getAdditionalFields());
        entity.setKeywords(request.getKeywords());
        entity.setResearchSummary(request.getResearchSummary());
        entity.setOrcidId(request.getOrcidId());
        entity.setCountry(request.getCountry());
        entity.setState(request.getState());
        entity.setCity(request.getCity());
        entity.setCitizenship(request.getCitizenship());
        entity.setMinFundingAmount(request.getMinFundingAmount());
        entity.setMaxFundingAmount(request.getMaxFundingAmount());
        entity.setPreferredGrantType(request.getPreferredGrantType());
        entity.setYearsOfExperience(request.getYearsOfExperience());
        entity.setEducationLevel(request.getEducationLevel());
        entity.setHasCompletedPhd(request.getHasCompletedPhd());
        if (request.getPreviousGrantsReceived() != null) {
            entity.setPreviousGrantsReceived(request.getPreviousGrantsReceived());
        }
        if (request.getEmailNotifications() != null) {
            entity.setEmailNotifications(request.getEmailNotifications());
        }
        if (request.getDeadlineReminders() != null) {
            entity.setDeadlineReminders(request.getDeadlineReminders());
        }
        if (request.getWeeklyGrantRecommendations() != null) {
            entity.setWeeklyGrantRecommendations(request.getWeeklyGrantRecommendations());
        }
    }

    private ResearcherResponse mapToResponse(Researcher entity) {
        return ResearcherResponse.builder()
                .id(entity.getId())
                .userType(entity.getUserType())
                .institutionName(entity.getInstitutionName())
                .department(entity.getDepartment())
                .position(entity.getPosition())
                .institutionType(entity.getInstitutionType())
                .primaryField(entity.getPrimaryField())
                .additionalFields(entity.getAdditionalFields())
                .keywords(entity.getKeywords())
                .researchSummary(entity.getResearchSummary())
                .orcidId(entity.getOrcidId())
                .country(entity.getCountry())
                .state(entity.getState())
                .city(entity.getCity())
                .citizenship(entity.getCitizenship())
                .minFundingAmount(entity.getMinFundingAmount())
                .maxFundingAmount(entity.getMaxFundingAmount())
                .preferredGrantType(entity.getPreferredGrantType())
                .yearsOfExperience(entity.getYearsOfExperience())
                .educationLevel(entity.getEducationLevel())
                .hasCompletedPhd(entity.getHasCompletedPhd())
                .previousGrantsReceived(entity.getPreviousGrantsReceived())
                .emailNotifications(entity.getEmailNotifications())
                .deadlineReminders(entity.getDeadlineReminders())
                .weeklyGrantRecommendations(entity.getWeeklyGrantRecommendations())
                .createdAt(entity.getCreatedAt())
                .updatedAt(entity.getUpdatedAt())
                .build();
    }
}


