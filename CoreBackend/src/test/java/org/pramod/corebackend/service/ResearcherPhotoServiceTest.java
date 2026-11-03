package org.pramod.corebackend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pramod.corebackend.entity.Researcher;
import org.pramod.corebackend.entity.ResearcherPhoto;
import org.pramod.corebackend.repository.ResearcherPhotoRepository;
import org.pramod.corebackend.repository.ResearcherRepository;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ResearcherPhotoServiceTest {

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0x10};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0};
    private static final byte[] WEBP = "RIFF\0\0\0\0WEBPVP8 ".getBytes(StandardCharsets.ISO_8859_1);

    @Mock
    private ResearcherRepository researcherRepository;
    @Mock
    private ResearcherPhotoRepository photoRepository;

    private ResearcherPhotoService service;
    private Researcher researcher;

    @BeforeEach
    void setUp() {
        service = new ResearcherPhotoService(researcherRepository, photoRepository);
        researcher = Researcher.builder().id(7L).build();
    }

    @Test
    void recognisesJpegPngAndWebpFromTheirFirstBytes() {
        assertEquals("image/jpeg", ResearcherPhotoService.detectImageType(JPEG));
        assertEquals("image/png", ResearcherPhotoService.detectImageType(PNG));
        assertEquals("image/webp", ResearcherPhotoService.detectImageType(WEBP));
    }

    @Test
    void rejectsFilesThatAreNotImages() {
        assertNull(ResearcherPhotoService.detectImageType("<html><script>".getBytes(StandardCharsets.UTF_8)));
        assertNull(ResearcherPhotoService.detectImageType("%PDF-1.7".getBytes(StandardCharsets.UTF_8)));
        assertNull(ResearcherPhotoService.detectImageType(new byte[]{(byte) 0xFF}));
    }

    @Test
    void savesANewPhotoWithTheTypeTakenFromTheBytes() {
        when(researcherRepository.findByUserId(1L)).thenReturn(Optional.of(researcher));
        when(photoRepository.findById(7L)).thenReturn(Optional.empty());

        service.savePhoto(1L, PNG);

        ArgumentCaptor<ResearcherPhoto> saved = ArgumentCaptor.forClass(ResearcherPhoto.class);
        verify(photoRepository).save(saved.capture());
        assertSame(researcher, saved.getValue().getResearcher());
        assertEquals("image/png", saved.getValue().getContentType());
        assertArrayEquals(PNG, saved.getValue().getData());
    }

    @Test
    void replacesTheExistingPhoto() {
        ResearcherPhoto existing = ResearcherPhoto.builder()
                .researcherId(7L).researcher(researcher).contentType("image/png").data(PNG).build();
        when(researcherRepository.findByUserId(1L)).thenReturn(Optional.of(researcher));
        when(photoRepository.findById(7L)).thenReturn(Optional.of(existing));

        service.savePhoto(1L, JPEG);

        verify(photoRepository).save(existing);
        assertEquals("image/jpeg", existing.getContentType());
        assertArrayEquals(JPEG, existing.getData());
    }

    @Test
    void refusesAFileThatIsNotAnImage() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.savePhoto(1L, "<svg onload=alert(1)>".getBytes(StandardCharsets.UTF_8)));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(photoRepository, never()).save(any());
    }

    @Test
    void refusesAPhotoOverTwoMegabytes() {
        byte[] big = new byte[(int) ResearcherPhotoService.MAX_PHOTO_BYTES + 1];
        System.arraycopy(JPEG, 0, big, 0, JPEG.length);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.savePhoto(1L, big));

        assertEquals(HttpStatus.CONTENT_TOO_LARGE, ex.getStatusCode());
        verify(photoRepository, never()).save(any());
    }

    @Test
    void needsAProfileBeforeAPhotoCanBeAdded() {
        when(researcherRepository.findByUserId(1L)).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.savePhoto(1L, JPEG));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    @Test
    void hasNoPhotoForAUserWithoutAProfile() {
        when(researcherRepository.findByUserId(1L)).thenReturn(Optional.empty());

        assertTrue(service.findPhoto(1L).isEmpty());
        verifyNoInteractions(photoRepository);
    }
}
