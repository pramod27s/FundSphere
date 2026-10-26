package org.pramod.corebackend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pramod.corebackend.dto.GrantRequest;
import org.pramod.corebackend.dto.GrantResponse;
import org.pramod.corebackend.entity.Grant;
import org.pramod.corebackend.enums.GrantEntrySource;
import org.pramod.corebackend.repository.ApplicationRepository;
import org.pramod.corebackend.repository.GrantRepository;
import org.pramod.corebackend.repository.SavedGrantRepository;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

/** Grants added by hand (2nd.md, Part B): the scraper never changes them. */
@ExtendWith(MockitoExtension.class)
class GrantManualEntryTest {

    private static final String URL = "https://vgst.karnataka.gov.in/calls/seed-grant-2026";

    @Mock private GrantRepository grantRepository;
    @Mock private GrantIndexingService grantIndexingService;
    @Mock private SavedGrantRepository savedGrantRepository;
    @Mock private ApplicationRepository applicationRepository;

    private GrantService service;
    private Grant manual;

    @BeforeEach
    void setUp() {
        service = new GrantService(grantRepository, grantIndexingService, savedGrantRepository, applicationRepository);
        manual = Grant.builder()
                .id(40L)
                .grantTitle("VGST Seed Grant for Young Faculty")
                .fundingAgency("Vision Group on Science and Technology")
                .grantUrl(URL)
                .applicationLink(URL)
                .checksum("manual:abc")
                .entrySource(GrantEntrySource.MANUAL)
                .checkedByName("Pramod M B")
                .build();
    }

    private GrantRequest scraped(String title) {
        return GrantRequest.builder()
                .grantTitle(title)
                .fundingAgency("Vision Group on Science and Technology")
                .grantUrl(URL)
                .applicationLink(URL)
                .checksum("scraped-hash")
                .build();
    }

    @Test
    void aScraperSaveNeverOverwritesAManualGrant() {
        when(grantRepository.findFirstByGrantUrlIn(anyList())).thenReturn(Optional.of(manual));

        GrantService.SaveOrUpdateResult result = service.saveOrUpdateGrant(scraped("Something the scraper guessed"));

        assertFalse(result.created());
        assertEquals("VGST Seed Grant for Young Faculty", manual.getGrantTitle());
        assertEquals("manual:abc", manual.getChecksum());
        verify(grantRepository, never()).save(any());
        verifyNoInteractions(grantIndexingService);
    }

    @Test
    void aScrapedCopyIsNotMergedIntoAManualGrant() {
        when(grantRepository.findFirstByGrantUrlIn(anyList())).thenReturn(Optional.empty());
        when(grantRepository.findFirstByApplicationLinkIgnoreCase(URL)).thenReturn(Optional.of(manual));
        GrantRequest copy = scraped("VGST Seed Grant for Young Faculty");
        copy.setGrantUrl("https://example.org/aggregator/vgst-seed-grant");

        GrantService.SaveOrUpdateResult result = service.saveOrUpdateGrant(copy);

        assertFalse(result.created());
        assertEquals(40L, result.response().getId());
        assertEquals(URL, manual.getGrantUrl());
        verify(grantRepository, never()).save(any());
    }

    @Test
    void theScraperCleanupLeavesManualGrants() {
        when(grantRepository.findFirstByGrantUrlIn(anyList())).thenReturn(Optional.of(manual));

        assertTrue(service.deleteGrantByUrl(URL).isEmpty());
        verify(grantRepository, never()).deleteById(any());
    }

    @Test
    void newScrapedGrantsAreMarkedScraped() {
        when(grantRepository.findFirstByGrantUrlIn(anyList())).thenReturn(Optional.empty());
        when(grantRepository.save(any(Grant.class))).thenAnswer(call -> {
            Grant saved = call.getArgument(0);
            saved.setId(41L);
            return saved;
        });

        service.saveOrUpdateGrant(scraped("A new call"));

        ArgumentCaptor<Grant> saved = ArgumentCaptor.forClass(Grant.class);
        verify(grantRepository).save(saved.capture());
        assertEquals(GrantEntrySource.SCRAPED, saved.getValue().getEntrySource());
    }

    @Test
    void anAdminsGrantIsSavedAsCheckedAndIndexed() {
        when(grantRepository.findFirstByGrantUrlIn(anyList())).thenReturn(Optional.empty());
        when(grantRepository.save(any(Grant.class))).thenAnswer(call -> {
            Grant saved = call.getArgument(0);
            saved.setId(42L);
            return saved;
        });
        GrantRequest request = scraped("  VGST Seed Grant for Young Faculty  ");
        request.setGrantUrl(URL + "/");
        request.setChecksum(null);

        GrantResponse response = service.createManualGrant(request, 1L, "Pramod M B");

        ArgumentCaptor<Grant> saved = ArgumentCaptor.forClass(Grant.class);
        verify(grantRepository).save(saved.capture());
        Grant grant = saved.getValue();
        assertEquals(GrantEntrySource.MANUAL, grant.getEntrySource());
        assertEquals("VGST Seed Grant for Young Faculty", grant.getGrantTitle());
        assertEquals(URL, grant.getGrantUrl());
        assertEquals(1L, grant.getCheckedById());
        assertEquals("Pramod M B", grant.getCheckedByName());
        assertNotNull(grant.getCheckedAt());
        assertTrue(grant.getChecksum().startsWith("manual:"));
        assertTrue(grant.isNeedsReindex());
        assertEquals("MANUAL", response.getEntrySource());
        verify(grantIndexingService).tryIndexAsync(42L);
    }

    @Test
    void aCallAlreadyInFundSphereIsAConflict() {
        when(grantRepository.findFirstByGrantUrlIn(anyList())).thenReturn(Optional.of(manual));

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.createManualGrant(scraped("Again"), 1L, "Pramod M B"));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        verify(grantRepository, never()).save(any());
    }

    @Test
    void anAdminsGrantNeedsATitleAndAWebLink() {
        GrantRequest noTitle = scraped(" ");
        GrantRequest noLink = scraped("A call");
        noLink.setGrantUrl("vgst.karnataka.gov.in/call");

        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> service.createManualGrant(noTitle, 1L, "Pramod M B")).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> service.createManualGrant(noLink, 1L, "Pramod M B")).getStatusCode());
        verify(grantRepository, never()).save(any());
    }

    @Test
    void theSameUrlComesFirstAmongPossibleDuplicates() {
        when(grantRepository.findFirstByGrantUrlIn(anyList())).thenReturn(Optional.of(manual));
        when(grantRepository.findFirstByApplicationLinkIgnoreCase(URL)).thenReturn(Optional.of(manual));

        List<GrantService.PossibleDuplicate> found = service.findPossibleDuplicates(scraped("VGST Seed Grant for Young Faculty"));

        assertEquals(1, found.size(), "the same grant is listed once");
        assertTrue(found.get(0).sameUrl());
        assertEquals(40L, found.get(0).id());
    }
}
