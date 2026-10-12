package org.pramod.corebackend.dto.award;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

/**
 * Body of POST /api/awards/{id}/outputs/orcid: the put-codes of the works the
 * PI ticked. The works are fetched again from ORCID, so what's stored is what
 * the record says. orcidId may be left out to use the one on the PI's profile.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class OrcidImportRequest {
    private String orcidId;
    private List<String> putCodes;
}
