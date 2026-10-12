/**
 * JPA repository for progress-report drafts (Objective 4, 4.4).
 */
package org.pramod.corebackend.repository;

import org.pramod.corebackend.entity.GeneratedDraft;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface GeneratedDraftRepository extends JpaRepository<GeneratedDraft, Long> {

    List<GeneratedDraft> findAllByAwardIdOrderByCreatedAtDesc(Long awardId);

    Optional<GeneratedDraft> findByIdAndAwardId(Long id, Long awardId);

    long countByAwardId(Long awardId);
}
