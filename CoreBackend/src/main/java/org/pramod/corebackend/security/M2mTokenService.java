/**
 * This file contains the M2mTokenService class.
 * Provides Level 2 Asymmetric Machine-to-Machine (M2M) JWT authentication using RSA (RS256).
 */
package org.pramod.corebackend.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Date;

/**
 * ==============================================================================
 * Machine-to-Machine (M2M) Token Service (Level 2 Security)
 * ==============================================================================
 *
 * HOW THIS WORKS (Simple Explanation):
 * 1. ASYMMETRIC ENCRYPTION (RSA 2048 / RS256):
 *    - Spring Boot holds the PRIVATE key (keep it secret!).
 *    - Python AI-service holds only the PUBLIC key (safe to share).
 *    - Spring Boot signs a 5-minute digital badge (JWT token) with its private key.
 *    - Python checks the badge with the public key to confirm it really came from Spring Boot.
 *    - Even if someone hacks the AI service, they CANNOT forge tokens because they lack the private key!
 *
 * 2. SHORT-LIVED EXPIRATION (5 MINUTES):
 *    - Each token automatically expires after 5 minutes.
 *    - If an attacker intercepts the token, it quickly becomes useless (replay protection).
 *
 * 3. IN-MEMORY CACHING (FAST PERFORMANCE):
 *    - We reuse the valid token until 1 minute before expiration.
 *    - This avoids wasting CPU calculating a new RSA signature on every HTTP call.
 * ==============================================================================
 */
@Slf4j
@Service
public class M2mTokenService {

    // Identifiers for the token claims
    private static final String ISSUER = "fundsphere-core-backend";
    private static final String AUDIENCE = "fundsphere-ai-service";
    private static final long TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes in milliseconds
    private static final long REFRESH_BUFFER_MS = 60 * 1000; // Refresh 1 minute before expiry

    private final ResourceLoader resourceLoader;

    @Value("${security.m2m.private-key-location:classpath:keys/m2m_private_key.pem}")
    private String privateKeyLocation = "classpath:keys/m2m_private_key.pem";

    @Value("${security.m2m.public-key-location:classpath:keys/m2m_public_key.pem}")
    private String publicKeyLocation = "classpath:keys/m2m_public_key.pem";

    private PrivateKey privateKey;
    private PublicKey publicKey;

    // Cache the token in memory so we don't recalculate RSA signatures on every single HTTP request
    private String cachedToken;
    private long cachedTokenExpiryTime = 0L;

    public M2mTokenService(ResourceLoader resourceLoader) {
        this.resourceLoader = resourceLoader;
    }

    /**
     * Loads the RSA keys from disk on application startup.
     */
    @PostConstruct
    public void init() {
        try {
            this.privateKey = loadPrivateKey(privateKeyLocation);
            this.publicKey = loadPublicKey(publicKeyLocation);
            log.info("M2M RSA keys loaded successfully. Level 2 M2M asymmetric security is active.");
        } catch (Exception ex) {
            log.error("Failed to load M2M RSA keys. Error: {}", ex.getMessage(), ex);
        }
    }

    /**
     * Generates or returns a cached short-lived M2M JWT token to authenticate with the Python AI service.
     *
     * @return Signed RS256 JWT string.
     */
    public synchronized String getM2mToken() {
        long now = System.currentTimeMillis();

        // If the cached token is still valid (has at least 1 minute remaining), reuse it
        if (cachedToken != null && now < (cachedTokenExpiryTime - REFRESH_BUFFER_MS)) {
            return cachedToken;
        }

        if (privateKey == null) {
            throw new IllegalStateException("M2M Private Key is not initialized. Cannot sign M2M token.");
        }

        Date issuedAt = new Date(now);
        Date expiration = new Date(now + TOKEN_TTL_MS);

        // Sign the JWT using the RSA Private Key (RS256 algorithm)
        this.cachedToken = Jwts.builder()
                .issuer(ISSUER)
                .audience().add(AUDIENCE).and()
                .subject("CoreBackend")
                .issuedAt(issuedAt)
                .expiration(expiration)
                .signWith(privateKey, Jwts.SIG.RS256)
                .compact();

        this.cachedTokenExpiryTime = expiration.getTime();
        return this.cachedToken;
    }

    /**
     * Validates an incoming M2M token (used when Python AI service calls back to Spring Boot).
     *
     * @param token Bearer JWT token string.
     * @return true if valid and not expired, false otherwise.
     */
    public boolean validateM2mToken(String token) {
        if (token == null || token.isBlank() || publicKey == null) {
            return false;
        }

        try {
            // Verify signature using the Public Key
            Claims claims = Jwts.parser()
                    .verifyWith(publicKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            // Check issuer and expiration
            boolean isCorrectIssuer = ISSUER.equals(claims.getIssuer());
            boolean isNotExpired = claims.getExpiration() != null && claims.getExpiration().after(new Date());

            return isCorrectIssuer && isNotExpired;
        } catch (JwtException | IllegalArgumentException ex) {
            log.warn("M2M token validation failed: {}", ex.getMessage());
            return false;
        }
    }

    /**
     * Helper: Reads PEM file, strips headers, and creates an RSA PrivateKey (PKCS#8).
     */
    private PrivateKey loadPrivateKey(String location) throws Exception {
        Resource resource = resourceLoader.getResource(location);
        try (InputStream is = resource.getInputStream()) {
            String pem = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            String cleanKey = pem
                    .replace("-----BEGIN PRIVATE KEY-----", "")
                    .replace("-----END PRIVATE KEY-----", "")
                    .replaceAll("\\s+", "");
            byte[] decoded = Base64.getDecoder().decode(cleanKey);
            KeyFactory keyFactory = KeyFactory.getInstance("RSA");
            return keyFactory.generatePrivate(new PKCS8EncodedKeySpec(decoded));
        }
    }

    /**
     * Helper: Reads PEM file, strips headers, and creates an RSA PublicKey (X.509).
     */
    private PublicKey loadPublicKey(String location) throws Exception {
        Resource resource = resourceLoader.getResource(location);
        try (InputStream is = resource.getInputStream()) {
            String pem = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            String cleanKey = pem
                    .replace("-----BEGIN PUBLIC KEY-----", "")
                    .replace("-----END PUBLIC KEY-----", "")
                    .replaceAll("\\s+", "");
            byte[] decoded = Base64.getDecoder().decode(cleanKey);
            KeyFactory keyFactory = KeyFactory.getInstance("RSA");
            return keyFactory.generatePublic(new X509EncodedKeySpec(decoded));
        }
    }
}
