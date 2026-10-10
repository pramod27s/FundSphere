package org.pramod.corebackend.service;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

class KeywordQueryTest {

    private static Set<String> terms(Optional<String> tsQuery) {
        return Arrays.stream(tsQuery.orElseThrow().split(" \\| ")).collect(Collectors.toSet());
    }

    @Test
    void buildsAnOrQueryOfDistinctWords() {
        Optional<String> query = KeywordQuery.toTsQuery("Climate-smart AI, for rural India; AI");

        assertEquals(Set.of("climate", "smart", "ai", "for", "rural", "india"), terms(query));
    }

    @Test
    void dropsGenericGrantWordsAndSingleLetters() {
        Optional<String> query = KeywordQuery.toTsQuery("Looking for research grants and funding in x-ray imaging");

        assertEquals(Set.of("for", "and", "in", "ray", "imaging"), terms(query));
    }

    @Test
    void cannotCarryTsQueryOperators() {
        Optional<String> query = KeywordQuery.toTsQuery("ai & !(drug) | 'quoted':* <-> discovery");

        assertTrue(query.orElseThrow().matches("[a-z0-9]+( \\| [a-z0-9]+)*"));
    }

    @Test
    void emptyWhenNothingSearchableRemains() {
        assertTrue(KeywordQuery.toTsQuery(null).isEmpty());
        assertTrue(KeywordQuery.toTsQuery("   ").isEmpty());
        assertTrue(KeywordQuery.toTsQuery("grants funding research").isEmpty());
    }

    @Test
    void capsTheTermCountKeepingTheLongest() {
        StringBuilder text = new StringBuilder("photovoltaics");
        for (int i = 0; i < 50; i++) {
            text.append(" w").append(i);
        }

        Set<String> terms = terms(KeywordQuery.toTsQuery(text.toString()));

        assertEquals(KeywordQuery.MAX_TERMS, terms.size());
        assertTrue(terms.contains("photovoltaics"));
    }

    @Test
    void countryCheckKeepsUnknownAndOpenGrants() {
        assertTrue(KeywordQuery.countryAllows(null, "India"));
        assertTrue(KeywordQuery.countryAllows("  ", "India"));
        assertTrue(KeywordQuery.countryAllows("Global", "India"));
        assertTrue(KeywordQuery.countryAllows("Kenya, International", "India"));
        assertTrue(KeywordQuery.countryAllows("Kenya", null));
    }

    @Test
    void countryCheckMatchesCaseAndAliases() {
        assertTrue(KeywordQuery.countryAllows("Nepal; INDIA", "india"));
        assertTrue(KeywordQuery.countryAllows("USA", "United States"));
        assertTrue(KeywordQuery.countryAllows("United Kingdom", "UK"));
        assertFalse(KeywordQuery.countryAllows("Kenya, Nigeria", "India"));
    }
}
