/**
 * REST controller for progress-report drafts (Objective 4, 4.4).
 *
 * GET    /api/awards/{id}/reports             -> the grant's drafts, newest first (without content)
 * POST   /api/awards/{id}/reports             -> draft a report (from a deadline, or for a chosen period)
 * GET    /api/awards/{id}/reports/{draftId}   -> one draft with its sections and check results
 * PUT    /api/awards/{id}/reports/{draftId}   -> save the PI's edits; every sentence is checked again
 * DELETE /api/awards/{id}/reports/{draftId}   -> delete a draft
 * GET    /api/awards/{id}/reports/{draftId}/export.docx -> the draft as a Word document, marked "Draft"
 */
package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.award.DraftResponse;
import org.pramod.corebackend.dto.award.GenerateDraftRequest;
import org.pramod.corebackend.dto.award.UpdateDraftRequest;
import org.pramod.corebackend.security.UserPrincipal;
import org.pramod.corebackend.service.ProgressReportService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@RestController
@RequestMapping("/api/awards/{id}/reports")
@RequiredArgsConstructor
public class ProgressReportController {

    private static final MediaType DOCX =
            MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    private final ProgressReportService reportService;

    @GetMapping
    public ResponseEntity<List<DraftResponse>> list(@AuthenticationPrincipal UserPrincipal principal,
                                                    @PathVariable Long id) {
        return ResponseEntity.ok(reportService.list(requireUserId(principal), id));
    }

    @PostMapping
    public ResponseEntity<DraftResponse> generate(@AuthenticationPrincipal UserPrincipal principal,
                                                  @PathVariable Long id,
                                                  @RequestBody GenerateDraftRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(reportService.generate(requireUserId(principal), id, body));
    }

    @GetMapping("/{draftId}")
    public ResponseEntity<DraftResponse> get(@AuthenticationPrincipal UserPrincipal principal,
                                             @PathVariable Long id,
                                             @PathVariable Long draftId) {
        return ResponseEntity.ok(reportService.get(requireUserId(principal), id, draftId));
    }

    @PutMapping("/{draftId}")
    public ResponseEntity<DraftResponse> update(@AuthenticationPrincipal UserPrincipal principal,
                                                @PathVariable Long id,
                                                @PathVariable Long draftId,
                                                @RequestBody UpdateDraftRequest body) {
        return ResponseEntity.ok(reportService.update(requireUserId(principal), id, draftId, body));
    }

    @DeleteMapping("/{draftId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UserPrincipal principal,
                                       @PathVariable Long id,
                                       @PathVariable Long draftId) {
        reportService.delete(requireUserId(principal), id, draftId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{draftId}/export.docx")
    public ResponseEntity<byte[]> export(@AuthenticationPrincipal UserPrincipal principal,
                                         @PathVariable Long id,
                                         @PathVariable Long draftId) {
        ProgressReportService.Export export = reportService.export(requireUserId(principal), id, draftId);
        return ResponseEntity.ok()
                .contentType(DOCX)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        // The name is plain ASCII (see ProgressReportService.fileName); passing a charset would make
                        // Spring encode it as =?UTF-8?Q?…?=, which the page would save the file under.
                        ContentDisposition.attachment().filename(export.fileName()).build().toString())
                .body(export.content());
    }

    private static Long requireUserId(UserPrincipal principal) {
        if (principal == null || principal.getId() == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "Authentication required");
        }
        return principal.getId();
    }
}
