package org.pramod.corebackend.dto.award;

import org.pramod.corebackend.enums.ReportKind;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * A progress-report draft. content (null in lists) is the ai-service's draft:
 * sections → blocks → sentences, each sentence with its sources and check
 * result; entries (id → label) for showing sources; warnings.
 */
public record DraftResponse(Long id, Long awardId, ReportKind kind, String title, LocalDate periodStart,
                            LocalDate periodEnd, Long eventId, List<Long> outputIds, String notes, String model,
                            int unsupportedCount, int placeholderCount, int confirmedCount,
                            Map<String, Object> content, LocalDateTime createdAt, LocalDateTime updatedAt) {
}
