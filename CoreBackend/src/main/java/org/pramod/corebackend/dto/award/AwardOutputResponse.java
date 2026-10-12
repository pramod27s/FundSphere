package org.pramod.corebackend.dto.award;

import org.pramod.corebackend.enums.AwardOutputSource;
import org.pramod.corebackend.enums.AwardOutputType;

/** One output of a grant. date is "2027", "2027-03" or "2027-03-14", or null; amount is whole rupees. */
public record AwardOutputResponse(Long id, AwardOutputType type, String title, String details, String date,
                                  Long amount, String reference, AwardOutputSource source, String externalId) {
}
