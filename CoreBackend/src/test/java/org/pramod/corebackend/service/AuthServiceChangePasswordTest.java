package org.pramod.corebackend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pramod.corebackend.dto.auth.AuthResponse;
import org.pramod.corebackend.dto.auth.ChangePasswordRequest;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.enums.Role;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.repository.RefreshTokenRepository;
import org.pramod.corebackend.security.JwtService;
import org.pramod.corebackend.security.OwnerAccess;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceChangePasswordTest {

    @Mock private AppUserRepository appUserRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private AuthenticationManager authenticationManager;
    @Mock private JwtService jwtService;

    /** A real encoder (low cost, for speed), so the test checks real hashes. */
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder(4);

    private AuthService service;
    private AppUser user;

    @BeforeEach
    void setUp() {
        service = new AuthService(appUserRepository, refreshTokenRepository, authenticationManager,
                passwordEncoder, jwtService, new OwnerAccess(""));
        user = AppUser.builder().id(3L).fullName("Someone").email("someone@example.com")
                .passwordHash(passwordEncoder.encode("old-password")).role(Role.USER).build();
        when(appUserRepository.findById(3L)).thenReturn(Optional.of(user));
    }

    private static ChangePasswordRequest request(String current, String next) {
        ChangePasswordRequest request = new ChangePasswordRequest();
        request.setCurrentPassword(current);
        request.setNewPassword(next);
        return request;
    }

    @Test
    void changesThePasswordAndSignsOutOtherDevices() {
        when(jwtService.generateAccessToken(any())).thenReturn("new-access");
        when(jwtService.generateRefreshToken(any())).thenReturn("new-refresh");
        when(jwtService.getRefreshTokenExpiryInstant()).thenReturn(Instant.now().plusSeconds(3600));

        AuthResponse response = service.changePassword(3L, request("old-password", "a-new-password"));

        assertTrue(passwordEncoder.matches("a-new-password", user.getPasswordHash()));
        verify(appUserRepository).save(user);
        // Deleting every refresh token is what signs the other devices out.
        verify(refreshTokenRepository).deleteByUser(user);
        assertEquals("new-access", response.getAccessToken());
        assertEquals("new-refresh", response.getRefreshToken());
    }

    @Test
    void aWrongCurrentPasswordIsRefusedWithoutSigningTheUserOut() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.changePassword(3L, request("not-my-password", "a-new-password")));

        // 400, not 401/403, which the frontend would treat as an expired session.
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(passwordEncoder.matches("old-password", user.getPasswordHash()));
        verify(appUserRepository, never()).save(any());
        verifyNoInteractions(refreshTokenRepository);
    }

    @Test
    void aShortNewPasswordIsRefused() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.changePassword(3L, request("old-password", "short")));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(appUserRepository, never()).save(any());
    }

    @Test
    void theNewPasswordMustDifferFromTheCurrentOne() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.changePassword(3L, request("old-password", "old-password")));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        verify(appUserRepository, never()).save(any());
    }
}
