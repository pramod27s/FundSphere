/**
 * JPA repository for the proposal_reviews table.
 */
package org.pramod.corebackend.repository;

import org.pramod.corebackend.entity.ProposalReview;
import org.pramod.corebackend.enums.ProposalReviewLevel;
import org.pramod.corebackend.enums.ProposalReviewStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ProposalReviewRepository extends JpaRepository<ProposalReview, Long> {

    Optional<ProposalReview> findByIdAndOwnerId(Long id, Long ownerId);

    List<ProposalReview> findAllByApplicationIdAndOwnerIdOrderByVersionNoDesc(Long applicationId, Long ownerId);

    List<ProposalReview> findAllByOwnerIdAndApplicationIsNotNullOrderByVersionNoDesc(Long ownerId);

    List<ProposalReview> findTop20ByOwnerIdAndApplicationIsNullOrderByCreatedAtDesc(Long ownerId);

    @Query("select coalesce(max(r.versionNo), 0) from ProposalReview r where r.application.id = :applicationId")
    int maxVersionNo(@Param("applicationId") Long applicationId);

    /** The newest finished review of the same series, used to reuse unchanged work. */
    @Query("select r from ProposalReview r " +
            "where r.owner.id = :ownerId and r.id <> :excludeId and r.guidelineExtraction.id = :extractionId " +
            "and ((:applicationId is null and r.application is null) or r.application.id = :applicationId) " +
            "and r.status = :status and r.level = :level " +
            "order by r.completedAt desc limit 1")
    Optional<ProposalReview> findLatestFinished(@Param("ownerId") Long ownerId,
                                                @Param("applicationId") Long applicationId,
                                                @Param("extractionId") Long extractionId,
                                                @Param("excludeId") Long excludeId,
                                                @Param("status") ProposalReviewStatus status,
                                                @Param("level") ProposalReviewLevel level);

    /** Reviews left RUNNING by a restart are marked failed so the page doesn't wait forever. */
    @Modifying
    @Query("update ProposalReview r set r.status = org.pramod.corebackend.enums.ProposalReviewStatus.FAILED, " +
            "r.stage = null, r.errorMessage = 'The review was interrupted. Please run it again.' " +
            "where r.status = org.pramod.corebackend.enums.ProposalReviewStatus.RUNNING and r.updatedAt < :before")
    int failStaleRuns(@Param("before") java.time.LocalDateTime before);

    /** An application's reviews go with it. */
    @Modifying
    @Query("delete from ProposalReview r where r.application.id = :applicationId")
    int deleteAllByApplicationId(@Param("applicationId") Long applicationId);
}
