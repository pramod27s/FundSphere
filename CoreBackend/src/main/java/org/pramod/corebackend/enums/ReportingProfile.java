package org.pramod.corebackend.enums;

/**
 * Which agency's reporting rules a grant follows (4.2). Agencies differ:
 * DST asks for six-monthly progress reports and allows a year for the closing
 * documents, ICMR wants the final report within a month, ANRF reports by
 * project year. OTHER uses general defaults the PI checks against the order.
 * The rules themselves live in ComplianceRules.
 */
public enum ReportingProfile {
    ANRF,
    DST,
    ICMR,
    OTHER
}
