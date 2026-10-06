/**
 * Stores each call's guidelines reading once, keyed by the hash of its text,
 * so Objective 3's checklist and the Proposal Assistant share it and the same
 * guidelines are never sent to the AI twice.
 */
package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.entity.GuidelineExtraction;
import org.pramod.corebackend.repository.GuidelineExtractionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;

import static org.springframework.http.HttpStatus.BAD_GATEWAY;

@Service
@RequiredArgsConstructor
public class GuidelineExtractionService {

    private final GuidelineExtractionRepository repository;
    private final ObjectMapper objectMapper;

    /** Saves (or refreshes) the extraction returned by the ai-service. */
    @Transactional
    public GuidelineExtraction store(Map<String, Object> extraction) {
        Object hash = extraction.get("content_hash");
        if (!(hash instanceof String contentHash) || contentHash.isBlank()) {
            throw new ResponseStatusException(BAD_GATEWAY, "The AI service didn't identify the guidelines document");
        }
        String json = objectMapper.writeValueAsString(extraction);
        String sourceName = extraction.get("source_name") instanceof String s ? s : null;
        GuidelineExtraction row = repository.findByContentHash(contentHash)
                .orElseGet(() -> GuidelineExtraction.builder().contentHash(contentHash).build());
        row.setExtractionJson(json);
        row.setSourceName(sourceName);
        return repository.save(row);
    }

    /** The "proposal" part (required sections, criteria, rules) as JSON for the ai-service. */
    public String guidanceJson(GuidelineExtraction extraction) {
        Map<?, ?> parsed = objectMapper.readValue(extraction.getExtractionJson(), Map.class);
        Object guidance = parsed.get("proposal");
        return objectMapper.writeValueAsString(guidance == null ? Map.of() : guidance);
    }
}
