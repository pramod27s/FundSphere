/**
 * This file contains the AiServiceClient class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.service;

import tools.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpEntity;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;
import java.util.Map;

import static org.springframework.http.HttpStatus.BAD_GATEWAY;
import static org.springframework.http.HttpStatus.GATEWAY_TIMEOUT;

@Service
public class AiServiceClient {

    private final RestClient restClient;
    private final String apiKey;
    private final ObjectMapper objectMapper;

    public AiServiceClient(@Value("${integration.ai.base-url:http://localhost:8000}") String baseUrl,
                           @Value("${integration.ai.api-key:}") String apiKey,
                           @Value("${integration.ai.connect-timeout-ms:3000}") int connectTimeoutMs,
                           @Value("${integration.ai.read-timeout-ms:20000}") int readTimeoutMs,
                           ObjectMapper objectMapper) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(connectTimeoutMs);
        requestFactory.setReadTimeout(readTimeoutMs);

        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .build();
        this.apiKey = apiKey;
        this.objectMapper = objectMapper;
    }

    public Object recommend(Object requestBody) {
        return post("/rag/recommend", requestBody);
    }

    public Object indexGrant(Object requestBody) {
        return post("/rag/index-grant", requestBody);
    }

    public Object indexGrants(Object requestBody) {
        return post("/rag/index-grants", requestBody);
    }

    /**
     * Forwards two PDFs (proposal + guidelines) and metadata as multipart/form-data
     * to the FastAPI proposal-analysis endpoint and returns the parsed JSON.
     */
    public Object analyzeProposal(MultipartFile proposalPdf,
                                  MultipartFile guidelinesPdf,
                                  String grantTitle,
                                  String mode) {
        // Build multipart body using the classic (non-reactive) FormHttpMessageConverter
        // shape: MultiValueMap<String, Object>. Each PDF part is wrapped in an HttpEntity
        // so we can attach its Content-Disposition filename and Content-Type.
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        try {
            body.add("proposal_pdf", buildPdfPart(proposalPdf, "proposal.pdf"));
            body.add("guidelines_pdf", buildPdfPart(guidelinesPdf, "guidelines.pdf"));
        } catch (IOException ex) {
            throw new ResponseStatusException(BAD_GATEWAY,
                    "Could not read uploaded PDF: " + ex.getMessage(), ex);
        }
        body.add("grant_title", grantTitle == null ? "" : grantTitle);
        body.add("mode", mode == null || mode.isBlank() ? "simple" : mode);

        try {
            // NOTE: do NOT set Content-Type manually for multipart — Spring's
            // FormHttpMessageConverter must set it itself so it can include
            // the auto-generated boundary parameter.
            String raw = restClient.post()
                    .uri("/proposal/analyze")
                    .headers(h -> {
                        if (StringUtils.hasText(apiKey)) {
                            h.set("X-API-KEY", apiKey);
                        }
                    })
                    .accept(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(String.class);

            if (raw == null || raw.isBlank()) {
                throw new ResponseStatusException(BAD_GATEWAY,
                        "AI service returned empty body for proposal analysis");
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(raw, Map.class);
            return parsed;
        } catch (RestClientResponseException ex) {
            ex.printStackTrace();
            // Forward the upstream status (e.g. 503 rate-limited, 400 invalid input)
            // so the frontend sees a meaningful message instead of generic "Bad
            // Gateway." Wrapping every upstream error as 502 hides the real cause.
            org.springframework.http.HttpStatusCode upstream = ex.getStatusCode();
            String detail = extractDetail(ex.getResponseBodyAsString(), upstream.value());
            throw new ResponseStatusException(upstream, detail, ex);
        } catch (ResourceAccessException ex) {
            ex.printStackTrace();
            throw new ResponseStatusException(GATEWAY_TIMEOUT,
                    "AI service timed out or is unreachable: " + ex.getMessage(), ex);
        } catch (RestClientException ex) {
            ex.printStackTrace();
            // The newer RestClient API can wrap a SocketTimeoutException as a
            // generic RestClientException (not ResourceAccessException), so we
            // walk the cause chain to detect timeouts and surface them as 504
            // instead of a misleading 502.
            if (isTimeoutCause(ex)) {
                throw new ResponseStatusException(GATEWAY_TIMEOUT,
                        "AI analysis took longer than the configured timeout. "
                        + "Try Quick mode, or retry — the result may have been "
                        + "computed but the connection was closed before delivery.",
                        ex);
            }
            throw new ResponseStatusException(BAD_GATEWAY,
                    "AI service response could not be read: " + ex.getMessage(), ex);
        } catch (tools.jackson.core.JacksonException ex) {
            ex.printStackTrace();
            throw new ResponseStatusException(BAD_GATEWAY,
                    "AI service returned non-JSON body: " + ex.getMessage(), ex);
        } catch (RuntimeException ex) {
            ex.printStackTrace();
            throw new ResponseStatusException(BAD_GATEWAY,
                    "AI service call failed: " + ex.getMessage(), ex);
        }
    }

    /**
     * Walk the exception chain looking for a SocketTimeoutException — Spring's
     * newer RestClient sometimes wraps timeouts inside a generic
     * RestClientException rather than ResourceAccessException, so a `catch`
     * on the latter alone misses them.
     */
    private static boolean isTimeoutCause(Throwable t) {
        for (Throwable cur = t; cur != null; cur = cur.getCause()) {
            if (cur instanceof java.net.SocketTimeoutException
                    || cur instanceof java.util.concurrent.TimeoutException) {
                return true;
            }
            if (cur == cur.getCause()) break;  // defensive against cycles
        }
        return false;
    }

    /**
     * Pull the FastAPI error detail out of a JSON response body if possible.
     * FastAPI returns errors as {"detail": "..."} — surfacing that to the
     * frontend is far more useful than dumping the whole body.
     */
    private String extractDetail(String body, int status) {
        if (body == null || body.isBlank()) {
            return "AI service returned status " + status + " with empty body";
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(body, Map.class);
            Object detail = parsed.get("detail");
            if (detail == null) detail = parsed.get("error");
            if (detail == null) detail = parsed.get("message");
            if (detail instanceof String s && !s.isBlank()) {
                return s;
            }
        } catch (Exception ignore) {
            // not JSON — fall through to raw body below
        }
        // Truncate so we don't echo huge bodies into a single header/line.
        String trimmed = body.length() > 500 ? body.substring(0, 497) + "..." : body;
        return "AI service returned status " + status + ": " + trimmed;
    }

    private static HttpEntity<ByteArrayResource> buildPdfPart(MultipartFile file, String fallbackName)
            throws IOException {
        String name = file.getOriginalFilename();
        final String filename = StringUtils.hasText(name) ? name : fallbackName;
        final byte[] bytes = file.getBytes();
        // The resource's getFilename() drives the Content-Disposition filename.
        // The form-field NAME is taken from the MultiValueMap key, so we must
        // NOT set Content-Disposition here — Spring's FormHttpMessageConverter
        // would otherwise leave our wrong "name" in place and FastAPI would
        // reject the parts as missing.
        ByteArrayResource resource = new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return filename;
            }

            @Override
            public long contentLength() {
                return bytes.length;
            }
        };
        HttpHeaders partHeaders = new HttpHeaders();
        partHeaders.setContentType(MediaType.APPLICATION_PDF);
        return new HttpEntity<>(resource, partHeaders);
    }

    private Object post(String path, Object requestBody) {
        try {
            RestClient.RequestBodySpec request = restClient.post()
                    .uri(path)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON);

            if (StringUtils.hasText(apiKey)) {
                request = request.header("X-API-KEY", apiKey);
            }

            // Read the body as a raw String first, then parse JSON ourselves. This bypasses
            // Spring's content-type negotiation so a misreported / missing Content-Type from
            // the upstream (e.g. application/octet-stream when the connection is partially
            // read) does not cause a generic body-extraction failure. The ai-service is
            // trusted to always return JSON; if it ever doesn't, we surface a 502.
            String raw = request.body(requestBody)
                    .retrieve()
                    .body(String.class);

            if (raw == null || raw.isBlank()) {
                return Map.of("results", List.of(), "no_results", true);
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> body = objectMapper.readValue(raw, Map.class);

            if (body == null || body.isEmpty()) {
                return Map.of("results", List.of(), "no_results", true);
            }
            return body;
        } catch (RestClientResponseException ex) {
            throw new ResponseStatusException(BAD_GATEWAY,
                    "AI service returned " + ex.getStatusCode().value() + ": " + ex.getResponseBodyAsString(), ex);
        } catch (ResourceAccessException ex) {
            throw new ResponseStatusException(GATEWAY_TIMEOUT,
                    "AI service timed out or is unreachable", ex);
        } catch (RestClientException ex) {
            throw new ResponseStatusException(BAD_GATEWAY,
                    "AI service response could not be read: " + ex.getMessage(), ex);
        } catch (tools.jackson.core.JacksonException ex) {
            throw new ResponseStatusException(BAD_GATEWAY,
                    "AI service returned non-JSON body: " + ex.getMessage(), ex);
        }
    }
}


