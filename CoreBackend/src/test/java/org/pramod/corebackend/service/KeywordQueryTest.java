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

    @Test
    void countryCheckKnowsEveryOpenToAllPhraseInTheSharedTable() {
        assertTrue(KeywordQuery.countryAllows("All countries", "India"));
        assertTrue(KeywordQuery.countryAllows("Open to all nationalities", "India"));
        assertTrue(KeywordQuery.countryAllows("Kenya; Worldwide", "India"));
    }

    @Test
    void aRegionAdmitsItsMemberCountries() {
        assertTrue(KeywordQuery.countryAllows("EU Member States", "Spain"));
        assertTrue(KeywordQuery.countryAllows("EEA countries", "Norway"));
        assertFalse(KeywordQuery.countryAllows("EU Member States", "India"));
        assertFalse(KeywordQuery.countryAllows("Nordics", "Spain"));
    }

    @Test
    void aGroupWeCannotResolveRulesNobodyOut() {
        // As the ERC Starting Grant was extracted; the UK is an associated country.
        assertTrue(KeywordQuery.countryAllows("EU Member States, associated countries", "United Kingdom"));
        assertTrue(KeywordQuery.countryAllows("Low- and middle-income countries", "Kenya"));
        assertEquals(KeywordQuery.UNRESOLVED_GROUP, KeywordQuery.canonicalCountry("Countries associated with the LIFE Programme"));
        assertEquals("south africa", KeywordQuery.canonicalCountry("South Africa"));
    }

    @Test
    void canonicalNamesMatchTheAiService() {
        // The same cases as CountryTests in ai-service/tests/test_rag.py.
        assertEquals("united states", KeywordQuery.canonicalCountry("USA"));
        assertEquals("united kingdom", KeywordQuery.canonicalCountry("  The United  Kingdom "));
        assertEquals("kenya", KeywordQuery.canonicalCountry("Kenya"));
        assertEquals("any", KeywordQuery.canonicalCountry("All countries"));
    }
}
