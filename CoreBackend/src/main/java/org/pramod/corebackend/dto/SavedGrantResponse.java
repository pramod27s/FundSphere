package org.pramod.corebackend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * What the saved-grants list/PATCH endpoints return: the embedded grant
 * payload plus the per-user metadata (notes, savedAt, updatedAt). Where the
 * user is with a grant (preparing, submitted...) lives on its application.
 *
 * Frontend renders rich saved-grants pages from this; the bare list of
 * grant IDs is still served by /api/saved-grants/ids for cheap "is saved?"
 * checks elsewhere in the UI.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SavedGrantResponse {
    private Long id;                  // SavedGrant row id (not the grant id)
    private GrantResponse grant;
    private String notes;
    private LocalDateTime savedAt;
    private LocalDateTime updatedAt;
}
