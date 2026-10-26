/**
 * Who the owner is: the one account that can add and remove admins.
 *
 * The owner is a setting (app.owner-email, from OWNER_EMAIL in .env), not a
 * role in the database, so only someone with access to the server's files
 * can change it. The owner is always an admin as well (OwnerAdminSync).
 */
package org.pramod.corebackend.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Locale;

@Component
public class OwnerAccess {

    private final String ownerEmail;

    public OwnerAccess(@Value("${app.owner-email:}") String ownerEmail) {
        this.ownerEmail = ownerEmail == null ? "" : ownerEmail.trim().toLowerCase(Locale.ROOT);
    }

    public boolean isConfigured() {
        return !ownerEmail.isEmpty();
    }

    /** The owner's email, lower-cased; empty when no owner is set. */
    public String ownerEmail() {
        return ownerEmail;
    }

    public boolean isOwner(String email) {
        return isConfigured() && email != null && ownerEmail.equals(email.trim().toLowerCase(Locale.ROOT));
    }
}
