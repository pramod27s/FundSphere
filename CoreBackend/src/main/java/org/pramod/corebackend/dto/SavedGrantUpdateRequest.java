package org.pramod.corebackend.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * PATCH body for /api/saved-grants/{grantId}: the bookmark's notes.
 *
 * Note: notes uses an explicit empty string ("") to clear, not null
 * (null = "don't touch"). The service normalises this.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SavedGrantUpdateRequest {
    private String notes;
}
