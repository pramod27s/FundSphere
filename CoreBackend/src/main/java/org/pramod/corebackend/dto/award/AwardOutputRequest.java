package org.pramod.corebackend.dto.award;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.pramod.corebackend.enums.AwardOutputType;

/**
 * Body of POST /api/awards/{id}/outputs and PUT /api/awards/{id}/outputs/{outputId}:
 * the quick-add form. On PUT every field is replaced. date is "2027",
 * "2027-03" or "2027-03-14"; amount is whole rupees.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class AwardOutputRequest {
    private AwardOutputType type;
    private String title;
    private String details;
    private String date;
    private Long amount;
    private String reference;
}
