/**
 * This file contains the GrantRepository class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.repository;

import org.pramod.corebackend.entity.Grant;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface GrantRepository extends JpaRepository<Grant, Long> {

    Optional<Grant> findByGrantUrl(String grantUrl);

    boolean existsByGrantUrl(String grantUrl);

    /**
     * Rows the sweeper is allowed to retry RIGHT NOW:
     *   - flagged for reindex
     *   - under the dead-letter attempt cap
     *   - past their backoff window (or never attempted)
     *
     * Ordered oldest-first so a backlog drains FIFO. The {@link Pageable}
     * argument bounds the batch so a giant backlog can't overwhelm FastAPI
     * in a single sweep.
     */
    @Query("""
            SELECT g FROM Grant g
            WHERE g.needsReindex = true
              AND g.reindexAttempts < :maxAttempts
              AND (g.nextRetryAt IS NULL OR g.nextRetryAt <= :now)
            ORDER BY COALESCE(g.nextRetryAt, g.updatedAt) ASC
            """)
    List<Grant> findEligibleForReindex(@Param("now") LocalDateTime now,
                                       @Param("maxAttempts") int maxAttempts,
                                       Pageable pageable);

    long countByNeedsReindexTrue();
}


