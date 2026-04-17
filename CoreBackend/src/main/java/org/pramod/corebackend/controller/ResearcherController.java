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
import org.pramod.corebackend.service.ResearcherService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/researchers")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class ResearcherController {

    private final ResearcherService researcherService;
    private final AiServiceClient aiServiceClient;

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
     * Communicates with the Python AI Service.
     * @param principal The security principal of the logged-in user.
     * @return AI recommendations specific to the researcher.
     */
    @GetMapping("/me/matches")
    public ResponseEntity<Object> getMyMatches(@AuthenticationPrincipal UserPrincipal principal) {
        // Send the userId to the AI service's RAG recommendation engine
        Map<String, Object> requestToAi = Map.of(
                "userId", principal.getId(),
                "topK", 10 // Requesting top 10 best matches
        );
        return ResponseEntity.ok(aiServiceClient.recommend(requestToAi));
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
