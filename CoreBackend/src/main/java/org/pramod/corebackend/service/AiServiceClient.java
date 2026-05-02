/**
 * This file contains the AiServiceClient class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.service;

import tools.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

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


