/**
 * Proposal Assistant reviews: starting them, recording their progress and
 * results, and the history per application.
 *
 * The AI work itself runs in ProposalReviewRunner on a background thread;
 * this class owns every database write so each one is a short transaction.
 */
package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.proposal.ProposalReviewResponse;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.entity.Application;
import org.pramod.corebackend.entity.GuidelineExtraction;
import org.pramod.corebackend.entity.ProposalReview;
import org.pramod.corebackend.enums.ProposalReviewLevel;
import org.pramod.corebackend.enums.ProposalReviewStatus;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.repository.ApplicationRepository;
import org.pramod.corebackend.repository.ProposalReviewRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
@RequiredArgsConstructor
public class ProposalReviewService {

    /** A review still RUNNING after this long was cut off by a restart. */
    private static final long STALE_AFTER_MINUTES = 10;

    public static final String STAGE_READING_GUIDELINES = "READING_GUIDELINES";
    public static final String STAGE_REVIEWING = "REVIEWING";

    /** What the runner needs to call the ai-service. */
    public record RunInput(String guidanceJson, String extractionHash, String level, String grantTitle,
                           String documentJson, String previousJson) {
    }

    private final ProposalReviewRepository reviewRepository;
    private final ApplicationRepository applicationRepository;
    private final AppUserRepository appUserRepository;
    private final GuidelineExtractionService guidelineExtractionService;
    private final ObjectMapper objectMapper;

    // ------------------------------------------------------------------
    // Starting reviews
    // ------------------------------------------------------------------

