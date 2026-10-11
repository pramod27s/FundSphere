/**
 * One calendar of everything the user has on (4.2): application deadlines and
 * checklist items, and grants' reporting deadlines.
 *
 * GET    /api/calendar/download          -> the calendar as a file to import
 * GET    /api/calendar/subscription      -> whether a subscription link is active
 * POST   /api/calendar/subscription      -> a new subscription link (the old one stops working)
 * DELETE /api/calendar/subscription      -> turn the link off
 * GET    /api/calendar/feed/{token}.ics  -> the calendar behind a link; public, for calendar apps
 *
 * Calendar apps can't log in, so the feed is reached by its secret token
 * alone (SecurityConfig permits it). A subscription only works once the
 * backend has a public address: Google Calendar fetches the link from
 * Google's servers, so localhost links can't be reached.
 */
package org.pramod.corebackend.controller;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.security.UserPrincipal;
import org.pramod.corebackend.service.CalendarService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

@RestController
@RequestMapping("/api/calendar")
@RequiredArgsConstructor
public class CalendarController {

    private static final MediaType TEXT_CALENDAR = new MediaType("text", "calendar", StandardCharsets.UTF_8);

    private final CalendarService calendarService;

    /** The backend's public address for subscription links; empty means "the address this request came in on". */
    @Value("${app.public-base-url:}")
    private String publicBaseUrl;

    @GetMapping("/download")
    public ResponseEntity<byte[]> download(@AuthenticationPrincipal UserPrincipal principal) {
        String ics = calendarService.calendar(requireUserId(principal));
        return ResponseEntity.ok()
                .contentType(TEXT_CALENDAR)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("fundsphere-deadlines.ics").build().toString())
                .body(ics.getBytes(StandardCharsets.UTF_8));
    }

    @GetMapping("/subscription")
    public ResponseEntity<Map<String, Object>> subscription(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(Map.of("active", calendarService.hasSubscriptionLink(requireUserId(principal))));
    }

    /** The link is shown only now: the server keeps just a hash of its secret. */
    @PostMapping("/subscription")
    public ResponseEntity<Map<String, Object>> newSubscription(@AuthenticationPrincipal UserPrincipal principal) {
        String token = calendarService.newSubscriptionToken(requireUserId(principal));
        return ResponseEntity.ok(Map.of("active", true, "url", baseUrl() + "/api/calendar/feed/" + token + ".ics"));
    }

    @DeleteMapping("/subscription")
    public ResponseEntity<Void> turnOff(@AuthenticationPrincipal UserPrincipal principal) {
        calendarService.turnOffSubscriptionLink(requireUserId(principal));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/feed/{token}.ics")
    public ResponseEntity<byte[]> feed(@PathVariable String token) {
        String ics = calendarService.calendarForToken(token)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "This calendar link isn't valid any more"));
        return ResponseEntity.ok()
                .contentType(TEXT_CALENDAR)
                .cacheControl(CacheControl.noCache())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.inline().filename("fundsphere-deadlines.ics").build().toString())
                .body(ics.getBytes(StandardCharsets.UTF_8));
    }

    private String baseUrl() {
        if (publicBaseUrl != null && !publicBaseUrl.isBlank()) {
            return publicBaseUrl.replaceAll("/+$", "");
        }
        return ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
    }

    private static Long requireUserId(UserPrincipal principal) {
        if (principal == null || principal.getId() == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "Authentication required");
        }
        return principal.getId();
    }
}
