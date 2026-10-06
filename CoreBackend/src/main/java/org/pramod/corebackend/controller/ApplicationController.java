/**
 * REST controller for the Application Readiness Workspace (Objective 3).
 *
 * GET    /api/applications                               -> list the user's applications with readiness
 * POST   /api/applications                               -> start one (from a grant, or a call outside FundSphere)
 * GET    /api/applications/{id}                          -> application with checklist and status history
 * PATCH  /api/applications/{id}                          -> edit details, deadline or status
 * DELETE /api/applications/{id}                          -> delete it
 * POST   /api/applications/{id}/checklist/extract        -> AI checklist from a guidelines PDF or link
 * POST   /api/applications/{id}/checklist/items          -> add an item by hand
 * PATCH  /api/applications/{id}/checklist/items/{itemId} -> edit an item (owner, due date, status, ...)
 * DELETE /api/applications/{id}/checklist/items/{itemId} -> remove an item
 * GET    /api/applications/{id}/calendar.ics             -> deadline and due dates as a calendar file
 */
package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.application.ApplicationCreateRequest;
import org.pramod.corebackend.dto.application.ApplicationResponse;
import org.pramod.corebackend.dto.application.ApplicationUpdateRequest;
import org.pramod.corebackend.dto.application.ChecklistItemRequest;
import org.pramod.corebackend.security.UserPrincipal;
import org.pramod.corebackend.service.ApplicationService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONTENT_TOO_LARGE;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@RestController
@RequestMapping("/api/applications")
@RequiredArgsConstructor
public class ApplicationController {

    private static final long MAX_PDF_BYTES = 25L * 1024 * 1024; // 25 MB

    private final ApplicationService applicationService;

    @GetMapping
    public ResponseEntity<List<ApplicationResponse>> list(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(applicationService.list(requireUserId(principal)));
    }

    @PostMapping
    public ResponseEntity<ApplicationResponse> create(@AuthenticationPrincipal UserPrincipal principal,
                                                      @RequestBody ApplicationCreateRequest body) {
        ApplicationService.CreateResult result = applicationService.create(requireUserId(principal), body);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK).body(result.application());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApplicationResponse> get(@AuthenticationPrincipal UserPrincipal principal,
                                                   @PathVariable Long id) {
        return ResponseEntity.ok(applicationService.get(requireUserId(principal), id));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<ApplicationResponse> update(@AuthenticationPrincipal UserPrincipal principal,
                                                      @PathVariable Long id,
                                                      @RequestBody ApplicationUpdateRequest body) {
        return ResponseEntity.ok(applicationService.update(requireUserId(principal), id, body));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UserPrincipal principal,
                                       @PathVariable Long id) {
        applicationService.delete(requireUserId(principal), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/checklist/extract")
    public ResponseEntity<ApplicationResponse> extractChecklist(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @RequestParam(value = "guidelinesPdf", required = false) MultipartFile guidelinesPdf,
            @RequestParam(value = "url", required = false) String url) {
        Long userId = requireUserId(principal);
        if (guidelinesPdf != null && !guidelinesPdf.isEmpty()) {
            if (guidelinesPdf.getSize() > MAX_PDF_BYTES) {
                throw new ResponseStatusException(CONTENT_TOO_LARGE, "The guidelines PDF is larger than 25 MB");
            }
            if (!isPdf(guidelinesPdf)) {
                throw new ResponseStatusException(BAD_REQUEST, "The guidelines file must be a PDF (.pdf)");
            }
        }
        return ResponseEntity.ok(applicationService.extractChecklist(userId, id, guidelinesPdf, url));
    }

    @PostMapping("/{id}/checklist/items")
    public ResponseEntity<ApplicationResponse> addItem(@AuthenticationPrincipal UserPrincipal principal,
                                                       @PathVariable Long id,
                                                       @RequestBody ChecklistItemRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(applicationService.addItem(requireUserId(principal), id, body));
    }

    @PatchMapping("/{id}/checklist/items/{itemId}")
    public ResponseEntity<ApplicationResponse> updateItem(@AuthenticationPrincipal UserPrincipal principal,
                                                          @PathVariable Long id,
                                                          @PathVariable Long itemId,
                                                          @RequestBody ChecklistItemRequest body) {
        return ResponseEntity.ok(applicationService.updateItem(requireUserId(principal), id, itemId, body));
    }

    @DeleteMapping("/{id}/checklist/items/{itemId}")
    public ResponseEntity<ApplicationResponse> deleteItem(@AuthenticationPrincipal UserPrincipal principal,
                                                          @PathVariable Long id,
                                                          @PathVariable Long itemId) {
        return ResponseEntity.ok(applicationService.deleteItem(requireUserId(principal), id, itemId));
    }

    @GetMapping("/{id}/calendar.ics")
    public ResponseEntity<byte[]> calendar(@AuthenticationPrincipal UserPrincipal principal,
                                           @PathVariable Long id) {
        ApplicationService.CalendarFile file = applicationService.calendar(requireUserId(principal), id);
        return ResponseEntity.ok()
                .contentType(new MediaType("text", "calendar", StandardCharsets.UTF_8))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(file.filename()).build().toString())
                .body(file.content().getBytes(StandardCharsets.UTF_8));
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
