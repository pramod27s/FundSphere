package org.pramod.corebackend.dto.admin;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** The email of an existing account to make an admin. */
@Getter
@Setter
@NoArgsConstructor
public class AddAdminRequest {
    private String email;
}
