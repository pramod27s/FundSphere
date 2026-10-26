/**
 * Adding a grant by hand (2nd.md, Part B), for calls the scraper can't reach.
 * Every route needs the ADMIN role (SecurityConfig).
 *
 * POST /api/admin/grants/read        -> read a call's PDF, link or text into the form; nothing is stored
 * GET  /api/admin/grants/duplicates  -> grants that may already be this call
 * POST /api/admin/grants             -> save the checked grant (MANUAL) and index it for AI Match
 */
package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.GrantRequest;
import org.pramod.corebackend.dto.GrantResponse;
import org.pramod.corebackend.security.UserPrincipal;
import org.pramod.corebackend.service.AiServiceClient;
import org.pramod.corebackend.service.GrantService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/grants")
@RequiredArgsConstructor
public class AdminGrantController {

    private static final long MAX_PDF_BYTES = 25L * 1024 * 1024;
    private static final int MAX_TEXT_CHARS = 200_000;

    private final AiServiceClient aiServiceClient;
    private final GrantService grantService;

    @PostMapping("/read")
    public ResponseEntity<Map<String, Object>> readCall(
            @RequestParam(value = "callPdf", required = false) MultipartFile callPdf,
            @RequestParam(value = "url", required = false) String url,
            @RequestParam(value = "text", required = false) String text) {
        boolean hasPdf = callPdf != null && !callPdf.isEmpty();
        boolean hasUrl = StringUtils.hasText(url);
        boolean hasText = StringUtils.hasText(text);
        if ((hasPdf ? 1 : 0) + (hasUrl ? 1 : 0) + (hasText ? 1 : 0) != 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Upload the call's PDF, paste its link or paste its text (one of the three)");
        }
        if (hasPdf) {
            if (callPdf.getSize() > MAX_PDF_BYTES) {
                throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, "The PDF is larger than 25 MB");
            }
            if (!isPdf(callPdf)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The call must be a PDF (.pdf)");
            }
        }
        if (hasText && text.length() > MAX_TEXT_CHARS) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE,
                    "The pasted text is too long. Paste the part that describes the call.");
        }
        return ResponseEntity.ok(aiServiceClient.readCall(hasPdf ? callPdf : null, hasUrl ? url.trim() : "",
                hasText ? text : ""));
    }

    @GetMapping("/duplicates")
    public ResponseEntity<List<GrantService.PossibleDuplicate>> findDuplicates(
            @RequestParam(value = "grantUrl", required = false) String grantUrl,
            @RequestParam(value = "grantTitle", required = false) String grantTitle,
            @RequestParam(value = "fundingAgency", required = false) String fundingAgency,
            @RequestParam(value = "applicationLink", required = false) String applicationLink) {
        GrantRequest probe = GrantRequest.builder()
                .grantUrl(grantUrl)
                .grantTitle(grantTitle)
                .fundingAgency(fundingAgency)
                .applicationLink(applicationLink)
                .build();
        return ResponseEntity.ok(grantService.findPossibleDuplicates(probe));
    }

    @PostMapping
    public ResponseEntity<GrantResponse> createGrant(@AuthenticationPrincipal UserPrincipal principal,
                                                     @RequestBody GrantRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(grantService.createManualGrant(request, principal.getId(), principal.getFullName()));
    }

    private static boolean isPdf(MultipartFile file) {
        String name = file.getOriginalFilename();
        String type = file.getContentType();
        return (name != null && name.toLowerCase(Locale.ROOT).endsWith(".pdf"))
                || "application/pdf".equalsIgnoreCase(type);
    }
}
