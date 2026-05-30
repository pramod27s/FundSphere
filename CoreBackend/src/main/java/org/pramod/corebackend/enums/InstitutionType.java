/**
 * This file contains the InstitutionType enum.
 * Explicit institution category collected during onboarding, replacing the
 * fragile keyword-guess previously derived from the institution name. Feeds
 * the institution component of the AI recommender's eligibility scoring.
 */
package org.pramod.corebackend.enums;

public enum InstitutionType {
    UNIVERSITY,
    COLLEGE,
    RESEARCH_INSTITUTE,
    GOVERNMENT_LAB,
    HOSPITAL,
    STARTUP,
    INDUSTRY,
    NGO,
    OTHER
}
