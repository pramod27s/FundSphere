package org.pramod.corebackend.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.pramod.corebackend.enums.SavedGrantStatus;

/**
 * PATCH body for /api/saved-grants/{grantId}. Both fields are optional —
 * if a field is null, that piece of metadata is left unchanged.
 *
 * Note: notes uses an explicit empty string ("") to clear, not null
 * (null = "don't touch"). The controller normalises this.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SavedGrantUpdateRequest {
    private SavedGrantStatus status;
    private String notes;
}
