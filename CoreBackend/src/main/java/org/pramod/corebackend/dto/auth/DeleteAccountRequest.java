package org.pramod.corebackend.dto.auth;

import lombok.Getter;
import lombok.Setter;

/** Deleting an account asks for the password again, so an unattended signed-in browser can't do it. */
@Getter
@Setter
public class DeleteAccountRequest {
    private String password;
}
