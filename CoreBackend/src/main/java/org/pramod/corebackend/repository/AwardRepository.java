/**
 * JPA repository for the awards table (the user's grants, Objective 4).
 */
package org.pramod.corebackend.repository;

import org.pramod.corebackend.entity.Award;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AwardRepository extends JpaRepository<Award, Long> {

    /** The user's grants with their budget lines, so the list can show totals without N+1 queries. */
    @Query("select distinct a from Award a " +
            "left join fetch a.budgetLines " +
            "where a.owner.id = :ownerId " +
            "order by a.endDate asc")
    List<Award> findAllByOwnerIdWithLines(@Param("ownerId") Long ownerId);

    Optional<Award> findByIdAndOwnerId(Long id, Long ownerId);

    Optional<Award> findFirstByOwnerIdAndApplicationId(Long ownerId, Long applicationId);

    /** The grant set up from an application, so the application page can link to it. */
    @Query("select a.id from Award a where a.application.id = :applicationId")
    Optional<Long> findIdByApplicationId(@Param("applicationId") Long applicationId);

    /**
     * Unlinks the grant from an application that is about to be deleted.
     * The grant keeps its own copy of every detail.
     */
    @Modifying
    @Query("update Award a set a.application = null where a.application.id = :applicationId")
    int detachApplication(@Param("applicationId") Long applicationId);
}
