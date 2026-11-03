package org.pramod.corebackend.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.bind.MissingServletRequestParameterException;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();
    private final MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/applications");

    @Test
    void anUnexpectedErrorShowsOnlyAnErrorIdNotItsDetails() {
        RuntimeException failure = new IllegalStateException(
                "ERROR: relation \"app_users\" does not exist at C:\\FundSphere\\CoreBackend");

        ResponseEntity<Map<String, Object>> response = handler.handleUnexpected(failure, request);

        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        String message = (String) response.getBody().get("message");
        assertTrue(message.matches(".*error ID [0-9a-f]{8}\\.$"), message);
        assertFalse(message.contains("app_users"));
        assertFalse(message.contains("IllegalStateException"));
        assertFalse(message.contains("FundSphere\\CoreBackend"));
    }

    @Test
    void springsOwnRequestErrorsKeepTheir4xxStatus() {
        MissingServletRequestParameterException missing = new MissingServletRequestParameterException("name", "String");

        ResponseEntity<Map<String, Object>> response = handler.handleUnexpected(missing, request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertTrue(((String) response.getBody().get("message")).contains("name"));
    }
}
