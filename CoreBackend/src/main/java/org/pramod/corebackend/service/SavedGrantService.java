/**
 * Persists user grant bookmarks in postgres.
 * Each saved grant is one row in saved_grants linking the authenticated
 * AppUser to a Grant. Uniqueness is enforced by a composite constraint
 * on (user_id, grant_id) so save() is idempotent.
 *
 * Returns rich SavedGrantResponse objects that include per-user metadata
 * (workflow status, free-form notes, savedAt, updatedAt) so the frontend
 * can render an organised saved-grants page rather than a flat list.
 */
package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.SavedGrantResponse;
import org.pramod.corebackend.dto.SavedGrantUpdateRequest;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.entity.Grant;
import org.pramod.corebackend.entity.SavedGrant;
import org.pramod.corebackend.enums.SavedGrantStatus;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.repository.GrantRepository;
import org.pramod.corebackend.repository.SavedGrantRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
@RequiredArgsConstructor
public class SavedGrantService {

    /** Hard cap on the notes column length; matches the typical TEXT size we want
     *  to keep behaved (paragraphs, not novels). */
    private static final int MAX_NOTES_LENGTH = 4000;

    private final SavedGrantRepository savedGrantRepository;
    private final AppUserRepository appUserRepository;
    private final GrantRepository grantRepository;
    private final GrantService grantService;

    @Transactional(readOnly = true)
    public List<SavedGrantResponse> listSaved(Long userId) {
        return savedGrantRepository.findAllByUserIdWithGrant(userId).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public SavedGrantResponse save(Long userId, Long grantId) {
        SavedGrant existing = savedGrantRepository.findByUserIdAndGrantId(userId, grantId).orElse(null);
        if (existing != null) {
            return toResponse(existing);
        }
        AppUser user = appUserRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "User not found"));
        Grant grant = grantRepository.findById(grantId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Grant not found"));
        SavedGrant entity = SavedGrant.builder()
                .user(user)
                .grant(grant)
                .status(SavedGrantStatus.INTERESTED)
                .build();
        SavedGrant saved = savedGrantRepository.save(entity);
        return toResponse(saved);
    }

    @Transactional
    public SavedGrantResponse update(Long userId, Long grantId, SavedGrantUpdateRequest request) {
        SavedGrant entity = savedGrantRepository.findByUserIdAndGrantId(userId, grantId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Saved grant not found"));

        if (request != null) {
            // status: null = don't touch
            if (request.getStatus() != null) {
                entity.setStatus(request.getStatus());
            }
            // notes: null = don't touch; "" = clear; otherwise = set (truncated to cap)
            if (request.getNotes() != null) {
                String notes = request.getNotes();
                if (notes.length() > MAX_NOTES_LENGTH) {
                    notes = notes.substring(0, MAX_NOTES_LENGTH);
                }
                entity.setNotes(notes.isEmpty() ? null : notes);
            }
        }

        SavedGrant saved = savedGrantRepository.save(entity);
        return toResponse(saved);
    }

    @Transactional
    public void unsave(Long userId, Long grantId) {
        savedGrantRepository.deleteByUserIdAndGrantId(userId, grantId);
    }

    @Transactional(readOnly = true)
    public boolean isSaved(Long userId, Long grantId) {
        return savedGrantRepository.existsByUserIdAndGrantId(userId, grantId);
    }

    private SavedGrantResponse toResponse(SavedGrant sg) {
        return SavedGrantResponse.builder()
                .id(sg.getId())
                .grant(grantService.mapToResponse(sg.getGrant()))
                .status(sg.getStatus() == null ? SavedGrantStatus.INTERESTED : sg.getStatus())
                .notes(sg.getNotes())
                .savedAt(sg.getSavedAt())
                .updatedAt(sg.getUpdatedAt())
                .build();
    }
}
