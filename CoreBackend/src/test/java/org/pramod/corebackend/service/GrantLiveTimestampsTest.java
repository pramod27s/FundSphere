package org.pramod.corebackend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pramod.corebackend.entity.Grant;
import org.pramod.corebackend.repository.ApplicationRepository;
import org.pramod.corebackend.repository.GrantRepository;
import org.pramod.corebackend.repository.SavedGrantRepository;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** AI results carry Pinecone's copies of the timestamps; the live ones replace them. */
@ExtendWith(MockitoExtension.class)
class GrantLiveTimestampsTest {

    @Mock private GrantRepository grantRepository;
    @Mock private GrantIndexingService grantIndexingService;
    @Mock private SavedGrantRepository savedGrantRepository;
    @Mock private ApplicationRepository applicationRepository;

    private GrantService service;

    @BeforeEach
    void setUp() {
        service = new GrantService(grantRepository, grantIndexingService, savedGrantRepository, applicationRepository);
    }

    private static Map<String, Object> item(Object grantId, Map<String, Object> fields) {
        Map<String, Object> item = new HashMap<>();
        item.put("grantId", grantId);
        item.put("fields", fields);
        return item;
    }

    @Test
    void replacesStaleIndexTimestampsWithLiveOnes() {
        LocalDateTime created = LocalDateTime.of(2026, 10, 5, 9, 0);
        LocalDateTime scraped = LocalDateTime.of(2026, 10, 12, 9, 0);
        LocalDateTime verified = LocalDateTime.of(2026, 10, 29, 22, 50);
        Grant grant = Grant.builder().id(39L).build();
        grant.setCreatedAt(created);
        grant.setUpdatedAt(scraped);
        grant.setLastScrapedAt(scraped);
        grant.setLastVerifiedAt(verified);
        when(grantRepository.findAllById(List.of(39L))).thenReturn(List.of(grant));

        Map<String, Object> fields = new HashMap<>(Map.of("last_scraped_at", "2026-10-05T09:00", "grant_title", "CRG"));
        Map<String, Object> body = Map.of("results", List.of(item(39, fields)));

        service.applyLiveTimestamps(body);

        assertEquals(created.toString(), fields.get("created_at"));
        assertEquals(scraped.toString(), fields.get("last_scraped_at"));
        assertEquals(verified.toString(), fields.get("last_verified_at"));
        assertEquals("CRG", fields.get("grant_title"));
    }

    @Test
    void leavesGrantsMissingFromTheDatabaseAlone() {
        when(grantRepository.findAllById(List.of(7L))).thenReturn(List.of());
        Map<String, Object> fields = new HashMap<>(Map.of("last_scraped_at", "2026-10-05T09:00"));

        service.applyLiveTimestamps(Map.of("results", List.of(item(7, fields))));

        assertEquals(Map.of("last_scraped_at", "2026-10-05T09:00"), fields);
    }

    @Test
    void ignoresAnEmptyOrMalformedResponse() {
        service.applyLiveTimestamps(Map.of("results", List.of(), "no_results", true));
        service.applyLiveTimestamps("not a map");
        service.applyLiveTimestamps(null);

        verify(grantRepository, never()).findAllById(any());
    }
}
