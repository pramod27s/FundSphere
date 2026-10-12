/**
 * REST controller for a grant's spend check (Objective 4, 4.3).
 *
 * GET /api/awards/{id}/spending          -> the check for the year today falls in (?fy=2026 for FY 2026-27)
 * PUT /api/awards/{id}/spending/{fy}     -> replace that year's figures from the statement; returns its check
 */
package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.award.SpendRequest;
import org.pramod.corebackend.dto.award.SpendResponse;
import org.pramod.corebackend.security.UserPrincipal;
import org.pramod.corebackend.service.SpendService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@RestController
@RequestMapping("/api/awards/{id}/spending")
@RequiredArgsConstructor
public class SpendController {

    private final SpendService spendService;

    @GetMapping
    public ResponseEntity<SpendResponse> get(@AuthenticationPrincipal UserPrincipal principal,
                                             @PathVariable Long id,
                                             @RequestParam(value = "fy", required = false) Integer fy) {
        return ResponseEntity.ok(spendService.get(requireUserId(principal), id, fy));
    }

    @PutMapping("/{fy}")
    public ResponseEntity<SpendResponse> update(@AuthenticationPrincipal UserPrincipal principal,
                                                @PathVariable Long id,
                                                @PathVariable int fy,
                                                @RequestBody SpendRequest body) {
        return ResponseEntity.ok(spendService.update(requireUserId(principal), id, fy, body));
    }

    private static Long requireUserId(UserPrincipal principal) {
        if (principal == null || principal.getId() == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "Authentication required");
        }
        return principal.getId();
    }
}
