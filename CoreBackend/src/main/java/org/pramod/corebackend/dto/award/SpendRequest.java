package org.pramod.corebackend.dto.award;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.pramod.corebackend.enums.BudgetHead;

import java.time.LocalDate;
import java.util.List;

/**
 * Body of PUT /api/awards/{id}/spending/{fy}: the year's figures, copied from
 * the institute's statement. It replaces the year's figures: a head left out
 * (or with neither number) has none. budget null means "use the estimate";
 * amounts are whole rupees. asOf is needed once any spending is given. The
 * Equipment warning settings belong to the grant; null leaves them as they are.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SpendRequest {
    private LocalDate asOf;
    private List<HeadRequest> heads;
    private Integer equipmentAlertPercent;
    private Integer equipmentAlertMonth;

    public record HeadRequest(BudgetHead head, Long budget, Long spent) {
    }
}
