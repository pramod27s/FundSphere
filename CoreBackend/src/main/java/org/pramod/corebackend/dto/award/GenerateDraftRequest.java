package org.pramod.corebackend.dto.award;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.pramod.corebackend.enums.ReportKind;

import java.time.LocalDate;
import java.util.List;

/**
 * Body of POST /api/awards/{id}/reports. Either eventId (a progress-report or
 * final-report deadline: the kind, title and period come from it) or kind
 * with periodStart and periodEnd. outputIds null means the outputs dated
 * within the period plus the undated ones; an empty list means none.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class GenerateDraftRequest {
    private Long eventId;
    private ReportKind kind;
    private LocalDate periodStart;
    private LocalDate periodEnd;
    private List<Long> outputIds;
    private String notes;
}
