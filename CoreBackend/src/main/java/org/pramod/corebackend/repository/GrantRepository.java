/**
 * This file contains the GrantRepository class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.repository;

import org.pramod.corebackend.entity.Grant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface GrantRepository extends JpaRepository<Grant, Long> {

    Optional<Grant> findByGrantUrl(String grantUrl);

    boolean existsByGrantUrl(String grantUrl);
}


