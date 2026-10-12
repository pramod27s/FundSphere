/**
 * Fetches a PUBLIC ORCID record and extracts fields to prefill the researcher
 * profile during onboarding. Fail-open by design: any error (bad iD, network,
 * auth, empty record) returns a not-found response with a message rather than
 * throwing, so the UI degrades to manual entry.
 *
 * Uses ORCID's public API. Some deployments require a read-public bearer token;
 * set `orcid.api.token` when you have one. Without it we still attempt the call
 * (works for many public records) and degrade gracefully if rejected.
 *
 * The ORCID JSON is parsed as a plain {@code Map} (RestTemplate handles the
 * deserialization at runtime) and navigated with helpers — no compile-time
 * dependency on a specific JSON library.
 *
 * Also lists a record's works one by one (title, date, journal, DOI and
 * put-code) for the progress-report outputs of a grant (4.4). Unlike
 * enrichment, that call reports failures, because the PI asked for the list.
 */
package org.pramod.corebackend.service;

import org.pramod.corebackend.dto.OrcidEnrichmentResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.regex.Pattern;

import static org.springframework.http.HttpStatus.BAD_GATEWAY;
import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class OrcidEnrichmentService {

    private static final Logger log = Logger.getLogger(OrcidEnrichmentService.class.getName());

    // ORCID iD format: 4 groups of 4 chars, last char may be 'X' (checksum).
    private static final Pattern ORCID_PATTERN = Pattern.compile("^\\d{4}-\\d{4}-\\d{4}-\\d{3}[\\dXx]$");

    private static final int MAX_WORK_TITLES = 8;
    private static final int MAX_SUMMARY_CHARS = 1500;

    /** One work on an ORCID record. date is "2027", "2027-03" or "2027-03-14" (PartialDates), or null. */
    public record OrcidWork(String putCode, String title, String journal, String date, String doi, String type) {
    }

    private final RestTemplate restTemplate = createRestTemplate();

    @Value("${orcid.api.base-url:https://pub.orcid.org/v3.0}")
    private String orcidBaseUrl;

    @Value("${orcid.api.token:}")
    private String orcidToken;

    public OrcidEnrichmentResponse enrich(String rawOrcidId) {
        String orcidId = normalizeId(rawOrcidId);
        if (orcidId == null) {
            return notFound("Enter a valid ORCID iD (e.g. 0000-0002-1825-0097).");
        }

        Map<String, Object> record;
        try {
            record = fetchRecord(orcidId);
        } catch (Exception ex) {
            log.log(Level.INFO, "ORCID fetch failed for " + orcidId + ": " + ex.getMessage());
            return notFound("Couldn't reach ORCID for that iD — please fill the fields manually.");
        }
        if (record == null) {
            return notFound("No public ORCID record found for that iD.");
        }

        String name = extractName(record);
        List<String> keywords = extractKeywords(record);
        String summary = buildSummary(record);

        boolean anything = (summary != null && !summary.isBlank()) || !keywords.isEmpty();
        if (!anything) {
            return OrcidEnrichmentResponse.builder()
                    .found(false)
                    .name(name)
                    .keywords(keywords)
                    .message("ORCID record found but it has no public biography, keywords, or works to import.")
                    .build();
        }

        return OrcidEnrichmentResponse.builder()
                .found(true)
                .name(name)
                .researchSummary(summary)
                .keywords(keywords)
                .message(name != null
                        ? "Imported from ORCID for " + name + " — please review."
                        : "Imported from ORCID — please review.")
                .build();
    }

    /**
     * The public works on a record, in ORCID's order. Throws with a message
     * the PI can act on: a malformed iD, no such record, or ORCID unreachable.
     */
    public List<OrcidWork> fetchWorks(String rawOrcidId) {
        String orcidId = normalizeId(rawOrcidId);
        if (orcidId == null) {
            throw new ResponseStatusException(BAD_REQUEST, "That isn't an ORCID iD. It looks like 0000-0002-1825-0097");
        }
        Map<String, Object> works;
        try {
            works = fetch(orcidId, "works");
        } catch (HttpClientErrorException.NotFound ex) {
            throw new ResponseStatusException(NOT_FOUND, "No public ORCID record found for " + orcidId);
        } catch (RestClientException ex) {
            log.log(Level.INFO, "ORCID works fetch failed for " + orcidId + ": " + ex.getMessage());
            throw new ResponseStatusException(BAD_GATEWAY,
                    "Couldn't reach ORCID just now. Try again in a minute, or add the papers by hand");
        }
        return works == null ? List.of() : parseWorks(works);
    }

    /**
     * Reads the body of {@code /works}: one entry per group (ORCID groups the
     * same work from several sources), taken from its preferred summary.
     */
    static List<OrcidWork> parseWorks(Map<String, Object> body) {
        List<OrcidWork> works = new ArrayList<>();
        List<Object> groups = asList(dig(body, "group"));
        if (groups == null) {
            return works;
        }
        for (Object group : groups) {
            List<Object> summaries = asList(dig(group, "work-summary"));
            if (summaries == null || summaries.isEmpty()) {
                continue;
            }
            Object summary = summaries.get(0);
            String title = oneLine(asStr(dig(summary, "title", "title", "value")));
            Object putCode = dig(summary, "put-code");
            if (title == null || putCode == null) {
                continue;
            }
            String date = PartialDates.of(
                    asStr(dig(summary, "publication-date", "year", "value")),
                    asStr(dig(summary, "publication-date", "month", "value")),
                    asStr(dig(summary, "publication-date", "day", "value")));
            String doi = doi(dig(summary, "external-ids", "external-id"));
            if (doi == null) {
                doi = doi(dig(group, "external-ids", "external-id"));
            }
            works.add(new OrcidWork(String.valueOf(putCode), title,
                    oneLine(asStr(dig(summary, "journal-title", "value"))), date, doi, asStr(dig(summary, "type"))));
        }
        return works;
    }

    /** The work's own DOI (relationship "self") among its external ids, without any https://doi.org/ prefix. */
    private static String doi(Object externalIds) {
        List<Object> ids = asList(externalIds);
        if (ids == null) {
            return null;
        }
        String fallback = null;
        for (Object id : ids) {
            if (!"doi".equalsIgnoreCase(asStr(dig(id, "external-id-type")))) {
                continue;
            }
            String value = stripDoiPrefix(asStr(dig(id, "external-id-value")));
            if (value == null) {
                continue;
            }
            String relationship = asStr(dig(id, "external-id-relationship"));
            if (relationship == null || "self".equalsIgnoreCase(relationship)) {
                return value;
            }
            if (fallback == null) {
                fallback = value;
            }
        }
        return fallback;
    }

    /** "https://doi.org/10.1/X" or "doi:10.1/X" → "10.1/X"; null when what's left isn't a DOI. */
    public static String stripDoiPrefix(String value) {
        if (value == null) {
            return null;
        }
        String doi = value.strip()
                .replaceFirst("(?i)^(https?://)?(dx\\.)?doi\\.org/", "")
                .replaceFirst("(?i)^doi:\\s*", "");
        return doi.startsWith("10.") ? doi : null;
    }

    private static String oneLine(String value) {
        if (value == null) {
            return null;
        }
        String line = value.replaceAll("\\s+", " ").strip();
        return line.isEmpty() ? null : line;
    }

    // --- fetch -------------------------------------------------------------

    private static RestTemplate createRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(15_000);
        return new RestTemplate(factory);
    }

    private Map<String, Object> fetchRecord(String orcidId) {
        return fetch(orcidId, "record");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> fetch(String orcidId, String section) {
        String url = orcidBaseUrl.replaceAll("/+$", "") + "/" + orcidId + "/" + section;

        HttpHeaders headers = new HttpHeaders();
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        if (orcidToken != null && !orcidToken.isBlank()) {
            headers.setBearerAuth(orcidToken.trim());
        }

        ResponseEntity<Map> response = restTemplate.exchange(
                url, HttpMethod.GET, new HttpEntity<>(headers), Map.class);
        Map<String, Object> body = response.getBody();
        return (body == null || body.isEmpty()) ? null : body;
    }

    // --- extraction --------------------------------------------------------

    private String extractName(Map<String, Object> record) {
        String given = asStr(dig(record, "person", "name", "given-names", "value"));
        String family = asStr(dig(record, "person", "name", "family-name", "value"));
        String full = ((given == null ? "" : given) + " " + (family == null ? "" : family)).trim();
        if (!full.isEmpty()) {
            return full;
        }
        return asStr(dig(record, "person", "name", "credit-name", "value"));
    }

    private List<String> extractKeywords(Map<String, Object> record) {
        Set<String> out = new LinkedHashSet<>();
        List<Object> keywords = asList(dig(record, "person", "keywords", "keyword"));
        if (keywords != null) {
            for (Object k : keywords) {
                String content = asStr(dig(k, "content"));
                if (content != null && !content.isEmpty()) {
                    out.add(content);
                }
            }
        }
        return new ArrayList<>(out);
    }

    /**
     * Biography when present (most descriptive); otherwise a sentence built from
     * recent work titles so the researcher still gets a useful starting summary.
     */
    private String buildSummary(Map<String, Object> record) {
        String bio = asStr(dig(record, "person", "biography", "content"));
        if (bio != null && !bio.isEmpty()) {
            return bio.length() > MAX_SUMMARY_CHARS ? bio.substring(0, MAX_SUMMARY_CHARS).trim() + "…" : bio;
        }

        List<String> titles = extractWorkTitles(record);
        if (titles.isEmpty()) {
            return null;
        }
        return "Research and publications include: " + String.join("; ", titles) + ".";
    }

    private List<String> extractWorkTitles(Map<String, Object> record) {
        List<String> titles = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        List<Object> groups = asList(dig(record, "activities-summary", "works", "group"));
        if (groups != null) {
            for (Object group : groups) {
                List<Object> summaries = asList(dig(group, "work-summary"));
                if (summaries != null && !summaries.isEmpty()) {
                    String title = asStr(dig(summaries.get(0), "title", "title", "value"));
                    if (title != null && !title.isEmpty() && seen.add(title.toLowerCase())) {
                        titles.add(title);
                        if (titles.size() >= MAX_WORK_TITLES) {
                            break;
                        }
                    }
                }
            }
        }
        return titles;
    }

    // --- JSON-as-Map navigation helpers ------------------------------------

    /** Walk a chain of map keys; returns the value at the end or null. */
    private static Object dig(Object root, String... keys) {
        Object cur = root;
        for (String key : keys) {
            Map<String, Object> m = asMap(cur);
            if (m == null) {
                return null;
            }
            cur = m.get(key);
        }
        return cur;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object o) {
        return (o instanceof Map) ? (Map<String, Object>) o : null;
    }

    @SuppressWarnings("unchecked")
    private static List<Object> asList(Object o) {
        return (o instanceof List) ? (List<Object>) o : null;
    }

    private static String asStr(Object o) {
        return (o instanceof String s) ? s.trim() : null;
    }

    // --- helpers -----------------------------------------------------------

    /** Accepts a bare iD or a full ORCID URL; returns the canonical iD or null. */
    public static String normalizeId(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.trim();
        int idx = s.lastIndexOf('/');
        if (idx >= 0 && idx < s.length() - 1) {
            s = s.substring(idx + 1);
        }
        s = s.toUpperCase();
        return ORCID_PATTERN.matcher(s).matches() ? s : null;
    }

    private OrcidEnrichmentResponse notFound(String message) {
        return OrcidEnrichmentResponse.builder()
                .found(false)
                .message(message)
                .keywords(List.of())
                .build();
    }
}
