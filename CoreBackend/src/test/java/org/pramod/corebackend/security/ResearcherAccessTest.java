package org.pramod.corebackend.security;

import org.junit.jupiter.api.Test;
import org.pramod.corebackend.controller.ResearcherController;
import org.pramod.corebackend.dto.ResearcherResponse;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.enums.Role;
import org.pramod.corebackend.service.AiProfileMapper;
import org.pramod.corebackend.service.AiServiceClient;
import org.pramod.corebackend.service.GrantService;
import org.pramod.corebackend.service.OrcidEnrichmentService;
import org.pramod.corebackend.service.ResearcherPhotoService;
import org.pramod.corebackend.service.ResearcherService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Runs requests through the real security rules: a user can reach only their
 * own profile (through /me), and only an admin can list, search, or read,
 * edit or delete a profile by id.
 */
@WebMvcTest(ResearcherController.class)
@Import(SecurityConfig.class)
class ResearcherAccessTest {

    @Autowired
    private MockMvc mvc;

    @MockitoBean
    private ResearcherService researcherService;
    @MockitoBean
    private ResearcherPhotoService researcherPhotoService;
    @MockitoBean
    private AiServiceClient aiServiceClient;
    @MockitoBean
    private GrantService grantService;
    @MockitoBean
    private AiProfileMapper aiProfileMapper;
    @MockitoBean
    private OrcidEnrichmentService orcidEnrichmentService;
    @MockitoBean
    private JwtService jwtService;
    @MockitoBean
    private CustomUserDetailsService customUserDetailsService;

    private static RequestPostProcessor signedInAs(long id, Role role) {
        AppUser account = AppUser.builder().id(id).fullName("Someone").email(id + "@example.com")
                .passwordHash("x").role(role).build();
        return user(new UserPrincipal(account));
    }

    private static final RequestPostProcessor USER = signedInAs(1L, Role.USER);
    private static final RequestPostProcessor ADMIN = signedInAs(2L, Role.ADMIN);

    @Test
    void aUserCanReachTheirOwnProfile() throws Exception {
        when(researcherService.getResearcherByUserId(1L)).thenReturn(ResearcherResponse.builder().id(7L).build());
        when(researcherService.createOrUpdateForUser(eq(1L), any())).thenReturn(ResearcherResponse.builder().id(7L).build());

        mvc.perform(get("/api/researchers/me").with(USER)).andExpect(status().isOk());
        mvc.perform(put("/api/researchers/me").with(USER).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/researchers").with(USER).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/researchers/me/photo").with(USER)).andExpect(status().isNoContent());
    }

    @Test
    void aUserCannotListOrSearchProfiles() throws Exception {
        mvc.perform(get("/api/researchers").with(USER)).andExpect(status().isForbidden());
        mvc.perform(get("/api/researchers/filter/country/India").with(USER)).andExpect(status().isForbidden());
        mvc.perform(get("/api/researchers/filter/user-type/ACADEMIC").with(USER)).andExpect(status().isForbidden());
        mvc.perform(get("/api/researchers/search/institution").param("name", "IISc").with(USER))
                .andExpect(status().isForbidden());

        verifyNoInteractions(researcherService);
    }

    @Test
    void aUserCannotReadEditOrDeleteAnotherProfileById() throws Exception {
        mvc.perform(get("/api/researchers/5").with(USER)).andExpect(status().isForbidden());
        mvc.perform(put("/api/researchers/5").with(USER).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/researchers/5").with(USER)).andExpect(status().isForbidden());

        verify(researcherService, never()).updateResearcher(anyLong(), any());
        verify(researcherService, never()).deleteResearcher(anyLong());
    }

    @Test
    void anAdminCanListAndReadProfiles() throws Exception {
        when(researcherService.getAllResearchers()).thenReturn(List.of());
        when(researcherService.getResearcherById(5L)).thenReturn(ResearcherResponse.builder().id(5L).build());

        mvc.perform(get("/api/researchers").with(ADMIN)).andExpect(status().isOk());
        mvc.perform(get("/api/researchers/5").with(ADMIN)).andExpect(status().isOk());
    }

    @Test
    void someoneNotSignedInIsTurnedAway() throws Exception {
        mvc.perform(get("/api/researchers/me")).andExpect(status().is4xxClientError());
        mvc.perform(get("/api/researchers/5")).andExpect(status().is4xxClientError());

        verifyNoInteractions(researcherService);
    }
}
