/**
 * This file contains the AiServiceClient class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

import static org.springframework.http.HttpStatus.BAD_GATEWAY;
import static org.springframework.http.HttpStatus.GATEWAY_TIMEOUT;

@Service
public class AiServiceClient {

    private final RestClient restClient;
    private final String apiKey;

    public AiServiceClient(@Value("${integration.ai.base-url:http://localhost:8000}") String baseUrl,
                           @Value("${integration.ai.api-key:}") String apiKey,
                           @Value("${integration.ai.connect-timeout-ms:3000}") int connectTimeoutMs,
                           @Value("${integration.ai.read-timeout-ms:20000}") int readTimeoutMs) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(connectTimeoutMs);
        requestFactory.setReadTimeout(readTimeoutMs);

        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .build();
        this.apiKey = apiKey;
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
                    .contentType(MediaType.APPLICATION_JSON);

            if (StringUtils.hasText(apiKey)) {
                request = request.header("X-API-KEY", apiKey);
            }

            return request.body(requestBody)
                    .retrieve()
                    .body(Object.class);
        } catch (RestClientResponseException ex) {
            throw new ResponseStatusException(BAD_GATEWAY,
                    "AI service returned " + ex.getStatusCode().value() + ": " + ex.getResponseBodyAsString(), ex);
        } catch (ResourceAccessException ex) {
            throw new ResponseStatusException(GATEWAY_TIMEOUT,
                    "AI service timed out or is unreachable", ex);
        }
    }
}


