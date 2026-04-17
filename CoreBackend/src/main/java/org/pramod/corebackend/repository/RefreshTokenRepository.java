/**
 * This file contains the RefreshTokenRepository class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.repository;

import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.entity.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    Optional<RefreshToken> findByToken(String token);

    void deleteByUser(AppUser user);
}


