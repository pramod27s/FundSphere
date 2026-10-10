/**
 * Builds the PostgreSQL full-text query for the AI keyword channel
 * (GrantRepository.keywordSearch) and the lenient country check applied to
 * its results.
 *
 * The keyword channel feeds rank fusion in the ai-service, so it favours
 * recall: any term may match (OR), and a grant is only excluded for a country
 * it explicitly doesn't serve. The ai-service scores eligibility afterwards.
 */
package org.pramod.corebackend.service;

import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

final class KeywordQuery {

    /** Most terms in one query; the longest (most distinctive) are kept. */
    static final int MAX_TERMS = 32;

    /**
     * Words every grant shares or query filler. PostgreSQL's English
     * configuration drops ordinary stop words itself; these are the
     * grant-specific ones it doesn't know.
     */
    private static final Set<String> GENERIC_TERMS = Set.of(
            "grant", "grants", "funding", "fund", "funds", "funded", "research",
            "looking", "seeking", "find", "need", "want", "opportunity", "opportunities",
            "support", "program", "programme", "programs", "programmes", "scheme", "schemes",
            "apply", "application", "applications");

    private static final Set<String> OPEN_TO_ALL = Set.of(
            "any", "all", "global", "international", "worldwide", "all countries");

    private static final Map<String, String> COUNTRY_ALIASES = Map.ofEntries(
            Map.entry("us", "united states"),
            Map.entry("usa", "united states"),
            Map.entry("u.s.", "united states"),
            Map.entry("u.s.a.", "united states"),
            Map.entry("united states of america", "united states"),
            Map.entry("america", "united states"),
            Map.entry("uk", "united kingdom"),
            Map.entry("u.k.", "united kingdom"),
            Map.entry("great britain", "united kingdom"),
            Map.entry("britain", "united kingdom"),
            Map.entry("england", "united kingdom"),
            Map.entry("republic of india", "india"),
            Map.entry("uae", "united arab emirates"));

    private KeywordQuery() {
    }

    /**
     * An OR query over the text's words for {@code to_tsquery('english', ...)},
     * e.g. "climate | rural | india". Terms are [a-z0-9]+ only, so the result
     * can't contain tsquery operators. Empty when nothing searchable remains.
     */
    static Optional<String> toTsQuery(String text) {
        if (text == null || text.isBlank()) {
            return Optional.empty();
        }
        List<String> terms = Arrays.stream(text.toLowerCase(Locale.ROOT).split("[^a-z0-9]+"))
                .filter(term -> term.length() >= 2 && !GENERIC_TERMS.contains(term))
                .distinct()
                .sorted(Comparator.comparingInt(String::length).reversed())
                .limit(MAX_TERMS)
                .toList();
        return terms.isEmpty() ? Optional.empty() : Optional.of(String.join(" | ", terms));
    }

    /**
     * False only when the grant lists countries, none of them is the user's
     * country, and none means "open to all". A grant listing no countries,
     * or a user with no country, passes.
     */
    static boolean countryAllows(String grantCountries, String userCountry) {
        if (userCountry == null || userCountry.isBlank() || grantCountries == null || grantCountries.isBlank()) {
            return true;
        }
        String wanted = canonicalCountry(userCountry);
        return Arrays.stream(grantCountries.split("[,;/|]"))
                .map(KeywordQuery::canonicalCountry)
                .anyMatch(country -> OPEN_TO_ALL.contains(country) || country.equals(wanted));
    }

    private static String canonicalCountry(String value) {
        String normalized = value.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
        return COUNTRY_ALIASES.getOrDefault(normalized, normalized);
    }
}
