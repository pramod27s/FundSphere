/**
 * Suggestions extracted from a public ORCID record, returned to the onboarding
 * UI to prefill the research profile. Always returned (never throws) — `found`
 * is false with a human-readable `message` when the lookup fails or the record
 * has nothing usable, so the user simply fills the form manually.
 */
package org.pramod.corebackend.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OrcidEnrichmentResponse {

    /** True when the ORCID record was fetched and yielded at least one field. */
    private boolean found;

    /** User-facing status (e.g. "Imported from ORCID", or why it failed). */
    private String message;

    /** Display name from the ORCID record, if public. */
    private String name;

    /** Suggested research summary (from biography, else recent work titles). */
    private String researchSummary;

    /** Suggested keywords (ORCID person keywords). */
    private List<String> keywords;
}
