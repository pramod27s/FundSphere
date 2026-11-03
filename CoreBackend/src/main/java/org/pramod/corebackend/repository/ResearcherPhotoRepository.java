package org.pramod.corebackend.repository;

import org.pramod.corebackend.entity.ResearcherPhoto;
import org.springframework.data.jpa.repository.JpaRepository;

/** Photos are keyed by the researcher's id. */
public interface ResearcherPhotoRepository extends JpaRepository<ResearcherPhoto, Long> {
}
