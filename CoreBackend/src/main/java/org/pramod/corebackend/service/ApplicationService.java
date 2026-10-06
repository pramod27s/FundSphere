/**
 * Application Readiness Workspace (Objective 3): the user's applications,
 * their requirements checklists and the readiness tracker.
 *
 * Every method takes the caller's user id and only touches applications
 * that user owns; anything else is reported as not found.
 */
package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.application.ApplicationCreateRequest;
import org.pramod.corebackend.dto.application.ApplicationResponse;
import org.pramod.corebackend.dto.application.ApplicationUpdateRequest;
import org.pramod.corebackend.dto.application.ChecklistItemRequest;
import org.pramod.corebackend.dto.application.ChecklistItemResponse;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.entity.Application;
import org.pramod.corebackend.entity.ApplicationStatusChange;
import org.pramod.corebackend.entity.ChecklistItem;
import org.pramod.corebackend.entity.Grant;
import org.pramod.corebackend.enums.ApplicationStatus;
import org.pramod.corebackend.enums.ChecklistCategory;
import org.pramod.corebackend.enums.ChecklistItemOrigin;
import org.pramod.corebackend.enums.ChecklistItemStatus;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.repository.ApplicationRepository;
import org.pramod.corebackend.repository.ChecklistItemRepository;
import org.pramod.corebackend.repository.GrantRepository;
import org.pramod.corebackend.repository.ProposalReviewRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
@RequiredArgsConstructor
public class ApplicationService {

    private static final int MAX_TITLE_LENGTH = 500;
    private static final int MAX_AGENCY_LENGTH = 300;
    private static final int MAX_URL_LENGTH = 2000;
    private static final int MAX_NOTES_LENGTH = 4000;
    private static final int MAX_ITEM_TEXT_LENGTH = 1000;
    private static final int MAX_OWNER_LENGTH = 120;
    private static final Pattern URL_SCHEME = Pattern.compile("^[a-zA-Z][a-zA-Z0-9+.-]*:");

    /** Result of POST /api/applications: created is false when the grant already had one. */
    public record CreateResult(ApplicationResponse application, boolean created) {
    }

    private final ApplicationRepository applicationRepository;
    private final ChecklistItemRepository checklistItemRepository;
    private final AppUserRepository appUserRepository;
    private final GrantRepository grantRepository;
    private final AiServiceClient aiServiceClient;
    private final TransactionTemplate transactionTemplate;
    private final GuidelineExtractionService guidelineExtractionService;
    private final ProposalReviewRepository proposalReviewRepository;

    // ------------------------------------------------------------------
    // Applications
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<ApplicationResponse> list(Long userId) {
        return applicationRepository.findAllByOwnerIdWithItems(userId).stream()
                .map(application -> toResponse(application, false))
                .toList();
    }

