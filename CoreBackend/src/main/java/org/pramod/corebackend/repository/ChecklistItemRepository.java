/**
 * JPA repository for the checklist_items table.
 */
package org.pramod.corebackend.repository;

import org.pramod.corebackend.entity.ChecklistItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ChecklistItemRepository extends JpaRepository<ChecklistItem, Long> {

    Optional<ChecklistItem> findByIdAndApplicationId(Long id, Long applicationId);
}
