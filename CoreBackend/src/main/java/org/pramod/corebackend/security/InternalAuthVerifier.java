package org.pramod.corebackend.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

/**
 * Authenticates internal service callers (the Python ai-service and the
 * scraper) on endpoints that are permitAll() in the security chain but must
 * not be open to the public. Accepts either:
 * 1. Level 2 M2M JWT: RS256 token signed by Spring Boot's private key.
 * 2. X-API-KEY: constant-time comparison to prevent timing attacks.
 */
@Component
public class InternalAuthVerifier {

    private final M2mTokenService m2mTokenService;
    private final String expectedApiKey;

    public InternalAuthVerifier(M2mTokenService m2mTokenService,
                                @Value("${integration.api-key:}") String expectedApiKey) {
        this.m2mTokenService = m2mTokenService;
        this.expectedApiKey = expectedApiKey;
    }

    /** Returns normally for a valid caller; throws 401 otherwise (fail-closed). */
    public void verify(String authHeader, String apiKey) {
        if (StringUtils.hasText(authHeader) && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7).trim();
            if (m2mTokenService != null && m2mTokenService.validateM2mToken(token)) {
                return;
            }
        }

        if (StringUtils.hasText(expectedApiKey) && StringUtils.hasText(apiKey)) {
            if (MessageDigest.isEqual(
                    expectedApiKey.getBytes(StandardCharsets.UTF_8),
                    apiKey.getBytes(StandardCharsets.UTF_8))) {
                return;
            }
        }

        throw new ResponseStatusException(UNAUTHORIZED, "Unauthorized: Invalid or missing M2M token / API key");
    }
}
