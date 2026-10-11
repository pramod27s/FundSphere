package org.pramod.corebackend.enums;

/**
 * What the sanction order says happens to money still unspent on 31 March.
 * It differs by agency and fund-flow system, so the PI picks it per grant
 * and the year-end warning (4.3) is worded from it.
 */
public enum UnspentPolicy {
    CARRY_FORWARD,
    LAPSES,
    DEDUCTED_NEXT_RELEASE,
    UNKNOWN
}
