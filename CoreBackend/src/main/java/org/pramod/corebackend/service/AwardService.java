/**
 * My grants (Objective 4, Grant Compliance Desk): the grants a user holds,
 * with their dates, portal and budget heads (4.1 "Add my grant"), and their
 * reporting deadlines (4.2 compliance calendar).
 *
 * Every method takes the caller's user id and only touches grants that
 * user owns; anything else is reported as not found.
 */
package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.award.AwardRequest;
import org.pramod.corebackend.dto.award.AwardResponse;
import org.pramod.corebackend.dto.award.ComplianceEventRequest;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.entity.Application;
import org.pramod.corebackend.entity.Award;
import org.pramod.corebackend.entity.BudgetLine;
import org.pramod.corebackend.entity.ComplianceEvent;
import org.pramod.corebackend.enums.AwardStatus;
import org.pramod.corebackend.enums.BudgetHead;
import org.pramod.corebackend.enums.ComplianceEventOrigin;
import org.pramod.corebackend.enums.ComplianceEventStatus;
import org.pramod.corebackend.enums.ComplianceEventType;
import org.pramod.corebackend.enums.ReportingProfile;
import org.pramod.corebackend.enums.SubmissionPortal;
import org.pramod.corebackend.enums.UnspentPolicy;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.repository.ApplicationRepository;
import org.pramod.corebackend.repository.AwardRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
@RequiredArgsConstructor
public class AwardService {

    private static final int MAX_TITLE_LENGTH = 500;
    private static final int MAX_AGENCY_LENGTH = 300;
    private static final int MAX_SCHEME_LENGTH = 300;
    private static final int MAX_SANCTION_NO_LENGTH = 200;
    /** ₹10,000 crore: anything larger is a typo, and it keeps sums far from overflow. */
    private static final long MAX_AMOUNT = 100_000_000_000L;
    /** Longer projects are almost always a mistyped year, and 4.2 makes events for every year. */
    private static final int MAX_PROJECT_YEARS = 15;
    private static final int MAX_EVENT_TITLE_LENGTH = 300;

    /** Result of POST /api/awards: created is false when the application already had a grant. */
    public record CreateResult(AwardResponse award, boolean created) {
    }

    private final AwardRepository awardRepository;
    private final AppUserRepository appUserRepository;
    private final ApplicationRepository applicationRepository;

    /** Not read-only: grants added before deadlines existed get theirs on first read. */
    @Transactional
    public List<AwardResponse> list(Long userId) {
        return awardRepository.findAllByOwnerIdWithLines(userId).stream()
                .peek(AwardService::ensureSchedule)
                .map(AwardService::toResponse)
                .toList();
    }

