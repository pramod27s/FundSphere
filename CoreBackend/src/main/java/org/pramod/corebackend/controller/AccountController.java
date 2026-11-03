package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.auth.AuthResponse;
import org.pramod.corebackend.dto.auth.ChangePasswordRequest;
import org.pramod.corebackend.dto.auth.DeleteAccountRequest;
import org.pramod.corebackend.security.UserPrincipal;
import org.pramod.corebackend.service.AccountService;
import org.pramod.corebackend.service.AuthService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.Map;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

/**
 * The signed-in user's own account: change the password, download a copy of
 * their data, or delete the account. Kept off /api/auth, which is open to
 * everyone, so every call here needs a signed-in user.
 */
@RestController
@RequestMapping("/api/account")
@RequiredArgsConstructor
public class AccountController {

    private final AuthService authService;
    private final AccountService accountService;

    /** Returns new tokens for this browser; the user's other devices are signed out. */
    @PostMapping("/password")
    public ResponseEntity<AuthResponse> changePassword(@AuthenticationPrincipal UserPrincipal principal,
                                                       @RequestBody ChangePasswordRequest request) {
        return ResponseEntity.ok(authService.changePassword(requireUserId(principal), request));
    }

    @GetMapping("/export")
    public ResponseEntity<Map<String, Object>> export(@AuthenticationPrincipal UserPrincipal principal) {
        String fileName = "fundsphere-my-data-" + LocalDate.now() + ".json";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(fileName).build().toString())
                .body(accountService.export(requireUserId(principal)));
    }

    @DeleteMapping
    public ResponseEntity<Void> deleteAccount(@AuthenticationPrincipal UserPrincipal principal,
                                              @RequestBody DeleteAccountRequest request) {
        accountService.deleteAccount(requireUserId(principal), request.getPassword());
        return ResponseEntity.noContent().build();
    }

    private static Long requireUserId(UserPrincipal principal) {
        if (principal == null || principal.getId() == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "Authentication required");
        }
        return principal.getId();
    }
}
