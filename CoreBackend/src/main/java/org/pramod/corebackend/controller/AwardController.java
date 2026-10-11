/**
 * REST controller for My grants (Objective 4, Grant Compliance Desk).
 *
 * GET    /api/awards       -> the user's grants with their budget heads
 * POST   /api/awards       -> add one (from an awarded application, or a grant already held)
 * GET    /api/awards/{id}  -> one grant
 * PUT    /api/awards/{id}  -> replace its details and budget heads (the edit form sends everything)
 * DELETE /api/awards/{id}  -> delete it
 * POST   /api/awards/read-sanction-order -> AI reading of a sanction order PDF to fill the form (4.5); not stored
 *
 * Reporting deadlines (4.2); each returns the whole grant:
 * POST   /api/awards/{id}/events                -> add a deadline of your own
 * PATCH  /api/awards/{id}/events/{eventId}      -> mark submitted / not applicable, move or reset its date
 * DELETE /api/awards/{id}/events/{eventId}      -> remove a deadline you added
 * POST   /api/awards/{id}/events/submit-past    -> mark deadlines from before the grant was added as submitted
 */
package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.award.AwardRequest;
import org.pramod.corebackend.dto.award.AwardResponse;
import org.pramod.corebackend.dto.award.ComplianceEventRequest;
import org.pramod.corebackend.security.UserPrincipal;
import org.pramod.corebackend.service.AiServiceClient;
import org.pramod.corebackend.service.AwardService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONTENT_TOO_LARGE;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@RestController
@RequestMapping("/api/awards")
@RequiredArgsConstructor
public class AwardController {

    private static final long MAX_PDF_BYTES = 25L * 1024 * 1024; // 25 MB

    private final AwardService awardService;
    private final AiServiceClient aiServiceClient;

    @GetMapping
    public ResponseEntity<List<AwardResponse>> list(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(awardService.list(requireUserId(principal)));
    }

    @PostMapping
    public ResponseEntity<AwardResponse> create(@AuthenticationPrincipal UserPrincipal principal,
                                                @RequestBody AwardRequest body) {
        AwardService.CreateResult result = awardService.create(requireUserId(principal), body);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK).body(result.award());
    }

    @GetMapping("/{id}")
    public ResponseEntity<AwardResponse> get(@AuthenticationPrincipal UserPrincipal principal,
                                             @PathVariable Long id) {
        return ResponseEntity.ok(awardService.get(requireUserId(principal), id));
    }

    @PutMapping("/{id}")
    public ResponseEntity<AwardResponse> update(@AuthenticationPrincipal UserPrincipal principal,
                                                @PathVariable Long id,
                                                @RequestBody AwardRequest body) {
        return ResponseEntity.ok(awardService.update(requireUserId(principal), id, body));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UserPrincipal principal,
                                       @PathVariable Long id) {
        awardService.delete(requireUserId(principal), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/events")
    public ResponseEntity<AwardResponse> addEvent(@AuthenticationPrincipal UserPrincipal principal,
                                                  @PathVariable Long id,
                                                  @RequestBody ComplianceEventRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(awardService.addEvent(requireUserId(principal), id, body));
    }

    @PatchMapping("/{id}/events/{eventId}")
    public ResponseEntity<AwardResponse> updateEvent(@AuthenticationPrincipal UserPrincipal principal,
                                                     @PathVariable Long id,
                                                     @PathVariable Long eventId,
                                                     @RequestBody ComplianceEventRequest body) {
        return ResponseEntity.ok(awardService.updateEvent(requireUserId(principal), id, eventId, body));
    }

    @DeleteMapping("/{id}/events/{eventId}")
    public ResponseEntity<AwardResponse> deleteEvent(@AuthenticationPrincipal UserPrincipal principal,
                                                     @PathVariable Long id,
                                                     @PathVariable Long eventId) {
        return ResponseEntity.ok(awardService.deleteEvent(requireUserId(principal), id, eventId));
    }

    @PostMapping("/{id}/events/submit-past")
    public ResponseEntity<AwardResponse> submitPastEvents(@AuthenticationPrincipal UserPrincipal principal,
                                                          @PathVariable Long id) {
        return ResponseEntity.ok(awardService.submitPastEvents(requireUserId(principal), id));
    }

    @PostMapping("/read-sanction-order")
    public ResponseEntity<Map<String, Object>> readSanctionOrder(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam(value = "sanctionOrderPdf", required = false) MultipartFile sanctionOrderPdf) {
        requireUserId(principal);
        if (sanctionOrderPdf == null || sanctionOrderPdf.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "Upload the sanction order as a PDF");
        }
        if (sanctionOrderPdf.getSize() > MAX_PDF_BYTES) {
            throw new ResponseStatusException(CONTENT_TOO_LARGE, "The sanction order PDF is larger than 25 MB");
        }
        if (!isPdf(sanctionOrderPdf)) {
            throw new ResponseStatusException(BAD_REQUEST, "The sanction order must be a PDF (.pdf)");
        }
        return ResponseEntity.ok(aiServiceClient.readSanctionOrder(sanctionOrderPdf));
    }

    private static boolean isPdf(MultipartFile file) {
        String name = file.getOriginalFilename();
        if (name != null && name.toLowerCase().endsWith(".pdf")) {
            return true;
        }
        String type = file.getContentType();
        return type != null && type.toLowerCase().contains("pdf");
    }

    private static Long requireUserId(UserPrincipal principal) {
        if (principal == null || principal.getId() == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "Authentication required");
        }
        return principal.getId();
    }
}
