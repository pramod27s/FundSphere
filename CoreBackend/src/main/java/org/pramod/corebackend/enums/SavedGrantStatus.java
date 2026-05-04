package org.pramod.corebackend.enums;

/**
 * Lifecycle of a user's interest in a saved grant.
 * INTERESTED is the default when a grant is first bookmarked — meaningful
 * progression from there is APPLYING -> SUBMITTED -> (accepted/REJECTED).
 */
public enum SavedGrantStatus {
    INTERESTED,
    APPLYING,
    SUBMITTED,
    REJECTED
}