    /**
     * Starts an application. For a grant the user already has an application
     * for, returns that one instead of creating a duplicate.
     */
    @Transactional
    public CreateResult create(Long userId, ApplicationCreateRequest request) {
        if (request == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Request body is required");
        }
        AppUser owner = appUserRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "User not found"));

        Application.ApplicationBuilder builder = Application.builder()
                .owner(owner)
                .status(ApplicationStatus.PREPARING)
                .notes(clip(blankToNull(request.getNotes()), MAX_NOTES_LENGTH));

        if (request.getGrantId() != null) {
            var existing = applicationRepository.findFirstByOwnerIdAndGrantIdOrderByCreatedAtDesc(userId, request.getGrantId());
            if (existing.isPresent()) {
                return new CreateResult(toResponse(existing.get(), true), false);
            }
            Grant grant = grantRepository.findById(request.getGrantId())
                    .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Grant not found"));
            builder.grant(grant)
                    .title(clip(firstText(request.getTitle(), grant.getGrantTitle()), MAX_TITLE_LENGTH))
                    .agency(clip(firstText(request.getAgency(), grant.getFundingAgency()), MAX_AGENCY_LENGTH))
                    .callUrl(firstUrl(request.getCallUrl(), grant.getApplicationLink(), grant.getGrantUrl()))
                    .deadline(request.getDeadline() != null ? request.getDeadline()
                            : grant.getApplicationDeadline() == null ? null : grant.getApplicationDeadline().toLocalDate());
        } else {
            String title = blankToNull(request.getTitle());
            if (title == null) {
                throw new ResponseStatusException(BAD_REQUEST, "Give the call a title");
            }
            builder.title(clip(title, MAX_TITLE_LENGTH))
                    .agency(clip(blankToNull(request.getAgency()), MAX_AGENCY_LENGTH))
                    .callUrl(normaliseUrl(request.getCallUrl()))
                    .deadline(request.getDeadline());
        }

        Application application = builder.build();
        application.getStatusHistory().add(ApplicationStatusChange.builder()
                .application(application)
                .fromStatus(null)
                .toStatus(ApplicationStatus.PREPARING)
                .changedAt(LocalDateTime.now())
                .build());
        return new CreateResult(toResponse(applicationRepository.save(application), true), true);
    }

    @Transactional(readOnly = true)
    public ApplicationResponse get(Long userId, Long applicationId) {
        return toResponse(requireOwned(userId, applicationId), true);
    }

    @Transactional
    public ApplicationResponse update(Long userId, Long applicationId, ApplicationUpdateRequest request) {
        Application application = requireOwned(userId, applicationId);
        if (request == null) {
            return toResponse(application, true);
        }

        if (request.getTitle() != null) {
            String title = blankToNull(request.getTitle());
            if (title == null) {
                throw new ResponseStatusException(BAD_REQUEST, "Title can't be empty");
            }
            application.setTitle(clip(title, MAX_TITLE_LENGTH));
        }
        if (request.getAgency() != null) {
            application.setAgency(clip(blankToNull(request.getAgency()), MAX_AGENCY_LENGTH));
        }
        if (request.getCallUrl() != null) {
            application.setCallUrl(normaliseUrl(request.getCallUrl()));
        }
        if (request.getNotes() != null) {
            application.setNotes(clip(blankToNull(request.getNotes()), MAX_NOTES_LENGTH));
        }

        LocalDate newDeadline = Boolean.TRUE.equals(request.getClearDeadline()) ? null
                : request.getDeadline() != null ? request.getDeadline()
                : application.getDeadline();
        if (!Objects.equals(newDeadline, application.getDeadline())) {
            application.setDeadline(newDeadline);
            ChecklistDueDates.onDeadlineChanged(application.getItems(), newDeadline);
        }

        if (request.getStatus() != null && request.getStatus() != application.getStatus()) {
            LocalDateTime now = LocalDateTime.now();
            application.getStatusHistory().add(ApplicationStatusChange.builder()
                    .application(application)
                    .fromStatus(application.getStatus())
                    .toStatus(request.getStatus())
                    .changedAt(now)
                    .build());
            application.setStatus(request.getStatus());
            application.setStatusChangedAt(now);
        }

        return toResponse(applicationRepository.save(application), true);
    }

    @Transactional
    public void delete(Long userId, Long applicationId) {
        Application application = requireOwned(userId, applicationId);
        proposalReviewRepository.deleteAllByApplicationId(application.getId());
        applicationRepository.delete(application);
    }

    // ------------------------------------------------------------------
    // AI checklist (3.2)
    // ------------------------------------------------------------------

    /**
     * Extracts the requirements checklist from a guidelines PDF or a link
     * and replaces the application's AI items (items the user added stay).
     *
     * Not @Transactional: the AI call can take a minute, so it runs between
     * two short transactions instead of holding a database connection.
     */
    public ApplicationResponse extractChecklist(Long userId, Long applicationId, MultipartFile guidelinesPdf, String url) {
        boolean hasFile = guidelinesPdf != null && !guidelinesPdf.isEmpty();
        boolean hasUrl = url != null && !url.isBlank();
        if (hasFile == hasUrl) {
            throw new ResponseStatusException(BAD_REQUEST, "Upload the guidelines PDF or paste a link (one of the two)");
        }

        String title = transactionTemplate.execute(status -> requireOwned(userId, applicationId).getTitle());
        Map<String, Object> result = aiServiceClient.extractChecklist(
                hasFile ? guidelinesPdf : null, hasUrl ? url.strip() : null, title);

        return transactionTemplate.execute(status -> applyExtraction(requireOwned(userId, applicationId), result));
    }

    private ApplicationResponse applyExtraction(Application application, Map<String, Object> result) {
        // Stored once per guidelines document; the Proposal tab checks drafts against it.
        application.setGuidelineExtraction(guidelineExtractionService.store(result));
        application.getItems().removeIf(item -> item.getOrigin() == ChecklistItemOrigin.AI);

        LocalDate callDeadline = parseDate(result.get("call_deadline"));
        if (application.getDeadline() == null && callDeadline != null) {
            application.setDeadline(callDeadline);
            ChecklistDueDates.onDeadlineChanged(application.getItems(), callDeadline);
        }

        List<ChecklistItem> extracted = new ArrayList<>();
        if (result.get("items") instanceof List<?> rawItems) {
            for (Object raw : rawItems) {
                if (raw instanceof Map<?, ?> map) {
                    ChecklistItem item = fromExtraction(map, application);
                    if (item != null) {
                        extracted.add(item);
                    }
                }
            }
        }

        // AI items first in extraction order, then the user's own items.
        List<ChecklistItem> manual = new ArrayList<>(application.getItems());
        application.getItems().clear();
        int position = 0;
        for (ChecklistItem item : extracted) {
            item.setPosition(position++);
            application.getItems().add(item);
        }
        for (ChecklistItem item : manual) {
            item.setPosition(position++);
            application.getItems().add(item);
        }

        application.setGuidelinesSource(clip(asText(result.get("source_name")), MAX_URL_LENGTH));
        application.setChecklistWarnings(result.get("warnings") instanceof List<?> warnings && !warnings.isEmpty()
                ? String.join("\n", warnings.stream().map(String::valueOf).toList())
                : null);
        application.setChecklistGeneratedAt(LocalDateTime.now());
        return toResponse(applicationRepository.save(application), true);
    }

    private ChecklistItem fromExtraction(Map<?, ?> map, Application application) {
        String text = blankToNull(asText(map.get("text")));
        ChecklistCategory category = parseCategory(map.get("category"));
        if (text == null || category == null) {
            return null;
        }
        ChecklistItem item = ChecklistItem.builder()
                .application(application)
                .category(category)
                .text(clip(text, MAX_ITEM_TEXT_LENGTH))
                .mandatory(!Boolean.FALSE.equals(map.get("mandatory")))
                .signOff(Boolean.TRUE.equals(map.get("needs_signoff")))
                .sourceQuote(blankToNull(asText(map.get("source_quote"))))
                .sourcePage(map.get("source_page") instanceof Number page ? page.intValue() : null)
                .sourceVerified(Boolean.TRUE.equals(map.get("source_verified")))
                .status(ChecklistItemStatus.TODO)
                .origin(ChecklistItemOrigin.AI)
                .build();
        LocalDate ownDate = parseDate(map.get("date"));
        if (ownDate != null) {
            ChecklistDueDates.applyFixed(item, ownDate);
        } else {
            ChecklistDueDates.applyDefault(item, application.getDeadline());
        }
        return item;
    }

    // ------------------------------------------------------------------
    // Checklist items (3.2 edits, 3.3 readiness tracker)
    // ------------------------------------------------------------------

    @Transactional
    public ApplicationResponse addItem(Long userId, Long applicationId, ChecklistItemRequest request) {
        Application application = requireOwned(userId, applicationId);
        String text = request == null ? null : blankToNull(request.getText());
        if (text == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Describe the requirement");
        }
        ChecklistItem item = ChecklistItem.builder()
                .application(application)
                .category(request.getCategory() == null ? ChecklistCategory.DOCUMENTS : request.getCategory())
                .text(clip(text, MAX_ITEM_TEXT_LENGTH))
                .mandatory(!Boolean.FALSE.equals(request.getMandatory()))
                .signOff(Boolean.TRUE.equals(request.getSignOff()))
                .ownerName(clip(blankToNull(request.getOwnerName()), MAX_OWNER_LENGTH))
                .status(request.getStatus() == null ? ChecklistItemStatus.TODO : request.getStatus())
                .origin(ChecklistItemOrigin.MANUAL)
                .position(application.getItems().stream().mapToInt(ChecklistItem::getPosition).max().orElse(-1) + 1)
                .build();
        if (request.getDueDate() != null) {
            ChecklistDueDates.applyUserDate(item, request.getDueDate(), application.getDeadline());
        } else {
            ChecklistDueDates.applyDefault(item, application.getDeadline());
        }
        application.getItems().add(item);
        return toResponse(applicationRepository.save(application), true);
    }

    @Transactional
    public ApplicationResponse updateItem(Long userId, Long applicationId, Long itemId, ChecklistItemRequest request) {
        Application application = requireOwned(userId, applicationId);
        ChecklistItem item = checklistItemRepository.findByIdAndApplicationId(itemId, application.getId())
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Checklist item not found"));
        if (request == null) {
            return toResponse(application, true);
        }

        if (request.getText() != null) {
            String text = blankToNull(request.getText());
            if (text == null) {
                throw new ResponseStatusException(BAD_REQUEST, "The requirement can't be empty");
            }
            item.setText(clip(text, MAX_ITEM_TEXT_LENGTH));
        }
        if (request.getCategory() != null) {
            item.setCategory(request.getCategory());
        }
        if (request.getMandatory() != null) {
            item.setMandatory(request.getMandatory());
        }
        if (request.getSignOff() != null && request.getSignOff() != item.isSignOff()) {
            // Keep the default gap in step: an item still on the old default
            // moves to the new one (7 days for sign-offs, 3 otherwise).
            boolean onDefault = Objects.equals(item.getDueOffsetDays(), ChecklistDueDates.defaultOffset(item.isSignOff()));
            item.setSignOff(request.getSignOff());
            if (onDefault) {
                ChecklistDueDates.applyDefault(item, application.getDeadline());
            }
        }
        if (request.getOwnerName() != null) {
            item.setOwnerName(clip(blankToNull(request.getOwnerName()), MAX_OWNER_LENGTH));
        }
        if (Boolean.TRUE.equals(request.getClearDueDate())) {
            ChecklistDueDates.clear(item);
        } else if (request.getDueDate() != null) {
            ChecklistDueDates.applyUserDate(item, request.getDueDate(), application.getDeadline());
        }
        if (request.getStatus() != null) {
            item.setStatus(request.getStatus());
        }

        return toResponse(applicationRepository.save(application), true);
    }

    @Transactional
    public ApplicationResponse deleteItem(Long userId, Long applicationId, Long itemId) {
        Application application = requireOwned(userId, applicationId);
        boolean removed = application.getItems().removeIf(item -> item.getId().equals(itemId));
        if (!removed) {
            throw new ResponseStatusException(NOT_FOUND, "Checklist item not found");
        }
        return toResponse(applicationRepository.save(application), true);
    }

    // ------------------------------------------------------------------
    // Calendar (3.4)
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public CalendarFile calendar(Long userId, Long applicationId) {
        Application application = requireOwned(userId, applicationId);
        String ics = IcsCalendarWriter.write(application, application.getItems(), Instant.now());
        return new CalendarFile(slug(application.getTitle()) + ".ics", ics);
    }

    public record CalendarFile(String filename, String content) {
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private Application requireOwned(Long userId, Long applicationId) {
        return applicationRepository.findByIdAndOwnerId(applicationId, userId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Application not found"));
    }

    private ApplicationResponse toResponse(Application application, boolean detail) {
        List<ChecklistItem> items = application.getItems();
        ApplicationResponse.ApplicationResponseBuilder builder = ApplicationResponse.builder()
                .id(application.getId())
                .grantId(application.getGrant() == null ? null : application.getGrant().getId())
                .title(application.getTitle())
                .agency(application.getAgency())
                .callUrl(application.getCallUrl())
                .deadline(application.getDeadline())
                .status(application.getStatus())
                .statusChangedAt(application.getStatusChangedAt())
                .notes(application.getNotes())
                .guidelinesSource(application.getGuidelinesSource())
                .checklistWarnings(application.getChecklistWarnings() == null ? List.of()
                        : Arrays.stream(application.getChecklistWarnings().split("\n")).filter(w -> !w.isBlank()).toList())
                .checklistGeneratedAt(application.getChecklistGeneratedAt())
                .guidelineExtractionId(application.getGuidelineExtraction() == null ? null : application.getGuidelineExtraction().getId())
                .readiness(ReadinessCalculator.compute(items, LocalDate.now()))
                .itemCount(items.size())
                .createdAt(application.getCreatedAt())
                .updatedAt(application.getUpdatedAt());
        if (detail) {
            builder.items(items.stream().map(ApplicationService::toItemResponse).toList())
                    .statusHistory(application.getStatusHistory().stream()
                            .map(change -> new ApplicationResponse.StatusChangeResponse(
                                    change.getFromStatus(), change.getToStatus(), change.getChangedAt()))
                            .toList());
        }
        return builder.build();
    }

    private static ChecklistItemResponse toItemResponse(ChecklistItem item) {
        return ChecklistItemResponse.builder()
                .id(item.getId())
                .category(item.getCategory())
                .text(item.getText())
                .mandatory(item.isMandatory())
                .signOff(item.isSignOff())
                .sourceQuote(item.getSourceQuote())
                .sourcePage(item.getSourcePage())
                .sourceVerified(item.getSourceVerified())
                .ownerName(item.getOwnerName())
                .dueDate(item.getDueDate())
                .dueOffsetDays(item.getDueOffsetDays())
                .status(item.getStatus())
                .origin(item.getOrigin())
                .build();
    }

    private static ChecklistCategory parseCategory(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return ChecklistCategory.valueOf(value.toString().trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private static LocalDate parseDate(Object value) {
        String text = blankToNull(asText(value));
        if (text == null) {
            return null;
        }
        try {
            return LocalDate.parse(text.length() > 10 ? text.substring(0, 10) : text);
        } catch (DateTimeParseException ex) {
            return null;
        }
    }

    /**
     * Only http(s) links are stored: they're rendered as clickable links, so a
     * "javascript:" URL would be an XSS hole. A bare host gets https:// added.
     */
    static String normaliseUrl(String value) {
        String url = blankToNull(value);
        if (url == null) {
            return null;
        }
        if (URL_SCHEME.matcher(url).find()) {
            String lower = url.toLowerCase(Locale.ROOT);
            if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
                throw new ResponseStatusException(BAD_REQUEST, "The link must start with http:// or https://");
            }
        } else {
            url = "https://" + url;
        }
        return clip(url, MAX_URL_LENGTH);
    }

    /** Like normaliseUrl, but skips unusable values (scraped grant links) instead of rejecting them. */
    private static String firstUrl(String... candidates) {
        for (String candidate : candidates) {
            try {
                String url = normaliseUrl(candidate);
                if (url != null) {
                    return url;
                }
            } catch (ResponseStatusException ignored) {
                // try the next candidate
            }
        }
        return null;
    }

    private static String firstText(String... candidates) {
        for (String candidate : candidates) {
            String text = blankToNull(candidate);
            if (text != null) {
                return text;
            }
        }
        return null;
    }

    private static String asText(Object value) {
        return value == null ? null : value.toString();
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

    private static String slug(String title) {
        String slug = (title == null ? "" : title).toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        if (slug.length() > 60) {
            slug = slug.substring(0, 60).replaceAll("-+$", "");
        }
        return slug.isEmpty() ? "application" : slug;
    }
}
