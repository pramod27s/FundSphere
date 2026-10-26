/**
 * The admin list (2nd.md, Part A). Every route needs the ADMIN role
 * (SecurityConfig) and the owner (AdminUserService): other admins can't
 * see or change who the admins are.
 *
 * GET    /api/admin/admins          -> the admins, owner first
 * POST   /api/admin/admins          -> make an existing account an admin
 * DELETE /api/admin/admins/{userId} -> make an admin a normal user again
 */
package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.admin.AddAdminRequest;
import org.pramod.corebackend.dto.admin.AdminUserResponse;
import org.pramod.corebackend.security.UserPrincipal;
import org.pramod.corebackend.service.AdminUserService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin/admins")
@RequiredArgsConstructor
public class AdminUserController {

    private final AdminUserService adminUserService;

    @GetMapping
    public ResponseEntity<List<AdminUserResponse>> listAdmins(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(adminUserService.listAdmins(principal));
    }

    @PostMapping
    public ResponseEntity<AdminUserResponse> addAdmin(@AuthenticationPrincipal UserPrincipal principal,
                                                      @RequestBody AddAdminRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(adminUserService.addAdmin(principal, request == null ? null : request.getEmail()));
    }

    @DeleteMapping("/{userId}")
    public ResponseEntity<Void> removeAdmin(@AuthenticationPrincipal UserPrincipal principal,
                                            @PathVariable Long userId) {
        adminUserService.removeAdmin(principal, userId);
        return ResponseEntity.noContent().build();
    }
}
