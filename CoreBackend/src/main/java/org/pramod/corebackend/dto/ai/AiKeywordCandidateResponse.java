/**
 * This file contains the AiKeywordCandidateResponse class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.dto.ai;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AiKeywordCandidateResponse {

    private Long grantId;
    private double keywordScore;
}


