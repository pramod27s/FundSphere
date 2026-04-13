package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.ResearcherRequest;
import org.pramod.corebackend.dto.ResearcherResponse;
import org.pramod.corebackend.enums.PrimaryField;
import org.pramod.corebackend.enums.UserType;
import org.pramod.corebackend.security.UserPrincipal;
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

    // POST - Create or update the authenticated user's researcher profile
    @PostMapping
    public ResponseEntity<ResearcherResponse> createResearcher(@AuthenticationPrincipal UserPrincipal principal,
                                                               @RequestBody ResearcherRequest request) {
        ResearcherResponse response = researcherService.createOrUpdateForUser(principal.getId(), request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/me")
    public ResponseEntity<ResearcherResponse> getMyResearcher(@AuthenticationPrincipal UserPrincipal principal) {
        ResearcherResponse response = researcherService.getResearcherByUserId(principal.getId());
        return ResponseEntity.ok(response);
    }

    // GET - Get all researchers
    @GetMapping
    public ResponseEntity<List<ResearcherResponse>> getAllResearchers() {
        List<ResearcherResponse> researchers = researcherService.getAllResearchers();
        return ResponseEntity.ok(researchers);
    }

    // GET - Get researcher by ID
    @GetMapping("/{id}")
    public ResponseEntity<ResearcherResponse> getResearcherById(@PathVariable Long id) {
        ResearcherResponse response = researcherService.getResearcherById(id);
        return ResponseEntity.ok(response);
    }

    // PUT - Update researcher by ID
    @PutMapping("/{id}")
    public ResponseEntity<ResearcherResponse> updateResearcher(@PathVariable Long id,
                                                                @RequestBody ResearcherRequest request) {
        ResearcherResponse response = researcherService.updateResearcher(id, request);
        return ResponseEntity.ok(response);
    }

    // DELETE - Delete researcher by ID
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> deleteResearcher(@PathVariable Long id) {
        researcherService.deleteResearcher(id);
        return ResponseEntity.ok(Map.of("message", "Researcher deleted successfully", "id", id.toString()));
    }

    // GET - Filter by user type
    @GetMapping("/filter/user-type/{userType}")
    public ResponseEntity<List<ResearcherResponse>> getByUserType(@PathVariable UserType userType) {
        List<ResearcherResponse> researchers = researcherService.getByUserType(userType);
        return ResponseEntity.ok(researchers);
    }

    // GET - Filter by primary field
    @GetMapping("/filter/primary-field/{primaryField}")
    public ResponseEntity<List<ResearcherResponse>> getByPrimaryField(@PathVariable PrimaryField primaryField) {
        List<ResearcherResponse> researchers = researcherService.getByPrimaryField(primaryField);
        return ResponseEntity.ok(researchers);
    }

    // GET - Filter by country
    @GetMapping("/filter/country/{country}")
    public ResponseEntity<List<ResearcherResponse>> getByCountry(@PathVariable String country) {
        List<ResearcherResponse> researchers = researcherService.getByCountry(country);
        return ResponseEntity.ok(researchers);
    }

    // GET - Search by institution name
    @GetMapping("/search/institution")
    public ResponseEntity<List<ResearcherResponse>> getByInstitution(@RequestParam String name) {
        List<ResearcherResponse> researchers = researcherService.getByInstitution(name);
        return ResponseEntity.ok(researchers);
    }
}

