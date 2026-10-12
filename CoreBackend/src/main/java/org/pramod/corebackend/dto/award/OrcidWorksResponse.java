package org.pramod.corebackend.dto.award;

import org.pramod.corebackend.enums.AwardOutputType;

import java.util.List;

/**
 * Body of GET /api/awards/{id}/outputs/orcid: the works on the PI's ORCID
 * record, newest first, for the PI to tick the ones from this grant.
 * orcidId is null (and message says why) when the PI hasn't linked one.
 */
public record OrcidWorksResponse(String orcidId, List<Work> works, String message) {

    /**
     * inPeriod is null when ORCID has no date for the work. alreadyAdded is
     * true when the grant has it already (same put-code or same DOI).
     */
    public record Work(String putCode, String title, String journal, String date, String doi, String workType,
                       AwardOutputType outputType, Boolean inPeriod, boolean alreadyAdded) {
    }
}
