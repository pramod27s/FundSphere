/**
 * Runs proposal reviews on a background thread, so the request returns at
 * once and the page polls for progress instead of holding a long HTTP call.
 *
 * Every failure ends in a FAILED row with a message the user can read; the
 * executor never swallows an error silently.
 */
package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.entity.GuidelineExtraction;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

@Service
@RequiredArgsConstructor
public class ProposalReviewRunner {

    private static final Logger log = Logger.getLogger(ProposalReviewRunner.class.getName());

    private final ProposalReviewService reviewService;
    private final GuidelineExtractionService guidelineExtractionService;
    private final AiServiceClient aiServiceClient;

    /**
     * @param proposalPdf    the draft, or null to re-run the document an earlier run read
     * @param guidelinesPdf  for standalone reviews only: the call's guidelines to read first
     */
    @Async
    public void run(Long reviewId, byte[] proposalPdf, String proposalFileName,
                    byte[] guidelinesPdf, String guidelinesFileName, String grantTitle) {
        try {
            if (guidelinesPdf != null) {
                reviewService.setStage(reviewId, ProposalReviewService.STAGE_READING_GUIDELINES);
                Map<String, Object> extraction = aiServiceClient.extractGuidelines(guidelinesPdf, guidelinesFileName, grantTitle);
                GuidelineExtraction stored = guidelineExtractionService.store(extraction);
                reviewService.attachExtraction(reviewId, stored);
            }
            reviewService.setStage(reviewId, ProposalReviewService.STAGE_REVIEWING);
            ProposalReviewService.RunInput input = reviewService.runInput(reviewId);
            Map<String, Object> result = aiServiceClient.reviewProposal(
                    proposalPdf, proposalFileName, input.guidanceJson(), input.extractionHash(), input.level(),
                    input.grantTitle(), proposalPdf == null ? input.documentJson() : null, input.previousJson());
            reviewService.complete(reviewId, result);
        } catch (ResponseStatusException ex) {
            log.warning("Proposal review " + reviewId + " failed: " + ex.getReason());
            reviewService.fail(reviewId, ex.getReason());
        } catch (Throwable t) {
            log.log(Level.SEVERE, "Unexpected error in proposal review " + reviewId, t);
            reviewService.fail(reviewId, "The review failed unexpectedly. Please try again.");
        }
    }
}
