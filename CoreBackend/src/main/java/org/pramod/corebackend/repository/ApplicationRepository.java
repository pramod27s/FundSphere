/**
 * JPA repository for the applications table.
 */
package org.pramod.corebackend.repository;

import org.pramod.corebackend.entity.Application;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ApplicationRepository extends JpaRepository<Application, Long> {

    /** The user's applications with their items, so the list can show readiness without N+1 queries. */
    @Query("select distinct a from Application a " +
            "left join fetch a.items " +
            "where a.owner.id = :ownerId " +
            "order by a.updatedAt desc")
    List<Application> findAllByOwnerIdWithItems(@Param("ownerId") Long ownerId);

    Optional<Application> findByIdAndOwnerId(Long id, Long ownerId);

    Optional<Application> findFirstByOwnerIdAndGrantIdOrderByCreatedAtDesc(Long ownerId, Long grantId);

    /**
     * Unlinks applications from a grant that is about to be deleted. The
     * applications keep their own copy of title, agency and deadline.
     */
    @Modifying
    @Query("update Application a set a.grant = null where a.grant.id = :grantId")
    int detachGrant(@Param("grantId") Long grantId);
}
