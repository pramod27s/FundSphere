/**
 * This file contains the AiServiceClient class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.service;

import lombok.extern.slf4j.Slf4j;
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

/**
 * Calls the ai-service. Failures are logged here in full; the message passed
 * on to the browser never includes exception text, which can carry internal
 * addresses or library details.
 */
@Slf4j
@Service
public class AiServiceClient {

    private static final String UNREADABLE_PDF = "Could not read the uploaded PDF. Try uploading it again.";

    private final RestClient restClient;
    private final String apiKey;
    private final ObjectMapper objectMapper;
    private final org.pramod.corebackend.security.M2mTokenService m2mTokenService;

    public AiServiceClient(@Value("${integration.ai.base-url:http://localhost:8000}") String baseUrl,
                           @Value("${integration.ai.api-key:}") String apiKey,
                           @Value("${integration.ai.connect-timeout-ms:3000}") int connectTimeoutMs,
                           @Value("${integration.ai.read-timeout-ms:20000}") int readTimeoutMs,
                           ObjectMapper objectMapper,
                           org.pramod.corebackend.security.M2mTokenService m2mTokenService) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(connectTimeoutMs);
        requestFactory.setReadTimeout(readTimeoutMs);

        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .build();
        this.apiKey = apiKey;
        this.objectMapper = objectMapper;
        this.m2mTokenService = m2mTokenService;
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
     * Removes every vector chunk of a grant from Pinecone. Sends the same M2M
     * credentials as the other calls; ai-service rejects unauthenticated requests.
     */
    public void deleteGrantVectors(Long grantId) {
        restClient.delete()
                .uri("/rag/grant/{id}", grantId)
                .headers(this::applyAuthHeaders)
                .retrieve()
                .toBodilessEntity();
    }

