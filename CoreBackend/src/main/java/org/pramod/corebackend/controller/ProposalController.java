/**
 * REST controller for grant-proposal analysis.
 * Accepts two PDFs (proposal + guidelines) plus optional metadata,
 * forwards them to the FastAPI ai-service, and returns the JSON
 * analysis report back to the React client.
 */
package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.service.AiServiceClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/proposal")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
public class ProposalController {

    private static final long MAX_PDF_BYTES = 25L * 1024 * 1024; // 25 MB
    private static final Set<String> ALLOWED_MODES = Set.of("simple", "deep");

    private final AiServiceClient aiServiceClient;

    @PostMapping(path = "/analyze", consumes = "multipart/form-data")
    public ResponseEntity<?> analyzeProposal(
            @RequestParam("proposalPdf") MultipartFile proposalPdf,
            @RequestParam("guidelinesPdf") MultipartFile guidelinesPdf,
            @RequestParam(value = "grantTitle", required = false, defaultValue = "") String grantTitle,
            @RequestParam(value = "mode", required = false, defaultValue = "simple") String mode
    ) {
        System.out.println("[ProposalController] /analyze hit"
                + " proposal=" + (proposalPdf == null ? "null" : proposalPdf.getOriginalFilename() + "/" + proposalPdf.getSize() + "B")
                + " guidelines=" + (guidelinesPdf == null ? "null" : guidelinesPdf.getOriginalFilename() + "/" + guidelinesPdf.getSize() + "B")
                + " grantTitle='" + grantTitle + "'"
                + " mode=" + mode);
        try {
            if (proposalPdf == null || proposalPdf.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of(
                        "error", "Proposal PDF is required"));
            }
            if (guidelinesPdf == null || guidelinesPdf.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of(
                        "error", "Guidelines PDF is required"));
            }
            if (proposalPdf.getSize() > MAX_PDF_BYTES || guidelinesPdf.getSize() > MAX_PDF_BYTES) {
                return ResponseEntity.status(413).body(Map.of(
                        "error", "PDF file exceeds 25 MB limit"));
            }
            if (!isPdf(proposalPdf) || !isPdf(guidelinesPdf)) {
                return ResponseEntity.badRequest().body(Map.of(
                        "error", "Both files must be PDFs (.pdf)"));
            }

            String normalizedMode = (mode == null ? "simple" : mode.trim().toLowerCase());
            if (!ALLOWED_MODES.contains(normalizedMode)) {
                normalizedMode = "simple";
            }

            Object result = aiServiceClient.analyzeProposal(
                    proposalPdf,
                    guidelinesPdf,
                    grantTitle == null ? "" : grantTitle.trim(),
                    normalizedMode
            );
            return ResponseEntity.ok(result);
        } catch (Exception ex) {
            System.err.println("[ProposalController] /analyze FAILED: " + ex.getClass().getName() + ": " + ex.getMessage());
            ex.printStackTrace();
            throw ex;
        }
    }

    private static boolean isPdf(MultipartFile file) {
        String name = file.getOriginalFilename();
        if (name != null && name.toLowerCase().endsWith(".pdf")) {
            return true;
        }
        String type = file.getContentType();
        return type != null && type.toLowerCase().contains("pdf");
    }
}
