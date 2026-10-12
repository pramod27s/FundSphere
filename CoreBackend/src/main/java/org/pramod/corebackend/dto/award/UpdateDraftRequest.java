package org.pramod.corebackend.dto.award;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;
import java.util.Map;

/**
 * Body of PUT /api/awards/{id}/reports/{draftId}: the draft's sections after
 * the PI's edits (changed text, deleted sentences, sentences kept as written).
 * Every sentence is checked again against the grant's current records.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class UpdateDraftRequest {
    private List<Map<String, Object>> sections;
}
