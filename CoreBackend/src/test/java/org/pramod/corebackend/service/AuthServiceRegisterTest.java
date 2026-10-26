package org.pramod.corebackend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pramod.corebackend.dto.auth.AuthResponse;
import org.pramod.corebackend.dto.auth.RegisterRequest;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.enums.Role;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.repository.RefreshTokenRepository;
import org.pramod.corebackend.security.JwtService;
import org.pramod.corebackend.security.OwnerAccess;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Sign-up can never create an admin, not even with the owner's email. */
@ExtendWith(MockitoExtension.class)
class AuthServiceRegisterTest {

    @Mock private AppUserRepository appUserRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private AuthenticationManager authenticationManager;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private JwtService jwtService;

    @Test
    void everyNewAccountIsAUser() {
        AuthService service = new AuthService(appUserRepository, refreshTokenRepository, authenticationManager,
                passwordEncoder, jwtService, new OwnerAccess("owner@example.com"));
        when(appUserRepository.save(any(AppUser.class))).thenAnswer(call -> {
            AppUser saved = call.getArgument(0);
            saved.setId(9L);
            return saved;
        });
        when(jwtService.getRefreshTokenExpiryInstant()).thenReturn(Instant.now().plusSeconds(3600));

        RegisterRequest request = new RegisterRequest();
        request.setFullName("Someone");
        request.setEmail("owner@example.com");
        request.setPassword("long-enough-password");
        AuthResponse response = service.register(request);

        ArgumentCaptor<AppUser> saved = ArgumentCaptor.forClass(AppUser.class);
        verify(appUserRepository).save(saved.capture());
        assertEquals(Role.USER, saved.getValue().getRole());
        assertEquals("USER", response.getUser().getRole());
    }

    @Test
    void theSignUpRequestHasNoRoleToSet() {
        boolean hasRole = Arrays.stream(RegisterRequest.class.getDeclaredFields())
                .anyMatch(field -> field.getName().toLowerCase().contains("role"));
        assertFalse(hasRole, "RegisterRequest must not carry a role");
    }
}
