/**
 * This file contains the RefreshTokenRequest class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.dto.auth;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class RefreshTokenRequest {
    private String refreshToken;
}


