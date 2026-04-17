/**
 * This file contains the AppUserRepository class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.repository;

import org.pramod.corebackend.entity.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {
    Optional<AppUser> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);
}