    private void applyAuthHeaders(HttpHeaders headers) {
        try {
            headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + m2mTokenService.getM2mToken());
        } catch (Exception ex) {
            // Fallback gracefully if keys are missing
        }
        if (StringUtils.hasText(apiKey)) {
            headers.set("X-API-KEY", apiKey);
        }
    }

    /**
     * Sends a call's guidelines (a PDF, or a link when guidelinesPdf is null)
     * to the ai-service checklist extractor and returns the parsed JSON:
     * items with source quotes, the call deadline if found, and warnings.
     */
    public Map<String, Object> extractChecklist(MultipartFile guidelinesPdf, String url, String grantTitle) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        if (guidelinesPdf != null) {
            try {
                body.add("guidelines_pdf", buildPdfPart(guidelinesPdf, "guidelines.pdf"));
            } catch (IOException ex) {
                log.warn("Could not read the uploaded guidelines PDF", ex);
                throw new ResponseStatusException(BAD_GATEWAY, UNREADABLE_PDF, ex);
            }
        } else {
            body.add("url", url == null ? "" : url);
        }
        body.add("grant_title", grantTitle == null ? "" : grantTitle);

        return postMultipart("/workspace/extract-checklist", body, "checklist extraction",
                "Reading the guidelines took longer than the configured timeout. Please try again.");
    }

    /**
     * Asks a question about a call's guidelines (their stored page text) and
     * returns the answer with the sentences it rests on, each checked against
     * the text. Nothing is stored.
     */
    public Map<String, Object> askGuidelines(List<String> pages, String sourceKind, String question, String grantTitle) {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("pages", pages);
        body.put("source_kind", sourceKind);
        body.put("question", question);
        body.put("grant_title", grantTitle == null ? "" : grantTitle);
        return postJson("/workspace/ask-guidelines", body, "guidelines question",
                "Answering took longer than the configured timeout. Please try again.");
    }

    /**
     * Sends a sanction order PDF to the ai-service reader (Objective 4, 4.5)
     * and returns the parsed JSON: each "Add my grant" value with the
     * sentence it came from, the budget heads, and warnings. Nothing is stored.
     */
    public Map<String, Object> readSanctionOrder(MultipartFile sanctionOrderPdf) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        try {
            body.add("sanction_order_pdf", buildPdfPart(sanctionOrderPdf, "sanction-order.pdf"));
        } catch (IOException ex) {
            log.warn("Could not read the uploaded sanction order PDF", ex);
            throw new ResponseStatusException(BAD_GATEWAY, UNREADABLE_PDF, ex);
        }
        return postMultipart("/award/read-sanction-order", body, "sanction order reading",
                "Reading the sanction order took longer than the configured timeout. Please try again.");
    }

    /**
     * Reads a funding call into the admin's "Add a grant" form (2nd.md, Part B):
     * send exactly one of the PDF, a link or pasted text. Returns each grant
     * detail with the sentence it came from. Nothing is stored.
     */
    public Map<String, Object> readCall(MultipartFile callPdf, String url, String text) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        if (callPdf != null) {
            try {
                body.add("call_pdf", buildPdfPart(callPdf, "call.pdf"));
            } catch (IOException ex) {
                log.warn("Could not read the uploaded call PDF", ex);
                throw new ResponseStatusException(BAD_GATEWAY, UNREADABLE_PDF, ex);
            }
        }
        body.add("url", url == null ? "" : url);
        body.add("text", text == null ? "" : text);
        return postMultipart("/intake/read-call", body, "call reading",
                "Reading the call took longer than the configured timeout. Please try again.");
    }

    /**
     * Reads a guidelines PDF (checklist + proposal rules). Used by background
     * jobs, which hold the bytes rather than the upload.
     */
    public Map<String, Object> extractGuidelines(byte[] guidelinesPdf, String fileName, String grantTitle) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("guidelines_pdf", buildPdfPart(guidelinesPdf, fileName, "guidelines.pdf"));
        body.add("grant_title", grantTitle == null ? "" : grantTitle);
        return postMultipart("/workspace/extract-checklist", body, "guidelines extraction",
                "Reading the guidelines took longer than the configured timeout. Please try again.");
    }

    /**
     * Runs a proposal review. Send the PDF for a new draft, or documentJson (the
     * document read by an earlier review) to re-run a draft without the file.
     * previousJson is the last finished review of the same series, so the
     * ai-service can reuse unchanged work.
     */
    public Map<String, Object> reviewProposal(byte[] proposalPdf, String fileName, String guidanceJson,
                                              String extractionHash, String level, String grantTitle,
                                              String documentJson, String previousJson) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        if (proposalPdf != null) {
            body.add("proposal_pdf", buildPdfPart(proposalPdf, fileName, "proposal.pdf"));
        }
        body.add("guidance_json", guidanceJson);
        body.add("extraction_hash", extractionHash);
        body.add("level", level);
        body.add("grant_title", grantTitle == null ? "" : grantTitle);
        body.add("document_json", documentJson == null ? "" : documentJson);
        body.add("previous_json", previousJson == null ? "" : previousJson);
        return postMultipart("/proposal/review", body, "proposal review",
                "The proposal review took longer than the configured timeout. Please try again.");
    }

    /**
     * Drafts a progress report (Objective 4, 4.4) from the grant's records
     * (snake_case keys, as the ai-service's ReportInput) and returns the draft
     * with every sentence's sources and check result.
     */
    public Map<String, Object> generateDraft(Map<String, Object> reportInput) {
        return postJson("/award/generate-draft", reportInput, "progress report drafting",
                "Writing the draft took longer than the configured timeout. Please try again.");
    }

    /** Re-checks an edited draft against the grant's current records. No AI call, so it's quick. */
    public Map<String, Object> checkDraft(Map<String, Object> reportInput, String title, List<?> sections) {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("report", reportInput);
        body.put("title", title);
        body.put("sections", sections);
        return postJson("/award/check-draft", body, "draft check",
                "Checking the draft took longer than the configured timeout. Please try again.");
    }

    private Map<String, Object> postJson(String path, Object body, String what, String timeoutMessage) {
        return postForMap(path, body, MediaType.APPLICATION_JSON, what, timeoutMessage);
    }

    private Map<String, Object> postMultipart(String path,
                                              MultiValueMap<String, Object> body,
                                              String what,
                                              String timeoutMessage) {
        // NOTE: do NOT set Content-Type manually for multipart — Spring's
        // FormHttpMessageConverter must set it itself so it can include
        // the auto-generated boundary parameter.
        return postForMap(path, body, null, what, timeoutMessage);
    }

    /**
     * POSTs to the ai-service and parses the JSON reply. Upstream errors keep
     * their status and FastAPI detail message so the frontend can show the
     * real cause. contentType null lets Spring choose it (multipart).
     */
    private Map<String, Object> postForMap(String path,
                                           Object body,
                                           MediaType contentType,
                                           String what,
                                           String timeoutMessage) {
        try {
            RestClient.RequestBodySpec request = restClient.post()
                    .uri(path)
                    .headers(this::applyAuthHeaders)
                    .accept(MediaType.APPLICATION_JSON);
            if (contentType != null) {
                request = request.contentType(contentType);
            }
            String raw = request
                    .body(body)
                    .retrieve()
                    .body(String.class);

            if (raw == null || raw.isBlank()) {
                log.warn("AI service sent an empty reply for {}", what);
                throw new ResponseStatusException(BAD_GATEWAY,
                        "The AI service sent an empty reply. Please try again.");
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> parsed = objectMapper.readValue(raw, Map.class);
            return parsed;
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (RestClientResponseException ex) {
            // Forward the upstream status (e.g. 503 rate-limited, 400 invalid input)
            // so the frontend sees a meaningful message instead of generic "Bad
            // Gateway." Wrapping every upstream error as 502 hides the real cause.
            org.springframework.http.HttpStatusCode upstream = ex.getStatusCode();
            log.warn("AI service answered {} for {}: {}", upstream.value(), what, ex.getResponseBodyAsString());
            // A 401/403 here means the two services' keys don't match, not that
            // the user's session ended; passed on, it would send the browser
            // into refreshing its sign-in.
            org.springframework.http.HttpStatusCode status = isServiceAuthFailure(ex) ? BAD_GATEWAY : upstream;
            throw new ResponseStatusException(status, upstreamMessage(ex), ex);
        } catch (ResourceAccessException ex) {
            log.warn("AI service unreachable or too slow for {}", what, ex);
            throw new ResponseStatusException(GATEWAY_TIMEOUT,
                    isTimeoutCause(ex) ? timeoutMessage : "The AI service isn't reachable right now. Please try again in a minute.", ex);
        } catch (RestClientException ex) {
            log.warn("AI service call failed for {}", what, ex);
            // The newer RestClient API can wrap a SocketTimeoutException as a
            // generic RestClientException (not ResourceAccessException), so we
            // walk the cause chain to detect timeouts and surface them as 504
            // instead of a misleading 502.
            if (isTimeoutCause(ex)) {
                throw new ResponseStatusException(GATEWAY_TIMEOUT, timeoutMessage, ex);
            }
            throw new ResponseStatusException(BAD_GATEWAY, "The AI service's reply couldn't be read. Please try again.", ex);
        } catch (tools.jackson.core.JacksonException ex) {
            log.warn("AI service sent a reply that isn't JSON for {}", what, ex);
            throw new ResponseStatusException(BAD_GATEWAY, "The AI service's reply couldn't be read. Please try again.", ex);
        } catch (RuntimeException ex) {
            log.warn("AI service call failed for {}", what, ex);
            throw new ResponseStatusException(BAD_GATEWAY, "The AI service call failed. Please try again.", ex);
        }
    }

    /**
     * The message to show for an error the ai-service answered with. Its
     * 4xx, 502, 503 and 504 details are written for users ("busy, try again in
     * a minute"); a 500 is an unexpected failure whose detail may be raw
     * exception text, so it's replaced.
     */
    private String upstreamMessage(RestClientResponseException ex) {
        if (isServiceAuthFailure(ex)) {
            return "The AI service isn't available right now. Please try again later.";
        }
        if (ex.getStatusCode().value() == 500) {
            return "The AI service hit an error. Please try again.";
        }
        return extractDetail(ex.getResponseBodyAsString(), ex.getStatusCode().value());
    }

    private static boolean isServiceAuthFailure(RestClientResponseException ex) {
        int status = ex.getStatusCode().value();
        return status == 401 || status == 403;
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
            // not JSON — fall through to the generic message below
        }
        // The raw body is logged by the caller, never sent to the browser.
        return "The AI service returned an error (status " + status + "). Please try again.";
    }

    private static HttpEntity<ByteArrayResource> buildPdfPart(MultipartFile file, String fallbackName)
            throws IOException {
        return buildPdfPart(file.getBytes(), file.getOriginalFilename(), fallbackName);
    }

    private static HttpEntity<ByteArrayResource> buildPdfPart(byte[] pdf, String name, String fallbackName) {
        final String filename = StringUtils.hasText(name) ? name : fallbackName;
        final byte[] bytes = pdf;
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

            // Level 2 Asymmetric Security: Attach short-lived RS256 JWT token signed by Spring Boot
            try {
                String m2mToken = m2mTokenService.getM2mToken();
                request = request.header(HttpHeaders.AUTHORIZATION, "Bearer " + m2mToken);
            } catch (Exception ex) {
                // Fallback gracefully if keys are missing
            }

            // Backward-compatible fallback: send X-API-KEY if configured
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
            log.warn("AI service answered {} for {}: {}", ex.getStatusCode().value(), path, ex.getResponseBodyAsString());
            throw new ResponseStatusException(BAD_GATEWAY, upstreamMessage(ex), ex);
        } catch (ResourceAccessException ex) {
            log.warn("AI service unreachable or too slow for {}", path, ex);
            throw new ResponseStatusException(GATEWAY_TIMEOUT,
                    "The AI service timed out or isn't reachable. Please try again in a minute.", ex);
        } catch (RestClientException ex) {
            log.warn("AI service call failed for {}", path, ex);
            throw new ResponseStatusException(BAD_GATEWAY, "The AI service's reply couldn't be read. Please try again.", ex);
        } catch (tools.jackson.core.JacksonException ex) {
            log.warn("AI service sent a reply that isn't JSON for {}", path, ex);
            throw new ResponseStatusException(BAD_GATEWAY, "The AI service's reply couldn't be read. Please try again.", ex);
        }
    }
}


