package org.pramod.corebackend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pramod.corebackend.entity.GuidelineExtraction;
import org.pramod.corebackend.repository.GuidelineExtractionRepository;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/** The guidelines' page text is kept apart from the extraction, for questions about them. */
@ExtendWith(MockitoExtension.class)
class GuidelineExtractionServiceTest {

    @Mock private GuidelineExtractionRepository repository;

    private GuidelineExtractionService service;

    @BeforeEach
    void setUp() {
        service = new GuidelineExtractionService(repository, JsonMapper.builder().build());
    }

    private void saveReturnsTheRow() {
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void storesThePagesInTheirOwnColumn() {
        saveReturnsTheRow();
        when(repository.findByContentHash("abc")).thenReturn(Optional.empty());

        GuidelineExtraction row = service.store(Map.of(
                "content_hash", "abc", "source_kind", "web", "items", List.of(),
                "pages", List.of("Page one", "", "Overhead is 10%.")));

        assertFalse(row.getExtractionJson().contains("Overhead"));
        assertEquals(List.of("Page one", "", "Overhead is 10%."), service.pages(row));
        assertEquals("web", service.sourceKind(row));
    }

    @Test
    void aReadingWithoutPagesKeepsThePagesAlreadyStored() {
        GuidelineExtraction existing = GuidelineExtraction.builder()
                .contentHash("abc").extractionJson("{}").pagesJson("[\"Kept\"]").build();
        saveReturnsTheRow();
        when(repository.findByContentHash("abc")).thenReturn(Optional.of(existing));

        GuidelineExtraction row = service.store(Map.of("content_hash", "abc", "items", List.of()));

        assertEquals(List.of("Kept"), service.pages(row));
        assertEquals("pdf", service.sourceKind(row));
    }

    @Test
    void olderReadingsHaveNoPages() {
        GuidelineExtraction row = GuidelineExtraction.builder().contentHash("abc").extractionJson("{}").build();

        assertNull(service.pages(row));
    }
}
