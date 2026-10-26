package org.pramod.corebackend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pramod.corebackend.dto.admin.AdminUserResponse;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.enums.Role;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.security.OwnerAccess;
import org.pramod.corebackend.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AdminUserServiceTest {

    private static final String OWNER_EMAIL = "owner@example.com";

    @Mock
    private AppUserRepository appUserRepository;

    private AdminUserService service;
    private AppUser owner;
    private AppUser admin;
    private AppUser user;

    @BeforeEach
    void setUp() {
        service = new AdminUserService(appUserRepository, new OwnerAccess("  Owner@Example.com "));
        owner = AppUser.builder().id(1L).fullName("Owner").email(OWNER_EMAIL).passwordHash("x").role(Role.ADMIN).build();
        admin = AppUser.builder().id(2L).fullName("Admin").email("admin@example.com").passwordHash("x").role(Role.ADMIN).build();
        user = AppUser.builder().id(3L).fullName("User").email("user@example.com").passwordHash("x").role(Role.USER).build();
    }

    @Test
    void ownerMakesAnExistingAccountAnAdmin() {
        when(appUserRepository.findByEmailIgnoreCase("user@example.com")).thenReturn(Optional.of(user));
        when(appUserRepository.save(any(AppUser.class))).thenAnswer(call -> call.getArgument(0));

        AdminUserResponse added = service.addAdmin(new UserPrincipal(owner), " user@example.com ");

        assertEquals(Role.ADMIN, user.getRole());
        assertEquals("user@example.com", added.getEmail());
        assertFalse(added.isOwner());
    }

    @Test
    void anAdminWhoIsNotTheOwnerCannotAddAdmins() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.addAdmin(new UserPrincipal(admin), "user@example.com"));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        verify(appUserRepository, never()).save(any());
        assertEquals(Role.USER, user.getRole());
    }

    @Test
    void anEmailWithNoAccountIsRefusedNotPreApproved() {
        when(appUserRepository.findByEmailIgnoreCase("nobody@example.com")).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.addAdmin(new UserPrincipal(owner), "nobody@example.com"));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        verify(appUserRepository, never()).save(any());
    }

    @Test
    void addingAnExistingAdminIsAConflict() {
        when(appUserRepository.findByEmailIgnoreCase("admin@example.com")).thenReturn(Optional.of(admin));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.addAdmin(new UserPrincipal(owner), "admin@example.com"));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
    }

    @Test
    void anEmptyEmailIsABadRequest() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.addAdmin(new UserPrincipal(owner), "  "));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void ownerRemovesAnAdmin() {
        when(appUserRepository.findById(2L)).thenReturn(Optional.of(admin));

        service.removeAdmin(new UserPrincipal(owner), 2L);

        assertEquals(Role.USER, admin.getRole());
        verify(appUserRepository).save(admin);
    }

    @Test
    void theOwnerCannotBeRemoved() {
        when(appUserRepository.findById(1L)).thenReturn(Optional.of(owner));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.removeAdmin(new UserPrincipal(owner), 1L));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertEquals(Role.ADMIN, owner.getRole());
    }

    @Test
    void anAdminWhoIsNotTheOwnerCannotRemoveAdmins() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.removeAdmin(new UserPrincipal(admin), 1L));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        verify(appUserRepository, never()).save(any());
    }

    @Test
    void removingSomeoneWhoIsNotAnAdminIsNotFound() {
        when(appUserRepository.findById(3L)).thenReturn(Optional.of(user));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.removeAdmin(new UserPrincipal(owner), 3L));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    @Test
    void theListPutsTheOwnerFirst() {
        when(appUserRepository.findAllByRoleOrderByFullNameAsc(Role.ADMIN)).thenReturn(List.of(admin, owner));

        List<AdminUserResponse> admins = service.listAdmins(new UserPrincipal(owner));

        assertEquals(List.of("Owner", "Admin"), admins.stream().map(AdminUserResponse::getFullName).toList());
        assertTrue(admins.get(0).isOwner());
    }

    @Test
    void anAdminWhoIsNotTheOwnerCannotSeeTheList() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.listAdmins(new UserPrincipal(admin)));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
        verify(appUserRepository, never()).findAllByRoleOrderByFullNameAsc(any());
    }

    @Test
    void withoutAnOwnerNobodyCanAddAdmins() {
        AdminUserService noOwner = new AdminUserService(appUserRepository, new OwnerAccess(""));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> noOwner.addAdmin(new UserPrincipal(owner), "user@example.com"));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }
}
