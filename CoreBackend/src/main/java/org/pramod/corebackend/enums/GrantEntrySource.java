package org.pramod.corebackend.enums;

/**
 * How a grant got into FundSphere. Rows saved before this existed have no
 * value and count as SCRAPED.
 */
public enum GrantEntrySource {
    /** Found and kept up to date by the scraper. */
    SCRAPED,
    /** Added by an admin from a call's PDF, link or text (2nd.md, Part B). The scraper never changes it. */
    MANUAL
}
