package org.pramod.corebackend.dto.award;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

/** Body of PUT /api/awards/{id}/objectives: every objective, in order. An empty list clears them. */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ObjectivesRequest {
    private List<String> objectives;
}
