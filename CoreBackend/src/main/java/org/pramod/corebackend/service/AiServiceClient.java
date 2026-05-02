/**
 * This file contains the AiServiceClient class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.service;

import tools.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
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
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        try {
            builder.part("proposal_pdf", asNamedResource(proposalPdf))
                    .filename(safeFilename(proposalPdf, "proposal.pdf"))
                    .contentType(MediaType.APPLICATION_PDF);
            builder.part("guidelines_pdf", asNamedResource(guidelinesPdf))
                    .filename(safeFilename(guidelinesPdf, "guidelines.pdf"))
                    .contentType(MediaType.APPLICATION_PDF);
        } catch (IOException ex) {
            throw new ResponseStatusException(BAD_GATEWAY,
                    "Could not read uploaded PDF: " + ex.getMessage(), ex);
        }
        builder.part("grant_title", grantTitle == null ? "" : grantTitle);
        builder.part("mode", mode == null || mode.isBlank() ? "simple" : mode);

        MultiValueMap<String, org.springframework.http.HttpEntity<?>> body = builder.build();

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
            throw new ResponseStatusException(BAD_GATEWAY,
                    "AI service returned " + ex.getStatusCode().value() + ": " + ex.getResponseBodyAsString(), ex);
        } catch (ResourceAccessException ex) {
            ex.printStackTrace();
            throw new ResponseStatusException(GATEWAY_TIMEOUT,
                    "AI service timed out or is unreachable: " + ex.getMessage(), ex);
        } catch (RestClientException ex) {
            ex.printStackTrace();
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

    private static ByteArrayResource asNamedResource(MultipartFile file) throws IOException {
        final String filename = safeFilename(file, "upload.pdf");
        final byte[] bytes = file.getBytes();
        return new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return filename;
            }

            @Override
            public long contentLength() {
                return bytes.length;
            }
        };
    }

    private static String safeFilename(MultipartFile file, String fallback) {
        if (file == null) {
            return fallback;
        }
        String name = file.getOriginalFilename();
        return StringUtils.hasText(name) ? name : fallback;
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


