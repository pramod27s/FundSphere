package org.pramod.corebackend.security;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.DefaultResourceLoader;

import static org.junit.jupiter.api.Assertions.*;

class M2mTokenServiceTest {

    @Test
    void testM2mTokenGenerationAndValidation() {
        DefaultResourceLoader resourceLoader = new DefaultResourceLoader();
        M2mTokenService m2mTokenService = new M2mTokenService(resourceLoader);
        m2mTokenService.init();

        // 1. Generate an M2M token
        String token = m2mTokenService.getM2mToken();
        assertNotNull(token, "M2M token must not be null");
        assertFalse(token.isBlank(), "M2M token must not be blank");

        // 2. Validate the generated token
        boolean isValid = m2mTokenService.validateM2mToken(token);
        assertTrue(isValid, "Generated M2M token must be valid");

        // 3. Cached token test: second call should return identical token without recalculation
        String cachedToken = m2mTokenService.getM2mToken();
        assertEquals(token, cachedToken, "Cached M2M token should be returned");

        // 4. Invalid token test
        assertFalse(m2mTokenService.validateM2mToken("invalid.token.here"), "Invalid token must be rejected");
        assertFalse(m2mTokenService.validateM2mToken(null), "Null token must be rejected");
    }
}