    /**
     * Adds a grant. From an application that already has one, returns that
     * grant instead of creating a duplicate.
     */
    @Transactional
    public CreateResult create(Long userId, AwardRequest request) {
        if (request == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Request body is required");
        }
        AppUser owner = appUserRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "User not found"));

        Application application = null;
        if (request.getApplicationId() != null) {
            var existing = awardRepository.findFirstByOwnerIdAndApplicationId(userId, request.getApplicationId());
            if (existing.isPresent()) {
                return new CreateResult(toResponse(existing.get()), false);
            }
            application = applicationRepository.findByIdAndOwnerId(request.getApplicationId(), userId)
                    .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Application not found"));
        }

        Award award = Award.builder()
                .owner(owner)
                .application(application)
                .status(request.getStatus() == null ? AwardStatus.ACTIVE : request.getStatus())
                .build();
        applyForm(award, request);
        return new CreateResult(toResponse(awardRepository.save(award)), true);
    }

    @Transactional
    public AwardResponse get(Long userId, Long awardId) {
        Award award = requireOwned(userId, awardId);
        ensureSchedule(award);
        return toResponse(award);
    }

    /** Replaces the grant's details and budget heads with the form's values. */
    @Transactional
    public AwardResponse update(Long userId, Long awardId, AwardRequest request) {
        Award award = requireOwned(userId, awardId);
        if (request == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Request body is required");
        }
        applyForm(award, request);
        if (request.getStatus() != null) {
            award.setStatus(request.getStatus());
        }
        return toResponse(awardRepository.save(award));
    }

    @Transactional
    public void delete(Long userId, Long awardId) {
        awardRepository.delete(requireOwned(userId, awardId));
    }

    // ------------------------------------------------------------------
    // Reporting deadlines (4.2)
    // ------------------------------------------------------------------

    /** Adds a deadline of the PI's own, e.g. a mid-term review or a milestone report. */
    @Transactional
    public AwardResponse addEvent(Long userId, Long awardId, ComplianceEventRequest request) {
        Award award = requireOwned(userId, awardId);
        String title = request == null ? null : blankToNull(request.getTitle());
        if (title == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Say what is due, e.g. Mid-term review presentation");
        }
        if (request.getDueDate() == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Give the deadline a due date");
        }
        award.getEvents().add(ComplianceEvent.builder()
                .award(award)
                .type(ComplianceEventType.CUSTOM)
                .title(clip(title, MAX_EVENT_TITLE_LENGTH))
                .dueDate(request.getDueDate())
                .origin(ComplianceEventOrigin.MANUAL)
                .status(ComplianceEventStatus.PENDING)
                .build());
        return toResponse(awardRepository.save(award));
    }

    /** Marks a deadline submitted, pending or not applicable, moves its date, or renames one the PI added. */
    @Transactional
    public AwardResponse updateEvent(Long userId, Long awardId, Long eventId, ComplianceEventRequest request) {
        Award award = requireOwned(userId, awardId);
        ComplianceEvent event = requireEvent(award, eventId);
        if (request == null) {
            return toResponse(award);
        }
        boolean fromRules = event.getOrigin() == ComplianceEventOrigin.RULE;

        if (request.getTitle() != null) {
            if (fromRules) {
                throw new ResponseStatusException(BAD_REQUEST, "Deadlines worked out from the grant's dates keep their name");
            }
            String title = blankToNull(request.getTitle());
            if (title == null) {
                throw new ResponseStatusException(BAD_REQUEST, "The deadline needs a name");
            }
            event.setTitle(clip(title, MAX_EVENT_TITLE_LENGTH));
        }

        if (Boolean.TRUE.equals(request.getResetDueDate())) {
            LocalDate ruleDate = ComplianceSchedule.ruleDueDate(award, event);
            if (ruleDate != null) {
                event.setDueDate(ruleDate);
                event.setDueDateEdited(false);
            }
        } else if (request.getDueDate() != null) {
            event.setDueDate(request.getDueDate());
            event.setDueDateEdited(fromRules && !request.getDueDate().equals(ComplianceSchedule.ruleDueDate(award, event)));
        }

        LocalDate today = LocalDate.now();
        if (request.getStatus() != null) {
            event.setStatus(request.getStatus());
            if (request.getStatus() == ComplianceEventStatus.SUBMITTED) {
                LocalDate on = request.getSubmittedOn() != null ? request.getSubmittedOn()
                        : event.getSubmittedOn() != null ? event.getSubmittedOn() : today;
                event.setSubmittedOn(checkSubmittedOn(on, today));
            } else {
                event.setSubmittedOn(null);
            }
        } else if (request.getSubmittedOn() != null && event.getStatus() == ComplianceEventStatus.SUBMITTED) {
            event.setSubmittedOn(checkSubmittedOn(request.getSubmittedOn(), today));
        }
        return toResponse(awardRepository.save(award));
    }

    /** Removes a deadline the PI added. Ones from the rules are marked not applicable instead. */
    @Transactional
    public AwardResponse deleteEvent(Long userId, Long awardId, Long eventId) {
        Award award = requireOwned(userId, awardId);
        ComplianceEvent event = requireEvent(award, eventId);
        if (event.getOrigin() == ComplianceEventOrigin.RULE) {
            throw new ResponseStatusException(BAD_REQUEST,
                    "This deadline comes from the grant's dates. Mark it not applicable instead");
        }
        award.getEvents().remove(event);
        return toResponse(awardRepository.save(award));
    }

    /**
     * For a grant added while it was already running: marks every pending
     * deadline that passed before it was added as submitted, with no date.
     */
    @Transactional
    public AwardResponse submitPastEvents(Long userId, Long awardId) {
        Award award = requireOwned(userId, awardId);
        LocalDate added = award.getCreatedAt() == null ? LocalDate.now() : award.getCreatedAt().toLocalDate();
        for (ComplianceEvent event : award.getEvents()) {
            if (event.getStatus() == ComplianceEventStatus.PENDING && event.getDueDate().isBefore(added)) {
                event.setStatus(ComplianceEventStatus.SUBMITTED);
                event.setSubmittedOn(null);
            }
        }
        return toResponse(awardRepository.save(award));
    }

    private static ComplianceEvent requireEvent(Award award, Long eventId) {
        return award.getEvents().stream()
                .filter(event -> event.getId() != null && event.getId().equals(eventId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Deadline not found"));
    }

    private static LocalDate checkSubmittedOn(LocalDate on, LocalDate today) {
        if (on.isAfter(today)) {
            throw new ResponseStatusException(BAD_REQUEST, "The submission date can't be in the future");
        }
        return on;
    }

    /** Grants saved before deadlines existed have none; work them out on first read. */
    private static void ensureSchedule(Award award) {
        if (award.getEvents().isEmpty()) {
            ComplianceSchedule.sync(award);
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private Award requireOwned(Long userId, Long awardId) {
        return awardRepository.findByIdAndOwnerId(awardId, userId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Grant not found"));
    }

    /** Validates the form and copies it onto the grant. */
    private static void applyForm(Award award, AwardRequest request) {
        String projectTitle = blankToNull(request.getProjectTitle());
        if (projectTitle == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Give the project a title");
        }
        if (request.getStartDate() == null || request.getEndDate() == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Add the project's start and end dates");
        }
        if (!request.getEndDate().isAfter(request.getStartDate())) {
            throw new ResponseStatusException(BAD_REQUEST, "The end date must be after the start date");
        }
        if (request.getEndDate().isAfter(request.getStartDate().plusYears(MAX_PROJECT_YEARS))) {
            throw new ResponseStatusException(BAD_REQUEST,
                    "The project runs more than " + MAX_PROJECT_YEARS + " years. Check the start and end dates");
        }
        Long total = request.getTotalSanctioned();
        checkAmount(total, "The total sanctioned amount");

        SubmissionPortal portal = request.getSubmissionPortal() == null ? SubmissionPortal.OTHER : request.getSubmissionPortal();

        award.setProjectTitle(clip(projectTitle, MAX_TITLE_LENGTH));
        award.setAgency(clip(blankToNull(request.getAgency()), MAX_AGENCY_LENGTH));
        award.setScheme(clip(blankToNull(request.getScheme()), MAX_SCHEME_LENGTH));
        award.setSanctionNo(clip(blankToNull(request.getSanctionNo()), MAX_SANCTION_NO_LENGTH));
        award.setSanctionDate(request.getSanctionDate());
        award.setStartDate(request.getStartDate());
        award.setEndDate(request.getEndDate());
        award.setTotalSanctioned(total == null || total == 0 ? null : total);
        award.setSubmissionPortal(portal);
        // A known portal has its own link; a pasted one would only go stale.
        award.setPortalUrl(portal == SubmissionPortal.OTHER ? ApplicationService.normaliseUrl(request.getPortalUrl()) : null);
        award.setUnspentPolicy(request.getUnspentPolicy() == null ? UnspentPolicy.UNKNOWN : request.getUnspentPolicy());
        award.setReportingProfile(request.getReportingProfile() == null ? ReportingProfile.OTHER : request.getReportingProfile());
        applyBudget(award, request.getBudgetLines());
        // New dates or a new profile move the deadlines; the PI's own changes to them stay.
        ComplianceSchedule.sync(award);
    }

    /**
     * Sets each head's allocation. Existing lines are updated in place rather
     * than replaced, so anything later attached to a line keeps its row.
     */
    private static void applyBudget(Award award, List<AwardRequest.BudgetLineRequest> lines) {
        Map<BudgetHead, Long> allocations = new EnumMap<>(BudgetHead.class);
        for (AwardRequest.BudgetLineRequest line : lines == null ? List.<AwardRequest.BudgetLineRequest>of() : lines) {
            if (line == null || line.head() == null) {
                throw new ResponseStatusException(BAD_REQUEST, "Each budget line needs a head");
            }
            String label = headLabel(line.head());
            checkAmount(line.allocated(), label);
            if (allocations.containsKey(line.head())) {
                throw new ResponseStatusException(BAD_REQUEST, label + " is listed twice");
            }
            allocations.put(line.head(), line.allocated() == null ? 0L : line.allocated());
        }

        List<BudgetLine> current = award.getBudgetLines();
        current.removeIf(existing -> allocations.getOrDefault(existing.getHead(), 0L) == 0L);
        allocations.forEach((head, amount) -> {
            if (amount == 0L) {
                return;
            }
            current.stream()
                    .filter(existing -> existing.getHead() == head)
                    .findFirst()
                    .ifPresentOrElse(
                            existing -> existing.setAllocated(amount),
                            () -> current.add(BudgetLine.builder().award(award).head(head).allocated(amount).build()));
        });
    }

    private static void checkAmount(Long amount, String what) {
        if (amount == null) {
            return;
        }
        if (amount < 0) {
            throw new ResponseStatusException(BAD_REQUEST, what + " can't be negative");
        }
        if (amount > MAX_AMOUNT) {
            throw new ResponseStatusException(BAD_REQUEST, what + " is more than ₹10,000 crore. Check the amount");
        }
    }

    static AwardResponse toResponse(Award award) {
        List<AwardResponse.BudgetLineResponse> lines = award.getBudgetLines().stream()
                .sorted(Comparator.comparing(BudgetLine::getHead))
                .map(line -> new AwardResponse.BudgetLineResponse(line.getId(), line.getHead(), line.getAllocated()))
                .toList();
        SubmissionPortal portal = award.getSubmissionPortal();
        LocalDate today = LocalDate.now();
        List<AwardResponse.EventResponse> events = award.getEvents().stream()
                .sorted(Comparator.comparing(ComplianceEvent::getDueDate)
                        .thenComparing(event -> event.getId() == null ? Long.MAX_VALUE : event.getId()))
                .map(AwardService::toEventResponse)
                .toList();
        List<AwardResponse.EventResponse> pending = events.stream()
                .filter(event -> event.status() == ComplianceEventStatus.PENDING)
                .toList();
        return AwardResponse.builder()
                .id(award.getId())
                .applicationId(award.getApplication() == null ? null : award.getApplication().getId())
                .projectTitle(award.getProjectTitle())
                .agency(award.getAgency())
                .scheme(award.getScheme())
                .sanctionNo(award.getSanctionNo())
                .sanctionDate(award.getSanctionDate())
                .startDate(award.getStartDate())
                .endDate(award.getEndDate())
                .totalSanctioned(award.getTotalSanctioned())
                .allocatedTotal(lines.stream().mapToLong(AwardResponse.BudgetLineResponse::allocated).sum())
                .submissionPortal(portal)
                .portalUrl(portal.url() != null ? portal.url() : award.getPortalUrl())
                .unspentPolicy(award.getUnspentPolicy())
                .reportingProfile(award.getReportingProfile())
                .status(award.getStatus())
                .budgetLines(lines)
                .events(events)
                .nextEvent(pending.isEmpty() ? null : pending.get(0))
                .overdueCount((int) pending.stream().filter(event -> event.dueDate().isBefore(today)).count())
                .createdAt(award.getCreatedAt())
                .updatedAt(award.getUpdatedAt())
                .build();
    }

    private static AwardResponse.EventResponse toEventResponse(ComplianceEvent event) {
        return new AwardResponse.EventResponse(event.getId(), event.getType(), event.getTitle(),
                event.getPeriodStart(), event.getPeriodEnd(), event.getDueDate(), event.isDueDateEdited(),
                event.getStatus(), event.getSubmittedOn(), event.getOrigin(), event.getBasis());
    }

    /** "CONSUMABLES" -> "Consumables", for error messages. */
    private static String headLabel(BudgetHead head) {
        String name = head.name().toLowerCase(Locale.ROOT);
        return Character.toUpperCase(name.charAt(0)) + name.substring(1);
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.strip();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String clip(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}
