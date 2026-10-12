/**
 * REST controller for what a grant produced (Objective 4, 4.4), the material
 * its progress reports are drafted from. Every change returns the grant's
 * whole output list, newest first.
 *
 * GET    /api/awards/{id}/outputs              -> the outputs
 * POST   /api/awards/{id}/outputs              -> add one through the quick-add form
 * PUT    /api/awards/{id}/outputs/{outputId}   -> replace one
 * DELETE /api/awards/{id}/outputs/{outputId}   -> remove one
 * GET    /api/awards/{id}/outputs/orcid        -> the works on the PI's ORCID record (?orcidId= overrides the profile's)
 * POST   /api/awards/{id}/outputs/orcid        -> add the works the PI ticked
 */
package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.award.AwardOutputRequest;
import org.pramod.corebackend.dto.award.AwardOutputResponse;
import org.pramod.corebackend.dto.award.OrcidImportRequest;
import org.pramod.corebackend.dto.award.OrcidWorksResponse;
import org.pramod.corebackend.security.UserPrincipal;
import org.pramod.corebackend.service.AwardOutputService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@RestController
@RequestMapping("/api/awards/{id}/outputs")
@RequiredArgsConstructor
public class AwardOutputController {

    private final AwardOutputService outputService;

    @GetMapping
    public ResponseEntity<List<AwardOutputResponse>> list(@AuthenticationPrincipal UserPrincipal principal,
                                                          @PathVariable Long id) {
        return ResponseEntity.ok(outputService.list(requireUserId(principal), id));
    }

    @PostMapping
    public ResponseEntity<List<AwardOutputResponse>> add(@AuthenticationPrincipal UserPrincipal principal,
                                                         @PathVariable Long id,
                                                         @RequestBody AwardOutputRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(outputService.add(requireUserId(principal), id, body));
    }

    @PutMapping("/{outputId}")
    public ResponseEntity<List<AwardOutputResponse>> update(@AuthenticationPrincipal UserPrincipal principal,
                                                            @PathVariable Long id,
                                                            @PathVariable Long outputId,
                                                            @RequestBody AwardOutputRequest body) {
        return ResponseEntity.ok(outputService.update(requireUserId(principal), id, outputId, body));
    }

    @DeleteMapping("/{outputId}")
    public ResponseEntity<List<AwardOutputResponse>> delete(@AuthenticationPrincipal UserPrincipal principal,
                                                            @PathVariable Long id,
                                                            @PathVariable Long outputId) {
        return ResponseEntity.ok(outputService.delete(requireUserId(principal), id, outputId));
    }

    @GetMapping("/orcid")
    public ResponseEntity<OrcidWorksResponse> orcidWorks(@AuthenticationPrincipal UserPrincipal principal,
                                                         @PathVariable Long id,
                                                         @RequestParam(value = "orcidId", required = false) String orcidId) {
        return ResponseEntity.ok(outputService.orcidWorks(requireUserId(principal), id, orcidId));
    }

    @PostMapping("/orcid")
    public ResponseEntity<List<AwardOutputResponse>> importOrcid(@AuthenticationPrincipal UserPrincipal principal,
                                                                 @PathVariable Long id,
                                                                 @RequestBody OrcidImportRequest body) {
        return ResponseEntity.ok(outputService.importOrcid(requireUserId(principal), id, body));
    }

    private static Long requireUserId(UserPrincipal principal) {
        if (principal == null || principal.getId() == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "Authentication required");
        }
        return principal.getId();
    }
}
