/**
 * This file contains the LoginRequest class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.dto.auth;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class LoginRequest {
    private String email;
    private String password;
}


