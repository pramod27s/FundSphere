/**
 * Who is an admin (2nd.md, Part A).
 *
 * Only the owner (OwnerAccess) can see the list and add or remove admins;
 * other admins don't see each other's emails. Only accounts that already exist can be made admins: the
 * app doesn't verify email addresses, so approving an unused email would let
 * whoever signs up with it first become an admin.
 */
package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.admin.AdminUserResponse;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.enums.Role;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.security.OwnerAccess;
import org.pramod.corebackend.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AdminUserService {

    private final AppUserRepository appUserRepository;
    private final OwnerAccess ownerAccess;

    /** The owner first, then the other admins by name. Owner only. */
    @Transactional(readOnly = true)
    public List<AdminUserResponse> listAdmins(UserPrincipal actor) {
        requireOwner(actor);
        return appUserRepository.findAllByRoleOrderByFullNameAsc(Role.ADMIN).stream()
                .map(this::toResponse)
                .sorted(Comparator.comparing(AdminUserResponse::isOwner).reversed())
                .toList();
    }

    @Transactional
    public AdminUserResponse addAdmin(UserPrincipal actor, String email) {
        requireOwner(actor);
        if (!StringUtils.hasText(email)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter the email of the account to make an admin");
        }
        AppUser user = appUserRepository.findByEmailIgnoreCase(email.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "No FundSphere account uses this email. Ask them to sign up first."));
        if (user.getRole() == Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, user.getFullName() + " is already an admin");
        }
        user.setRole(Role.ADMIN);
        return toResponse(appUserRepository.save(user));
    }

    @Transactional
    public void removeAdmin(UserPrincipal actor, Long userId) {
        requireOwner(actor);
        AppUser user = appUserRepository.findById(userId)
                .filter(found -> found.getRole() == Role.ADMIN)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "That account isn't an admin"));
        if (ownerAccess.isOwner(user.getEmail())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The owner can't be removed");
        }
        user.setRole(Role.USER);
        appUserRepository.save(user);
    }

    private void requireOwner(UserPrincipal actor) {
        if (actor == null || !ownerAccess.isOwner(actor.getEmail())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can see or change the admins");
        }
    }

    private AdminUserResponse toResponse(AppUser user) {
        return AdminUserResponse.builder()
                .id(user.getId())
                .fullName(user.getFullName())
                .email(user.getEmail())
                .owner(ownerAccess.isOwner(user.getEmail()))
                .build();
    }
}
