/**
 * This file contains the AppUserRepository class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.repository;

import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.enums.Role;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {
    Optional<AppUser> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    /** Everyone with a role, e.g. the admins for the admin page. */
    List<AppUser> findAllByRoleOrderByFullNameAsc(Role role);

    /** The owner of a calendar subscription link, found by the hash of its secret. */
    Optional<AppUser> findByCalendarTokenHash(String calendarTokenHash);
}


