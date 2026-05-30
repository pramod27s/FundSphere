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
 */
package org.pramod.corebackend.service;

import org.pramod.corebackend.dto.OrcidEnrichmentResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.regex.Pattern;

@Service
public class OrcidEnrichmentService {

    private static final Logger log = Logger.getLogger(OrcidEnrichmentService.class.getName());

    // ORCID iD format: 4 groups of 4 chars, last char may be 'X' (checksum).
    private static final Pattern ORCID_PATTERN = Pattern.compile("^\\d{4}-\\d{4}-\\d{4}-\\d{3}[\\dXx]$");

    private static final int MAX_WORK_TITLES = 8;
    private static final int MAX_SUMMARY_CHARS = 1500;

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${orcid.api.base-url:https://pub.orcid.org/v3.0}")
    private String orcidBaseUrl;

    @Value("${orcid.api.token:}")
    private String orcidToken;

    public OrcidEnrichmentResponse enrich(String rawOrcidId) {
        String orcidId = normalize(rawOrcidId);
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

    // --- fetch -------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private Map<String, Object> fetchRecord(String orcidId) {
        String url = orcidBaseUrl.replaceAll("/+$", "") + "/" + orcidId + "/record";

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
    private String normalize(String raw) {
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
