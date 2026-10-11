/**
 * One calendar with everything a user has on (4.2): the deadlines and open
 * checklist items of the applications they're preparing (Objective 3) and
 * the pending reporting deadlines of their grants (Objective 4).
 *
 * It can be downloaded once (.ics import) or subscribed to through a secret
 * link, so the calendar app keeps it up to date. The link carries a random
 * 256-bit token; only its SHA-256 is stored, and making a new link or
 * turning it off makes the old one stop working.
 */
package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.entity.Application;
import org.pramod.corebackend.entity.Award;
import org.pramod.corebackend.entity.ComplianceEvent;
import org.pramod.corebackend.enums.ApplicationStatus;
import org.pramod.corebackend.enums.ComplianceEventStatus;
import org.pramod.corebackend.enums.ComplianceEventType;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.repository.ApplicationRepository;
import org.pramod.corebackend.repository.AwardRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
@RequiredArgsConstructor
public class CalendarService {

    static final String CALENDAR_NAME = "FundSphere deadlines";
    /** Grant deadlines need more notice than checklist items: a UC takes the accounts office a while. */
    static final int GRANT_REMINDER_DAYS = 7;
    private static final SecureRandom RANDOM = new SecureRandom();
    /** 32 random bytes in URL-safe Base64 without padding. */
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9_-]{43}");

    private final AppUserRepository appUserRepository;
    private final ApplicationRepository applicationRepository;
    private final AwardRepository awardRepository;

    @Transactional(readOnly = true)
    public String calendar(Long userId) {
        List<Application> applications = applicationRepository.findAllByOwnerIdWithItems(userId);
        List<Award> awards = awardRepository.findAllByOwnerIdWithLines(userId);
        return IcsCalendarWriter.write(CALENDAR_NAME, events(applications, awards), Instant.now());
    }

    /** The calendar behind a subscription link, or empty if the link isn't (or is no longer) valid. */
    @Transactional(readOnly = true)
    public Optional<String> calendarForToken(String token) {
        if (token == null || !TOKEN.matcher(token).matches()) {
            return Optional.empty();
        }
        return appUserRepository.findByCalendarTokenHash(hash(token)).map(user -> calendar(user.getId()));
    }

    @Transactional(readOnly = true)
    public boolean hasSubscriptionLink(Long userId) {
        return requireUser(userId).getCalendarTokenHash() != null;
    }

    /** Makes a new subscription token; any earlier link stops working. Returned once, never stored. */
    @Transactional
    public String newSubscriptionToken(Long userId) {
        AppUser user = requireUser(userId);
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        user.setCalendarTokenHash(hash(token));
        appUserRepository.save(user);
        return token;
    }

    @Transactional
    public void turnOffSubscriptionLink(Long userId) {
        AppUser user = requireUser(userId);
        user.setCalendarTokenHash(null);
        appUserRepository.save(user);
    }

    /**
     * Preparing applications contribute their deadline and open checklist
     * items; grants contribute their pending deadlines. Submitted, not
     * applicable, and finished applications are left out.
     */
    static List<IcsCalendarWriter.IcsEvent> events(List<Application> applications, List<Award> awards) {
        List<IcsCalendarWriter.IcsEvent> events = new ArrayList<>();
        for (Application application : applications) {
            if (application.getStatus() == ApplicationStatus.PREPARING) {
                events.addAll(IcsCalendarWriter.applicationEvents(application, application.getItems()));
            }
        }
        for (Award award : awards) {
            String prefix = "[" + IcsCalendarWriter.shorten(award.getProjectTitle()) + "] ";
            for (ComplianceEvent event : award.getEvents()) {
                if (event.getStatus() == ComplianceEventStatus.PENDING) {
                    events.add(new IcsCalendarWriter.IcsEvent(
                            "grant-deadline-" + event.getId() + "@fundsphere",
                            event.getDueDate(),
                            prefix + event.getTitle(),
                            description(award, event),
                            GRANT_REMINDER_DAYS));
                }
            }
        }
        return events;
    }

    private static String description(Award award, ComplianceEvent event) {
        StringBuilder text = new StringBuilder("Grant: ").append(award.getProjectTitle());
        if (award.getAgency() != null && !award.getAgency().isBlank()) {
            text.append(" (").append(award.getAgency()).append(")");
        }
        if (event.getPeriodStart() != null && event.getPeriodEnd() != null
                && (event.getType() == ComplianceEventType.UC_SE || event.getType() == ComplianceEventType.PROGRESS_REPORT)) {
            text.append("\nFor ").append(IcsCalendarWriter.READABLE.format(event.getPeriodStart()))
                    .append(" to ").append(IcsCalendarWriter.READABLE.format(event.getPeriodEnd()));
        }
        if (event.getType() == ComplianceEventType.UC_SE) {
            text.append("\nThe next instalment usually waits on this.");
        }
        if (event.getBasis() != null) {
            text.append("\nWhy this date: ").append(event.getBasis());
        }
        String portal = award.getSubmissionPortal() != null && award.getSubmissionPortal().url() != null
                ? award.getSubmissionPortal().url() : award.getPortalUrl();
        if (portal != null) {
            text.append("\nSubmit on: ").append(portal);
        }
        text.append("\nMark it submitted in FundSphere, under My grants.");
        return text.toString();
    }

    private AppUser requireUser(Long userId) {
        return appUserRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "User not found"));
    }

    static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is always available", ex);
        }
    }
}
