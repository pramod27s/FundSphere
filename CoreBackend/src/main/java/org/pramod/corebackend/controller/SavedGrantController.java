/**
 * REST controller for the authenticated user's grant bookmarks.
 *
 * GET    /api/saved-grants            -> list current user's saved grants (rich, with status + notes)
 * POST   /api/saved-grants/{grantId}  -> bookmark a grant (idempotent; returns rich row)
 * PATCH  /api/saved-grants/{grantId}  -> update status and/or notes on an existing bookmark
 * DELETE /api/saved-grants/{grantId}  -> remove a bookmark
 * GET    /api/saved-grants/ids        -> lightweight list of saved grant IDs (for the discovery page)
 */
package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.SavedGrantResponse;
import org.pramod.corebackend.dto.SavedGrantUpdateRequest;
import org.pramod.corebackend.security.UserPrincipal;
import org.pramod.corebackend.service.SavedGrantService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@RestController
@RequestMapping("/api/saved-grants")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class SavedGrantController {

    private final SavedGrantService savedGrantService;

    @GetMapping
    public ResponseEntity<List<SavedGrantResponse>> list(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(savedGrantService.listSaved(requireUserId(principal)));
    }

    @GetMapping("/ids")
    public ResponseEntity<List<Long>> listIds(@AuthenticationPrincipal UserPrincipal principal) {
        List<Long> ids = savedGrantService.listSaved(requireUserId(principal)).stream()
                .map(sg -> sg.getGrant().getId())
                .toList();
        return ResponseEntity.ok(ids);
    }

    @PostMapping("/{grantId}")
    public ResponseEntity<SavedGrantResponse> save(@AuthenticationPrincipal UserPrincipal principal,
                                                   @PathVariable Long grantId) {
        return ResponseEntity.ok(savedGrantService.save(requireUserId(principal), grantId));
    }

    @PatchMapping("/{grantId}")
    public ResponseEntity<SavedGrantResponse> update(@AuthenticationPrincipal UserPrincipal principal,
                                                     @PathVariable Long grantId,
                                                     @RequestBody SavedGrantUpdateRequest body) {
        return ResponseEntity.ok(savedGrantService.update(requireUserId(principal), grantId, body));
    }

    @DeleteMapping("/{grantId}")
    public ResponseEntity<Void> unsave(@AuthenticationPrincipal UserPrincipal principal,
                                       @PathVariable Long grantId) {
        savedGrantService.unsave(requireUserId(principal), grantId);
        return ResponseEntity.noContent().build();
    }

    private static Long requireUserId(UserPrincipal principal) {
        if (principal == null || principal.getId() == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "Authentication required");
        }
        return principal.getId();
    }
}
