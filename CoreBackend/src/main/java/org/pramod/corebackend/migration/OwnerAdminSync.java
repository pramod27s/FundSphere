/**
 * Keeps the owner's account an admin.
 *
 * Runs at every start: if OWNER_EMAIL names a registered account that isn't
 * an admin, it becomes one. If no account uses that email yet, nothing
 * changes and the log says to register it first, so the setting can never
 * hand admin rights to whoever signs up with that email later.
 */
package org.pramod.corebackend.migration;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.pramod.corebackend.enums.Role;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.security.OwnerAccess;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class OwnerAdminSync implements ApplicationRunner {

    private final OwnerAccess ownerAccess;
    private final AppUserRepository appUserRepository;

    @Override
    public void run(ApplicationArguments args) {
        if (!ownerAccess.isConfigured()) {
            log.info("No OWNER_EMAIL set: admins can only be changed in the database");
            return;
        }
        try {
            appUserRepository.findByEmailIgnoreCase(ownerAccess.ownerEmail()).ifPresentOrElse(owner -> {
                if (owner.getRole() != Role.ADMIN) {
                    owner.setRole(Role.ADMIN);
                    appUserRepository.save(owner);
                    log.info("Made the owner's account ({}) an admin", ownerAccess.ownerEmail());
                }
            }, () -> log.warn("OWNER_EMAIL is {} but no account uses it yet: register it, then restart",
                    ownerAccess.ownerEmail()));
        } catch (RuntimeException ex) {
            log.error("Couldn't check the owner's admin role; will retry on the next start", ex);
        }
    }
}
