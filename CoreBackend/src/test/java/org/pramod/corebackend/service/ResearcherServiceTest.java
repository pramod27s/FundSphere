package org.pramod.corebackend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.repository.ResearcherRepository;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ResearcherServiceTest {

    @Mock
    private ResearcherRepository researcherRepository;
    @Mock
    private AppUserRepository appUserRepository;

    private ResearcherService service;

    @BeforeEach
    void setUp() {
        service = new ResearcherService(researcherRepository, appUserRepository);
    }

    @Test
    void deletingAProfileThatDoesNotExistIsNotFound() {
        when(researcherRepository.existsById(99L)).thenReturn(false);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.deleteResearcher(99L));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        verify(researcherRepository, never()).deleteById(anyLong());
    }

    @Test
    void deletesAProfileThatExists() {
        when(researcherRepository.existsById(5L)).thenReturn(true);

        service.deleteResearcher(5L);

        verify(researcherRepository).deleteById(5L);
    }
}
