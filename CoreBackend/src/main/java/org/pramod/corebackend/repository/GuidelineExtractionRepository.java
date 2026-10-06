/**
 * JPA repository for the guideline_extractions table.
 */
package org.pramod.corebackend.repository;

import org.pramod.corebackend.entity.GuidelineExtraction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface GuidelineExtractionRepository extends JpaRepository<GuidelineExtraction, Long> {

    Optional<GuidelineExtraction> findByContentHash(String contentHash);
}
