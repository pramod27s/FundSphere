package org.pramod.corebackend.dto.auth;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class AuthUserResponse {
    private Long id;
    private String fullName;
    private String email;
    private String role;
}

