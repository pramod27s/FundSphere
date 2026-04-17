/**
 * This file contains the AuthController class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.auth.AuthResponse;
import org.pramod.corebackend.dto.auth.AuthUserResponse;
import org.pramod.corebackend.dto.auth.LoginRequest;
import org.pramod.corebackend.dto.auth.RefreshTokenRequest;
import org.pramod.corebackend.dto.auth.RegisterRequest;
import org.pramod.corebackend.security.UserPrincipal;
import org.pramod.corebackend.service.AuthService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    /**
     * Registers a new user into the system.
     * @param request Contains the user's registration details (email, password, etc.)
     * @return AuthResponse containing the JWT token and user info.
     */
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@RequestBody RegisterRequest request) {
        return ResponseEntity.ok(authService.register(request));
    }

    /**
     * Authenticates a user and generates a JWT token.
     * @param request Contains the user's email and password.
     * @return AuthResponse containing the JWT access token, refresh token, and user info.
     */
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    /**
     * Refreshes the JWT access token using a valid refresh token.
     * @param request Contains the refresh token.
     * @return A new AuthResponse with fresh tokens.
     */
    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@RequestBody RefreshTokenRequest request) {
        return ResponseEntity.ok(authService.refresh(request));
    }

    /**
     * Logs out the user by invalidating their refresh token.
     * @param request Contains the refresh token to be invalidated.
     * @return Success message.
     */
    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(@RequestBody(required = false) RefreshTokenRequest request) {
        authService.logout(request);
        return ResponseEntity.ok(Map.of("message", "Logged out"));
    }

    /**
     * Retrieves the currently authenticated user's details.
     * @param principal The security principal extracted from the JWT token.
     * @return User details (ID, full name, email, role).
     */
    @GetMapping("/me")
    public ResponseEntity<AuthUserResponse> me(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(AuthUserResponse.builder()
                .id(principal.getId())
                .fullName(principal.getFullName())
                .email(principal.getEmail())
                .role(principal.getRole())
                .build());
    }
}
