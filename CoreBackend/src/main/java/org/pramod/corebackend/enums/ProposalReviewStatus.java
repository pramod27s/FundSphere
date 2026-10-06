package org.pramod.corebackend.enums;

/**
 * RUNNING while the background job works; DONE when everything was evaluated;
 * PARTIAL when some parts couldn't be (listed in the result, never scored);
 * FAILED when the review couldn't run at all (error message on the row).
 */
public enum ProposalReviewStatus {
    RUNNING,
    DONE,
    PARTIAL,
    FAILED
}
