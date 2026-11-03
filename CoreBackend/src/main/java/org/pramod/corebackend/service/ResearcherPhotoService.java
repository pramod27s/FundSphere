package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.entity.Researcher;
import org.pramod.corebackend.entity.ResearcherPhoto;
import org.pramod.corebackend.repository.ResearcherPhotoRepository;
import org.pramod.corebackend.repository.ResearcherRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONTENT_TOO_LARGE;
import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * Stores each researcher's profile photo in PostgreSQL, so it shows on every
 * device they sign in from. The browser shrinks photos to about 30 KB before
 * uploading; the limit here only stops oversized uploads.
 */
@Service
@RequiredArgsConstructor
public class ResearcherPhotoService {

    static final long MAX_PHOTO_BYTES = 2L * 1024 * 1024;

    private final ResearcherRepository researcherRepository;
    private final ResearcherPhotoRepository photoRepository;

    @Transactional
    public void savePhoto(Long userId, byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new ResponseStatusException(BAD_REQUEST, "Choose a photo to upload");
        }
        if (bytes.length > MAX_PHOTO_BYTES) {
            throw new ResponseStatusException(CONTENT_TOO_LARGE, "The photo is larger than 2 MB");
        }
        String contentType = detectImageType(bytes);
        if (contentType == null) {
            throw new ResponseStatusException(BAD_REQUEST, "The photo must be a JPEG, PNG or WebP image");
        }
        Researcher researcher = researcherRepository.findByUserId(userId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Create your profile before adding a photo"));

        ResearcherPhoto photo = photoRepository.findById(researcher.getId())
                .orElseGet(() -> ResearcherPhoto.builder().researcher(researcher).build());
        photo.setContentType(contentType);
        photo.setData(bytes);
        photoRepository.save(photo);
    }

    /** Empty when the user has no profile yet or hasn't added a photo. */
    @Transactional(readOnly = true)
    public Optional<ResearcherPhoto> findPhoto(Long userId) {
        return researcherRepository.findByUserId(userId)
                .flatMap(researcher -> photoRepository.findById(researcher.getId()));
    }

    @Transactional
    public void deletePhoto(Long userId) {
        researcherRepository.findByUserId(userId)
                .ifPresent(researcher -> photoRepository.deleteById(researcher.getId()));
    }

    /**
     * The image type from the file's first bytes, or null if it isn't a JPEG,
     * PNG or WebP. The upload's Content-Type header is set by the client, so
     * it isn't trusted.
     */
    static String detectImageType(byte[] b) {
        if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
            return "image/jpeg";
        }
        if (b.length >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G'
                && b[4] == 0x0D && b[5] == 0x0A && b[6] == 0x1A && b[7] == 0x0A) {
            return "image/png";
        }
        if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') {
            return "image/webp";
        }
        return null;
    }
}
