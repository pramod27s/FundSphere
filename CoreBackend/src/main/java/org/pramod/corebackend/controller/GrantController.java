package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.GrantRequest;
import org.pramod.corebackend.dto.GrantResponse;
import org.pramod.corebackend.service.GrantService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/grants")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class GrantController {

    private final GrantService grantService;

    // POST - Store scraped grant data (used by FastAPI)
    // Uses saveOrUpdateGrant with checksum logic
    @PostMapping
    public ResponseEntity<GrantResponse> createGrant(@RequestBody GrantRequest request) {
        GrantResponse response = grantService.saveOrUpdateGrant(request);
        return new ResponseEntity<>(response, HttpStatus.CREATED);
    }

    // GET - Return all stored grants
    @GetMapping
    public ResponseEntity<List<GrantResponse>> getAllGrants() {
        List<GrantResponse> grants = grantService.getAllGrants();
        return ResponseEntity.ok(grants);
    }

    // GET - Return a specific grant by ID
    @GetMapping("/{id}")
    public ResponseEntity<GrantResponse> getGrantById(@PathVariable Long id) {
        GrantResponse response = grantService.getGrantById(id);
        return ResponseEntity.ok(response);
    }

    // PUT - Update a grant by ID
    @PutMapping("/{id}")
    public ResponseEntity<GrantResponse> updateGrant(@PathVariable Long id,
                                                     @RequestBody GrantRequest request) {
        GrantResponse response = grantService.updateGrant(id, request);
        return ResponseEntity.ok(response);
    }

    // DELETE - Delete a grant by ID
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> deleteGrant(@PathVariable Long id) {
        grantService.deleteGrant(id);
        return ResponseEntity.ok(Map.of("message", "Grant deleted successfully", "id", id.toString()));
    }

    // GET - Find grant by URL (useful for FastAPI to check existence)
    @GetMapping("/search")
    public ResponseEntity<GrantResponse> getGrantByUrl(@RequestParam String grantUrl) {
        GrantResponse response = grantService.getGrantByUrl(grantUrl);
        return ResponseEntity.ok(response);
    }
}

