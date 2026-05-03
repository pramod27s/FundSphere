/**
 * JPA repository for the saved_grants table.
 */
package org.pramod.corebackend.repository;

import org.pramod.corebackend.entity.SavedGrant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface SavedGrantRepository extends JpaRepository<SavedGrant, Long> {

    @Query("select sg from SavedGrant sg " +
            "join fetch sg.grant " +
            "where sg.user.id = :userId " +
            "order by sg.savedAt desc")
    List<SavedGrant> findAllByUserIdWithGrant(Long userId);

    Optional<SavedGrant> findByUserIdAndGrantId(Long userId, Long grantId);

    boolean existsByUserIdAndGrantId(Long userId, Long grantId);

    long deleteByUserIdAndGrantId(Long userId, Long grantId);
}