    @Transactional
    public ProposalReview startForApplication(Long userId, Long applicationId, String fileName, ProposalReviewLevel level) {
        Application application = applicationRepository.findByIdAndOwnerId(applicationId, userId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Application not found"));
        if (application.getGuidelineExtraction() == null) {
            throw new ResponseStatusException(BAD_REQUEST,
                    "Read the call's guidelines first (Checklist tab), so the draft can be checked against them.");
        }
        return reviewRepository.save(ProposalReview.builder()
                .owner(application.getOwner())
                .application(application)
                .guidelineExtraction(application.getGuidelineExtraction())
                .versionNo(reviewRepository.maxVersionNo(applicationId) + 1)
                .proposalFileName(fileName)
                .grantTitle(application.getTitle())
                .level(level)
                .status(ProposalReviewStatus.RUNNING)
                .stage(STAGE_REVIEWING)
                .build());
    }

    @Transactional
    public ProposalReview startStandalone(Long userId, String proposalFileName, String guidelinesFileName,
                                          String grantTitle, ProposalReviewLevel level) {
        AppUser owner = appUserRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "User not found"));
        return reviewRepository.save(ProposalReview.builder()
                .owner(owner)
                .versionNo(1)
                .proposalFileName(proposalFileName)
                .guidelinesFileName(guidelinesFileName)
                .grantTitle(grantTitle == null || grantTitle.isBlank() ? null : grantTitle.strip())
                .level(level)
                .status(ProposalReviewStatus.RUNNING)
                .stage(STAGE_READING_GUIDELINES)
                .build());
    }

    /** Upgrades an Instant check to a Full review, or retries a partial/failed one, without re-uploading. */
    @Transactional
    public ProposalReview startFullReview(Long userId, Long reviewId) {
        ProposalReview review = requireOwned(userId, reviewId);
        if (review.getStatus() == ProposalReviewStatus.RUNNING) {
            throw new ResponseStatusException(CONFLICT, "This review is still running");
        }
        if (review.getGuidelineExtraction() == null || documentJson(review) == null) {
            throw new ResponseStatusException(BAD_REQUEST, "This draft wasn't read successfully. Upload it again.");
        }
        review.setLevel(ProposalReviewLevel.FULL);
        review.setStatus(ProposalReviewStatus.RUNNING);
        review.setStage(STAGE_REVIEWING);
        review.setErrorMessage(null);
        return reviewRepository.save(review);
    }

    // ------------------------------------------------------------------
    // Reading
    // ------------------------------------------------------------------

    @Transactional
    public List<ProposalReviewResponse> listForApplication(Long userId, Long applicationId) {
        applicationRepository.findByIdAndOwnerId(applicationId, userId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Application not found"));
        failStaleRuns();
        return reviewRepository.findAllByApplicationIdAndOwnerIdOrderByVersionNoDesc(applicationId, userId).stream()
                .map(r -> toResponse(r, false))
                .toList();
    }

    @Transactional
    public List<ProposalReviewResponse> listStandalone(Long userId) {
        failStaleRuns();
        return reviewRepository.findTop20ByOwnerIdAndApplicationIsNullOrderByCreatedAtDesc(userId).stream()
                .map(r -> toResponse(r, false))
                .toList();
    }

    @Transactional
    public ProposalReviewResponse get(Long userId, Long reviewId) {
        failStaleRuns();
        return toResponse(requireOwned(userId, reviewId), true);
    }

    @Transactional
    public void delete(Long userId, Long reviewId) {
        reviewRepository.delete(requireOwned(userId, reviewId));
    }

    @Transactional(readOnly = true)
    public ProposalReviewResponse summary(Long reviewId) {
        return toResponse(reviewRepository.findById(reviewId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Review not found")), false);
    }

    // ------------------------------------------------------------------
    // Called by the runner
    // ------------------------------------------------------------------

    @Transactional
    public void setStage(Long reviewId, String stage) {
        reviewRepository.findById(reviewId).ifPresent(r -> r.setStage(stage));
    }

    @Transactional
    public void attachExtraction(Long reviewId, GuidelineExtraction extraction) {
        reviewRepository.findById(reviewId).ifPresent(r -> r.setGuidelineExtraction(extraction));
    }

    @Transactional(readOnly = true)
    public RunInput runInput(Long reviewId) {
        ProposalReview review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Review not found"));
        GuidelineExtraction extraction = review.getGuidelineExtraction();
        if (extraction == null) {
            throw new ResponseStatusException(BAD_REQUEST, "The guidelines haven't been read");
        }
        Long applicationId = review.getApplication() == null ? null : review.getApplication().getId();
        // Reuse work from the newest finished Full review of this series; failing
        // that, this draft's own earlier Instant check (same text, same facts).
        String previousJson = latestFinished(review, applicationId, extraction, ProposalReviewLevel.FULL)
                .map(ProposalReview::getResultJson)
                .orElseGet(() -> review.getResultJson() != null ? review.getResultJson()
                        : latestFinished(review, applicationId, extraction, ProposalReviewLevel.INSTANT)
                        .map(ProposalReview::getResultJson).orElse(null));
        return new RunInput(
                guidelineExtractionService.guidanceJson(extraction),
                extraction.getContentHash(),
                review.getLevel().name().toLowerCase(),
                review.getGrantTitle(),
                documentJson(review),
                previousJson);
    }

    @Transactional
    public void complete(Long reviewId, Map<String, Object> result) {
        ProposalReview review = reviewRepository.findById(reviewId).orElse(null);
        if (review == null) {
            return; // deleted while it ran
        }
        Map<?, ?> scores = result.get("scores") instanceof Map<?, ?> m ? m : Map.of();
        Map<?, ?> usage = result.get("usage") instanceof Map<?, ?> m ? m : Map.of();
        review.setStatus("complete".equals(result.get("status")) ? ProposalReviewStatus.DONE : ProposalReviewStatus.PARTIAL);
        review.setStage(null);
        review.setErrorMessage(null);
        review.setOverallScore(asInt(scores.get("overall")));
        review.setQualityScore(asInt(scores.get("quality")));
        review.setRulesMet(asInt(scores.get("rules_met")));
        review.setRulesTotal(asInt(scores.get("rules_total")));
        review.setCriticalFailed(asInt(scores.get("critical_failed")));
        review.setScoreCapped(Boolean.TRUE.equals(scores.get("capped")));
        review.setAiCalls(asInt(usage.get("calls")));
        review.setTokensIn(asInt(usage.get("input_tokens")));
        review.setTokensOut(asInt(usage.get("output_tokens")));
        review.setResultJson(objectMapper.writeValueAsString(result));
        review.setCompletedAt(LocalDateTime.now());
    }

    @Transactional
    public void fail(Long reviewId, String message) {
        reviewRepository.findById(reviewId).ifPresent(review -> {
            review.setStatus(ProposalReviewStatus.FAILED);
            review.setStage(null);
            review.setErrorMessage(message == null || message.isBlank() ? "The review failed. Please try again." : message);
            review.setCompletedAt(LocalDateTime.now());
        });
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private ProposalReview requireOwned(Long userId, Long reviewId) {
        return reviewRepository.findByIdAndOwnerId(reviewId, userId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Review not found"));
    }

    private Optional<ProposalReview> latestFinished(ProposalReview review, Long applicationId,
                                                    GuidelineExtraction extraction, ProposalReviewLevel level) {
        return reviewRepository.findLatestFinished(review.getOwner().getId(), applicationId, extraction.getId(),
                review.getId(), ProposalReviewStatus.DONE, level);
    }

    /** The document an earlier run of this review read, as JSON, or null. */
    private String documentJson(ProposalReview review) {
        if (review.getResultJson() == null) {
            return null;
        }
        Object document = objectMapper.readValue(review.getResultJson(), Map.class).get("document");
        return document == null ? null : objectMapper.writeValueAsString(document);
    }

    private void failStaleRuns() {
        reviewRepository.failStaleRuns(LocalDateTime.now().minusMinutes(STALE_AFTER_MINUTES));
    }

    private ProposalReviewResponse toResponse(ProposalReview r, boolean detail) {
        return ProposalReviewResponse.builder()
                .id(r.getId())
                .applicationId(r.getApplication() == null ? null : r.getApplication().getId())
                .versionNo(r.getVersionNo())
                .proposalFileName(r.getProposalFileName())
                .guidelinesFileName(r.getGuidelinesFileName())
                .grantTitle(r.getGrantTitle())
                .level(r.getLevel())
                .status(r.getStatus())
                .stage(r.getStage())
                .errorMessage(r.getErrorMessage())
                .overallScore(r.getOverallScore())
                .qualityScore(r.getQualityScore())
                .rulesMet(r.getRulesMet())
                .rulesTotal(r.getRulesTotal())
                .criticalFailed(r.getCriticalFailed())
                .scoreCapped(r.getScoreCapped())
                .aiCalls(r.getAiCalls())
                .tokensIn(r.getTokensIn())
                .tokensOut(r.getTokensOut())
                .createdAt(r.getCreatedAt())
                .completedAt(r.getCompletedAt())
                .result(detail && r.getResultJson() != null ? objectMapper.readValue(r.getResultJson(), Map.class) : null)
                .build();
    }

    private static Integer asInt(Object value) {
        return value instanceof Number n ? n.intValue() : null;
    }
}
