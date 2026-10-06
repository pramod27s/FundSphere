package org.pramod.corebackend.enums;

/**
 * Where an application stands. PREPARING while the team works through the
 * checklist; SUBMITTED once sent to the agency; then AWARDED or NOT_FUNDED.
 */
public enum ApplicationStatus {
    PREPARING,
    SUBMITTED,
    AWARDED,
    NOT_FUNDED
}
