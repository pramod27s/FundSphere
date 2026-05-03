/**
 * Persists user grant bookmarks in postgres.
 * Each saved grant is one row in saved_grants linking the authenticated
 * AppUser to a Grant. Uniqueness is enforced by a composite constraint
 * on (user_id, grant_id) so save() is idempotent.
 */
package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.GrantResponse;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.entity.Grant;
import org.pramod.corebackend.entity.SavedGrant;
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

    private final SavedGrantRepository savedGrantRepository;
    private final AppUserRepository appUserRepository;
    private final GrantRepository grantRepository;
    private final GrantService grantService;

    @Transactional(readOnly = true)
    public List<GrantResponse> listSaved(Long userId) {
        return savedGrantRepository.findAllByUserIdWithGrant(userId).stream()
                .map(SavedGrant::getGrant)
                .map(grantService::mapToResponse)
                .toList();
    }

    @Transactional
    public GrantResponse save(Long userId, Long grantId) {
        if (savedGrantRepository.existsByUserIdAndGrantId(userId, grantId)) {
            return grantService.getGrantById(grantId);
        }
        AppUser user = appUserRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "User not found"));
        Grant grant = grantRepository.findById(grantId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Grant not found"));
        SavedGrant entity = SavedGrant.builder()
                .user(user)
                .grant(grant)
                .build();
        savedGrantRepository.save(entity);
        return grantService.mapToResponse(grant);
    }

    @Transactional
    public void unsave(Long userId, Long grantId) {
        savedGrantRepository.deleteByUserIdAndGrantId(userId, grantId);
    }

    @Transactional(readOnly = true)
    public boolean isSaved(Long userId, Long grantId) {
        return savedGrantRepository.existsByUserIdAndGrantId(userId, grantId);
    }
}
