package org.pramod.corebackend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.entity.Researcher;
import org.pramod.corebackend.enums.Role;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.repository.ApplicationRepository;
import org.pramod.corebackend.repository.AwardRepository;
import org.pramod.corebackend.repository.ProposalReviewRepository;
import org.pramod.corebackend.repository.RefreshTokenRepository;
import org.pramod.corebackend.repository.ResearcherPhotoRepository;
import org.pramod.corebackend.repository.ResearcherRepository;
import org.pramod.corebackend.repository.SavedGrantRepository;
import org.pramod.corebackend.security.OwnerAccess;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AccountServiceTest {

    @Mock private AppUserRepository appUserRepository;
    @Mock private ResearcherRepository researcherRepository;
    @Mock private ResearcherPhotoRepository researcherPhotoRepository;
    @Mock private SavedGrantRepository savedGrantRepository;
    @Mock private ApplicationRepository applicationRepository;
    @Mock private AwardRepository awardRepository;
    @Mock private ProposalReviewRepository proposalReviewRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private OwnerAccess ownerAccess;
    @Mock private ResearcherService researcherService;
    @Mock private SavedGrantService savedGrantService;
    @Mock private ApplicationService applicationService;
    @Mock private AwardService awardService;
    @Mock private AwardOutputService awardOutputService;
    @Mock private ProgressReportService progressReportService;
    @Mock private ProposalReviewService proposalReviewService;

    @InjectMocks
    private AccountService service;

    private AppUser user;

    @BeforeEach
    void setUp() {
        user = AppUser.builder().id(3L).fullName("Someone").email("someone@example.com")
                .passwordHash("hash").role(Role.USER).build();
        when(appUserRepository.findById(3L)).thenReturn(Optional.of(user));
    }

    @Test
    void deletesEverythingTheUserOwnsInAnOrderTheForeignKeysAllow() {
        Researcher researcher = Researcher.builder().id(7L).build();
        when(passwordEncoder.matches("my-password", "hash")).thenReturn(true);
        when(researcherRepository.findByUserId(3L)).thenReturn(Optional.of(researcher));

        service.deleteAccount(3L, "my-password");

        InOrder order = inOrder(proposalReviewRepository, awardRepository, applicationRepository,
                savedGrantRepository, researcherPhotoRepository, researcherRepository,
                refreshTokenRepository, appUserRepository);
        // Reviews and grants point at applications, so they go first.
        order.verify(proposalReviewRepository).deleteByOwnerId(3L);
        order.verify(awardRepository).deleteByOwnerId(3L);
        order.verify(applicationRepository).deleteByOwnerId(3L);
        order.verify(savedGrantRepository).deleteByUserId(3L);
        order.verify(researcherPhotoRepository).deleteById(7L);
        order.verify(researcherRepository).delete(researcher);
        order.verify(refreshTokenRepository).deleteByUser(user);
        order.verify(appUserRepository).delete(user);
    }

    @Test
    void aWrongPasswordDeletesNothing() {
        when(passwordEncoder.matches("wrong", "hash")).thenReturn(false);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.deleteAccount(3L, "wrong"));

        // 400, not 401/403, which the frontend would treat as an expired session.
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(appUserRepository, never()).delete(any());
        verifyNoInteractions(proposalReviewRepository, awardRepository, applicationRepository, savedGrantRepository);
    }

    @Test
    void theOwnerAccountCannotBeDeleted() {
        when(passwordEncoder.matches("my-password", "hash")).thenReturn(true);
        when(ownerAccess.isOwner("someone@example.com")).thenReturn(true);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.deleteAccount(3L, "my-password"));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        verify(appUserRepository, never()).delete(any());
        verify(applicationRepository, never()).deleteByOwnerId(anyLong());
    }
}
