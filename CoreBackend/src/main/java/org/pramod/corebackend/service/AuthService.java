/**
 * This file contains the AuthService class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.auth.*;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.entity.RefreshToken;
import org.pramod.corebackend.enums.Role;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.repository.RefreshTokenRepository;
import org.pramod.corebackend.security.JwtService;
import org.pramod.corebackend.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final AppUserRepository appUserRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final AuthenticationManager authenticationManager;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        validateRegisterRequest(request);
        String email = request.getEmail().trim().toLowerCase();

        if (appUserRepository.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email is already registered");
        }

        AppUser user = AppUser.builder()
                .fullName(request.getFullName().trim())
                .email(email)
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .role(Role.USER)
                .build();

        AppUser saved = appUserRepository.save(user);
        return issueTokens(saved);
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        if (!StringUtils.hasText(request.getEmail()) || !StringUtils.hasText(request.getPassword())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email and password are required");
        }

        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getEmail().trim().toLowerCase(), request.getPassword())
        );

        UserPrincipal principal = (UserPrincipal) authentication.getPrincipal();
        AppUser user = appUserRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials"));

        return issueTokens(user);
    }

    @Transactional
    public AuthResponse refresh(RefreshTokenRequest request) {
        if (request == null || !StringUtils.hasText(request.getRefreshToken())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "refreshToken is required");
        }

        RefreshToken tokenEntity = refreshTokenRepository.findByToken(request.getRefreshToken())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid refresh token"));

        if (tokenEntity.isRevoked() || tokenEntity.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token is expired or revoked");
        }

        if (!jwtService.isRefreshToken(tokenEntity.getToken())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid refresh token type");
        }

        AppUser user = tokenEntity.getUser();

        tokenEntity.setRevoked(true);
        refreshTokenRepository.save(tokenEntity);

        return issueTokens(user);
    }

    @Transactional
    public void logout(RefreshTokenRequest request) {
        if (request == null || !StringUtils.hasText(request.getRefreshToken())) {
            return;
        }

        refreshTokenRepository.findByToken(request.getRefreshToken()).ifPresent(tokenEntity -> {
            tokenEntity.setRevoked(true);
            refreshTokenRepository.save(tokenEntity);
        });
    }

    private void validateRegisterRequest(RegisterRequest request) {
        if (!StringUtils.hasText(request.getFullName()) || !StringUtils.hasText(request.getEmail()) || !StringUtils.hasText(request.getPassword())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "fullName, email and password are required");
        }
        if (request.getPassword().length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password must be at least 8 characters");
        }
    }

    private AuthResponse issueTokens(AppUser user) {
        UserPrincipal principal = new UserPrincipal(user);
        String accessToken = jwtService.generateAccessToken(principal);
        String refreshToken = jwtService.generateRefreshToken(principal);

        refreshTokenRepository.deleteByUser(user);
        refreshTokenRepository.save(RefreshToken.builder()
                .user(user)
                .token(refreshToken)
                .expiresAt(LocalDateTime.ofInstant(jwtService.getRefreshTokenExpiryInstant(), java.time.ZoneOffset.UTC))
                .revoked(false)
                .build());

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(jwtService.getAccessTokenExpirationMs() / 1000)
                .user(AuthUserResponse.builder()
                        .id(user.getId())
                        .fullName(user.getFullName())
                        .email(user.getEmail())
                        .role(user.getRole().name())
                        .build())
                .build();
    }
}


