/**
 * Builds the PostgreSQL full-text query for the AI keyword channel
 * (GrantRepository.keywordSearch) and the lenient country check applied to
 * its results.
 *
 * The keyword channel feeds rank fusion in the ai-service, so it favours
 * recall: any term may match (OR), and a grant is only excluded for a country
 * it explicitly doesn't serve. The ai-service scores eligibility afterwards.
 *
 * Country names are compared by canonical name from shared/countries.json,
 * the table the ai-service reads too, so both services keep the same grants.
 */
package org.pramod.corebackend.service;

import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

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

    /** The canonical name of every "open to all countries" phrase. */
    private static final String OPEN_TO_ALL = "any";

    /** The canonical name of a country group we can't resolve ("associated countries"); it rules no one out. */
    static final String UNRESOLVED_GROUP = "unresolved group";

    private static final CountryRules COUNTRIES = loadCountryRules();

    private record CountryTable(String about, List<String> openToAll, Map<String, List<String>> countries,
                                Map<String, Region> regions, List<String> unresolvedGroups, List<String> groupWords) {
    }

    private record Region(List<String> aliases, List<String> members) {
    }

    /**
     * aliases: every known spelling to its canonical name ("usa" to "united states",
     * "eu member states" to "european union"); members: each region's countries;
     * groupWords: words that mark a group we can't resolve.
     */
    private record CountryRules(Map<String, String> aliases, Map<String, Set<String>> members, Pattern groupWords) {
    }

    private KeywordQuery() {
    }

    /** Built in the same order as rag/countries.py, so later entries win the same way. */
    private static CountryRules loadCountryRules() {
        try (InputStream in = KeywordQuery.class.getResourceAsStream("/countries.json")) {
            if (in == null) {
                throw new IllegalStateException("countries.json (shared/countries.json) is not on the classpath");
            }
            CountryTable table = JsonMapper.builder().build().readValue(in, CountryTable.class);
            Map<String, String> aliases = new HashMap<>();
            table.openToAll().forEach(phrase -> aliases.put(clean(phrase), OPEN_TO_ALL));
            table.unresolvedGroups().forEach(group -> aliases.put(clean(group), UNRESOLVED_GROUP));
            table.countries().forEach((canonical, names) -> {
                aliases.put(clean(canonical), clean(canonical));
                names.forEach(name -> aliases.put(clean(name), clean(canonical)));
            });
            Map<String, Set<String>> members = new HashMap<>();
            table.regions().forEach((region, entry) -> {
                aliases.put(clean(region), clean(region));
                entry.aliases().forEach(alias -> aliases.put(clean(alias), clean(region)));
                members.put(clean(region), entry.members().stream()
                        .map(KeywordQuery::clean)
                        .collect(Collectors.toUnmodifiableSet()));
            });
            Pattern groupWords = Pattern.compile("\\b(" + table.groupWords().stream()
                    .map(Pattern::quote)
                    .collect(Collectors.joining("|")) + ")\\b");
            return new CountryRules(Map.copyOf(aliases), Map.copyOf(members), groupWords);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
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
     * country (directly or through a region such as the EU), none means "open
     * to all", and none is a group we can't resolve. A grant listing no
     * countries, or a user with no country, passes.
     */
    static boolean countryAllows(String grantCountries, String userCountry) {
        if (userCountry == null || userCountry.isBlank() || grantCountries == null) {
            return true;
        }
        List<String> keys = Arrays.stream(grantCountries.split("[,;/|]"))
                .filter(country -> !country.isBlank())
                .map(KeywordQuery::canonicalCountry)
                .toList();
        String wanted = canonicalCountry(userCountry);
        return keys.isEmpty() || keys.stream().anyMatch(key -> key.equals(OPEN_TO_ALL) || key.equals(UNRESOLVED_GROUP)
                || key.equals(wanted) || COUNTRIES.members().getOrDefault(key, Set.of()).contains(wanted));
    }

    static String canonicalCountry(String value) {
        String cleaned = clean(value);
        String known = COUNTRIES.aliases().get(cleaned);
        if (known != null) {
            return known;
        }
        // "Countries associated with the LIFE Programme", "Low-income countries":
        // a group we can't list the members of.
        return COUNTRIES.groupWords().matcher(cleaned).find() ? UNRESOLVED_GROUP : cleaned;
    }

    /** Lowercase, whitespace collapsed, a leading "the" dropped: as rag/countries.py does. */
    private static String clean(String value) {
        String text = value.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
        return text.startsWith("the ") ? text.substring(4) : text;
    }
}
