package org.pramod.corebackend.dto.admin;

import lombok.Builder;
import lombok.Getter;

/** An admin as the admin page lists them. */
@Getter
@Builder
public class AdminUserResponse {
    private Long id;
    private String fullName;
    private String email;
    /** True for the owner, who can't be removed and is the only one who can add or remove admins. */
    private boolean owner;
}
