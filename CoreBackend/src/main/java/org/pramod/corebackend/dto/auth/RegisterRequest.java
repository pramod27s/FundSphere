/**
 * This file contains the RegisterRequest class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.dto.auth;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class RegisterRequest {
    private String fullName;
    private String email;
    private String password;
}


