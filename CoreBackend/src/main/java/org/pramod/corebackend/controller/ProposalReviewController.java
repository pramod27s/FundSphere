/**
 * REST controller for the Proposal Assistant (v2). Reviews run in the
 * background: POSTs return 202 with the review, and the page polls GET until
 * the status is no longer RUNNING.
 *
 * POST   /api/applications/{id}/proposal-reviews  -> check a draft against the application's stored guidelines
 * GET    /api/applications/{id}/proposal-reviews  -> the application's review history (newest first)
 * POST   /api/proposal-reviews                    -> standalone check: proposal PDF + guidelines PDF
 * GET    /api/proposal-reviews                    -> my recent standalone reviews
 * GET    /api/proposal-reviews/{reviewId}         -> one review, with the full result
 * POST   /api/proposal-reviews/{reviewId}/full    -> upgrade to (or retry) a Full review without re-uploading
 * DELETE /api/proposal-reviews/{reviewId}         -> delete a review
 */
package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.proposal.ProposalReviewResponse;
import org.pramod.corebackend.entity.ProposalReview;
import org.pramod.corebackend.enums.ProposalReviewLevel;
import org.pramod.corebackend.security.UserPrincipal;
import org.pramod.corebackend.service.ProposalReviewRunner;
import org.pramod.corebackend.service.ProposalReviewService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;
import java.util.Locale;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONTENT_TOO_LARGE;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@RestController
@RequiredArgsConstructor
public class ProposalReviewController {

    private static final long MAX_PDF_BYTES = 25L * 1024 * 1024; // 25 MB

    private final ProposalReviewService reviewService;
    private final ProposalReviewRunner reviewRunner;

    @PostMapping("/api/applications/{id}/proposal-reviews")
    public ResponseEntity<ProposalReviewResponse> reviewForApplication(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable Long id,
            @RequestParam("proposalPdf") MultipartFile proposalPdf,
            @RequestParam(value = "level", defaultValue = "instant") String level) {
        byte[] proposal = readPdf(proposalPdf, "proposal");
        ProposalReview review = reviewService.startForApplication(
                requireUserId(principal), id, proposalPdf.getOriginalFilename(), parseLevel(level));
        reviewRunner.run(review.getId(), proposal, proposalPdf.getOriginalFilename(), null, null, review.getGrantTitle());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(reviewService.summary(review.getId()));
    }

    @GetMapping("/api/applications/{id}/proposal-reviews")
    public ResponseEntity<List<ProposalReviewResponse>> listForApplication(
            @AuthenticationPrincipal UserPrincipal principal, @PathVariable Long id) {
        return ResponseEntity.ok(reviewService.listForApplication(requireUserId(principal), id));
    }

    @PostMapping("/api/proposal-reviews")
    public ResponseEntity<ProposalReviewResponse> reviewStandalone(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam("proposalPdf") MultipartFile proposalPdf,
            @RequestParam("guidelinesPdf") MultipartFile guidelinesPdf,
            @RequestParam(value = "grantTitle", defaultValue = "") String grantTitle,
            @RequestParam(value = "level", defaultValue = "instant") String level) {
        byte[] proposal = readPdf(proposalPdf, "proposal");
        byte[] guidelines = readPdf(guidelinesPdf, "guidelines");
        ProposalReview review = reviewService.startStandalone(requireUserId(principal),
                proposalPdf.getOriginalFilename(), guidelinesPdf.getOriginalFilename(), grantTitle, parseLevel(level));
        reviewRunner.run(review.getId(), proposal, proposalPdf.getOriginalFilename(),
                guidelines, guidelinesPdf.getOriginalFilename(), review.getGrantTitle());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(reviewService.summary(review.getId()));
    }

    @GetMapping("/api/proposal-reviews")
    public ResponseEntity<List<ProposalReviewResponse>> listStandalone(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(reviewService.listStandalone(requireUserId(principal)));
    }

    @GetMapping("/api/proposal-reviews/{reviewId}")
    public ResponseEntity<ProposalReviewResponse> get(@AuthenticationPrincipal UserPrincipal principal,
                                                      @PathVariable Long reviewId) {
        return ResponseEntity.ok(reviewService.get(requireUserId(principal), reviewId));
    }

    @PostMapping("/api/proposal-reviews/{reviewId}/full")
    public ResponseEntity<ProposalReviewResponse> runFull(@AuthenticationPrincipal UserPrincipal principal,
                                                          @PathVariable Long reviewId) {
        ProposalReview review = reviewService.startFullReview(requireUserId(principal), reviewId);
        reviewRunner.run(review.getId(), null, review.getProposalFileName(), null, null, review.getGrantTitle());
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(reviewService.summary(review.getId()));
    }

    @DeleteMapping("/api/proposal-reviews/{reviewId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UserPrincipal principal, @PathVariable Long reviewId) {
        reviewService.delete(requireUserId(principal), reviewId);
        return ResponseEntity.noContent().build();
    }

    private static ProposalReviewLevel parseLevel(String level) {
        try {
            return ProposalReviewLevel.valueOf(level.strip().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(BAD_REQUEST, "level must be instant or full");
        }
    }

    /** The bytes are copied now: the upload can't be read after the request ends. */
    private static byte[] readPdf(MultipartFile file, String label) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "Upload the " + label + " PDF");
        }
        if (file.getSize() > MAX_PDF_BYTES) {
            throw new ResponseStatusException(CONTENT_TOO_LARGE, "The " + label + " PDF is larger than 25 MB");
        }
        String name = file.getOriginalFilename();
        String type = file.getContentType();
        boolean pdf = (name != null && name.toLowerCase(Locale.ROOT).endsWith(".pdf"))
                || (type != null && type.toLowerCase(Locale.ROOT).contains("pdf"));
        if (!pdf) {
            throw new ResponseStatusException(BAD_REQUEST, "The " + label + " file must be a PDF (.pdf)");
        }
        try {
            return file.getBytes();
        } catch (IOException ex) {
            throw new ResponseStatusException(BAD_REQUEST, "Couldn't read the " + label + " PDF");
        }
    }

    private static Long requireUserId(UserPrincipal principal) {
        if (principal == null || principal.getId() == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "Authentication required");
        }
        return principal.getId();
    }
}
