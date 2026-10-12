package org.pramod.corebackend.service;

import org.junit.jupiter.api.Test;
import org.pramod.corebackend.service.OrcidEnrichmentService.OrcidWork;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** The /works body as ORCID's public API v3.0 returns it, parsed into one entry per work. */
class OrcidWorksParserTest {

    private static Map<String, Object> value(String text) {
        return Map.of("value", text);
    }

    private static Map<String, Object> doi(String value, String relationship) {
        return Map.of("external-id-type", "doi", "external-id-value", value, "external-id-relationship", relationship);
    }

    private static Map<String, Object> summary(Object putCode, String title, String type, Map<String, Object> date,
                                               String journal, List<Object> externalIds) {
        Map<String, Object> summary = new HashMap<>();
        summary.put("put-code", putCode);
        summary.put("title", title == null ? null : Map.of("title", value(title)));
        summary.put("type", type);
        summary.put("publication-date", date);
        summary.put("journal-title", journal == null ? null : value(journal));
        summary.put("external-ids", externalIds == null ? null : Map.of("external-id", externalIds));
        return summary;
    }

    private static Map<String, Object> date(String year, String month, String day) {
        Map<String, Object> date = new HashMap<>();
        date.put("year", year == null ? null : value(year));
        date.put("month", month == null ? null : value(month));
        date.put("day", day == null ? null : value(day));
        return date;
    }

    private static Map<String, Object> group(Map<String, Object> groupExternalIds, Object... summaries) {
        Map<String, Object> group = new HashMap<>();
        group.put("work-summary", List.of(summaries));
        group.put("external-ids", groupExternalIds);
        return group;
    }

    @Test
    void readsTitleDateJournalDoiAndPutCode() {
        Map<String, Object> body = Map.of("group", List.of(
                group(null, summary(1234567, "  Low-cost   arsenic\nsensors ", "journal-article", date("2027", "03", null),
                        "Journal of Hazardous Materials",
                        List.of(doi("10.1016/j.jhazmat.2027.1", "part-of"), doi("https://doi.org/10.1016/J.JHAZMAT.2027.2", "self"))))));

        List<OrcidWork> works = OrcidEnrichmentService.parseWorks(body);

        assertEquals(1, works.size());
        OrcidWork work = works.get(0);
        assertEquals("1234567", work.putCode());
        assertEquals("Low-cost arsenic sensors", work.title());
        assertEquals("2027-03", work.date());
        assertEquals("Journal of Hazardous Materials", work.journal());
        assertEquals("10.1016/J.JHAZMAT.2027.2", work.doi(), "the work's own DOI wins over a part-of one");
        assertEquals("journal-article", work.type());
    }

    @Test
    void takesThePreferredSummaryAndFallsBackToTheGroupsDoi() {
        Map<String, Object> body = Map.of("group", List.of(
                group(Map.of("external-id", List.of(doi("doi:10.5555/xyz", "self"))),
                        summary(11, "Preferred version", "conference-paper", null, null, null),
                        summary(12, "Another source's copy", "conference-paper", null, null, null))));

        OrcidWork work = OrcidEnrichmentService.parseWorks(body).get(0);

        assertEquals("11", work.putCode());
        assertEquals("Preferred version", work.title());
        assertEquals("10.5555/xyz", work.doi());
        assertNull(work.date());
    }

    @Test
    void skipsWorksWithoutTitleOrPutCodeAndCopesWithAnEmptyRecord() {
        Map<String, Object> body = Map.of("group", List.of(
                group(null, summary(21, null, "journal-article", null, null, null)),
                group(null, summary(null, "No put-code", "journal-article", null, null, null)),
                group(null, summary(23, "Kept", "data-set", date("2026", null, null), null, null))));

        List<OrcidWork> works = OrcidEnrichmentService.parseWorks(body);

        assertEquals(List.of("Kept"), works.stream().map(OrcidWork::title).toList());
        assertTrue(OrcidEnrichmentService.parseWorks(Map.of()).isEmpty());
    }

    @Test
    void stripsDoiPrefixesAndRejectsWhatIsntADoi() {
        assertEquals("10.1/AbC", OrcidEnrichmentService.stripDoiPrefix(" https://doi.org/10.1/AbC "));
        assertEquals("10.1/x", OrcidEnrichmentService.stripDoiPrefix("http://dx.doi.org/10.1/x"));
        assertEquals("10.1/x", OrcidEnrichmentService.stripDoiPrefix("DOI: 10.1/x"));
        assertNull(OrcidEnrichmentService.stripDoiPrefix("https://example.org/paper"));
        assertNull(OrcidEnrichmentService.stripDoiPrefix(null));
    }

    @Test
    void normalisesOrcidIds() {
        assertEquals("0000-0002-1825-009X", OrcidEnrichmentService.normalizeId("https://orcid.org/0000-0002-1825-009x"));
        assertEquals("0000-0002-1825-0097", OrcidEnrichmentService.normalizeId(" 0000-0002-1825-0097 "));
        assertNull(OrcidEnrichmentService.normalizeId("0000-0002-1825"));
        assertNull(OrcidEnrichmentService.normalizeId(null));
    }
}
