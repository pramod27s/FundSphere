/**
 * This file contains the GrantController class.
 * This adds business logic, data transfer object, or configurations.
 */
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

    /**
     * Creates a new grant or updates an existing one based on checksum logic.
     * This endpoint is typically consumed by the Python scraper (FastAPI/Firecrawl).
     * @param request The grant data payload.
     * @return GrantResponse containing the saved entity and whether it was created or updated.
     */
    @PostMapping
    public ResponseEntity<GrantResponse> createGrant(@RequestBody GrantRequest request) {
        GrantService.SaveOrUpdateResult result = grantService.saveOrUpdateGrant(request);
        HttpStatus status = result.created() ? HttpStatus.CREATED : HttpStatus.OK;
        return new ResponseEntity<>(result.response(), status);
    }

    /**
     * Retrieves a list of all grants available in the system.
     * @return List of GrantResponse objects.
     */
    @GetMapping
    public ResponseEntity<List<GrantResponse>> getAllGrants() {
        List<GrantResponse> grants = grantService.getAllGrants();
        return ResponseEntity.ok(grants);
    }

    /**
     * Retrieves a specific grant by its unique ID.
     * @param id The primary key of the grant.
     * @return The requested GrantResponse.
     */
    @GetMapping("/{id}")
    public ResponseEntity<GrantResponse> getGrantById(@PathVariable Long id) {
        GrantResponse response = grantService.getGrantById(id);
        return ResponseEntity.ok(response);
    }

    /**
     * Updates an existing grant by its ID.
     * @param id The primary key of the target grant.
     * @param request The new data to update the grant with.
     * @return The updated GrantResponse.
     */
    @PutMapping("/{id}")
    public ResponseEntity<GrantResponse> updateGrant(@PathVariable Long id,
                                                     @RequestBody GrantRequest request) {
        GrantResponse response = grantService.updateGrant(id, request);
        return ResponseEntity.ok(response);
    }

    /**
     * Deletes a grant by its ID.
     * @param id The primary key of the grant to delete.
     * @return A success message alongside the deleted grant's ID.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> deleteGrant(@PathVariable Long id) {
        grantService.deleteGrant(id);
        return ResponseEntity.ok(Map.of("message", "Grant deleted successfully", "id", id.toString()));
    }

    /**
     * Searches for a specific grant using its source URL.
     * Useful for external services to verify if a grant has already been stored.
     * @param grantUrl The URL of the grant.
     * @return The matching GrantResponse.
     */
    @GetMapping("/search")
    public ResponseEntity<GrantResponse> getGrantByUrl(@RequestParam String grantUrl) {
        GrantResponse response = grantService.getGrantByUrl(grantUrl);
        return ResponseEntity.ok(response);
    }

    /**
     * Lightweight scraper hook: records that we visited this URL and confirmed
     * its content hasn't changed (checksum matches our stored copy). Bumps
     * lastVerifiedAt only — does NOT touch lastScrapedAt and does NOT trigger
     * a Pinecone reindex.
     *
     * Body: {"grantUrl": "https://..."}
     * Response: {"verified": true, "grantUrl": "...", "lastVerifiedAt": "..."}
     *           or 404 if no grant matches the URL (caller should fall through
     *           to a full scrape/POST).
     */
    @PostMapping("/verify")
    public ResponseEntity<Map<String, Object>> verifyGrant(@RequestBody Map<String, String> body) {
        String grantUrl = body == null ? null : body.get("grantUrl");
        if (grantUrl == null || grantUrl.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "verified", false,
                    "error", "grantUrl is required"
            ));
        }
        boolean ok = grantService.markVerifiedByUrl(grantUrl);
        if (!ok) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
                    "verified", false,
                    "grantUrl", grantUrl
            ));
        }
        GrantResponse refreshed = grantService.getGrantByUrl(grantUrl);
        return ResponseEntity.ok(Map.of(
                "verified", true,
                "grantUrl", grantUrl,
                "lastVerifiedAt", refreshed.getLastVerifiedAt()
        ));
    }
}
