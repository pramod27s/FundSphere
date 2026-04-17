/**
 * This file contains the AuthResponse class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.dto.auth;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class AuthResponse {
    private String accessToken;
    private String refreshToken;
    private String tokenType;
    private long expiresIn;
    private AuthUserResponse user;
}


