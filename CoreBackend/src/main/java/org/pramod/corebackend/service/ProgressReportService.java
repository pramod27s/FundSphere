/**
 * Progress-report drafts (Objective 4, 4.4). Spring Boot owns the records: it
 * gathers what a report may say (the grant's details, the period, the
 * objectives, the outputs the PI chose, the budget heads and the PI's note)
 * and sends them to the ai-service, which writes the draft and checks every
 * sentence against them. Drafts are stored here, and after each edit the
 * draft is checked again against the records as they are then, so a
 * sentence citing an output that was since deleted shows as unsupported.
 *
 * Every method takes the caller's user id and only touches grants that user
 * owns; anything else is reported as not found. The AI calls run between
 * two short transactions instead of holding a database connection.
 */
package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.award.DraftResponse;
import org.pramod.corebackend.dto.award.GenerateDraftRequest;
import org.pramod.corebackend.dto.award.UpdateDraftRequest;
import org.pramod.corebackend.entity.Award;
import org.pramod.corebackend.entity.AwardOutput;
import org.pramod.corebackend.entity.BudgetLine;
import org.pramod.corebackend.entity.ComplianceEvent;
import org.pramod.corebackend.entity.GeneratedDraft;
import org.pramod.corebackend.enums.ReportKind;
import org.pramod.corebackend.repository.AwardRepository;
import org.pramod.corebackend.repository.GeneratedDraftRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONTENT_TOO_LARGE;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
@RequiredArgsConstructor
public class ProgressReportService {

    private static final int MAX_NOTES_LENGTH = 3000;
    private static final int MAX_DRAFTS_PER_GRANT = 50;
    /** An edited draft larger than this is not a progress report. */
    private static final int MAX_CONTENT_CHARS = 1_000_000;
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    /** Oldest first, as a report lists them; undated ones last. */
    private static final Comparator<AwardOutput> CHRONOLOGICAL = Comparator
            .comparing(AwardOutput::getOutputDate, Comparator.nullsLast(Comparator.<String>naturalOrder()))
            .thenComparing(output -> output.getId() == null ? Long.MAX_VALUE : output.getId());

    private final AwardRepository awardRepository;
    private final GeneratedDraftRepository draftRepository;
    private final AiServiceClient aiServiceClient;
    private final TransactionTemplate transactionTemplate;
    private final ObjectMapper objectMapper;

    /** What a new draft is about, worked out before the AI call. */
    private record Plan(ReportKind kind, String title, LocalDate start, LocalDate end, Long eventId,
                        List<Long> outputIds, String notes, Map<String, Object> input) {
    }

    /** The grant's drafts, newest first, without their content. */
    @Transactional(readOnly = true)
    public List<DraftResponse> list(Long userId, Long awardId) {
        requireOwned(userId, awardId);
        return draftRepository.findAllByAwardIdOrderByCreatedAtDesc(awardId).stream()
                .map(draft -> toResponse(draft, false))
                .toList();
    }

    @Transactional(readOnly = true)
    public DraftResponse get(Long userId, Long awardId, Long draftId) {
        requireOwned(userId, awardId);
        return toResponse(requireDraft(awardId, draftId), true);
    }

    /** Drafts a report and stores it. Not @Transactional: writing takes up to a minute. */
    public DraftResponse generate(Long userId, Long awardId, GenerateDraftRequest request) {
        if (request == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Request body is required");
        }
        Plan plan = transactionTemplate.execute(status -> plan(requireOwned(userId, awardId), request));
        Map<String, Object> result = aiServiceClient.generateDraft(plan.input());
        return transactionTemplate.execute(status -> {
            GeneratedDraft draft = GeneratedDraft.builder()
                    .award(requireOwned(userId, awardId))
                    .kind(plan.kind())
                    .title(plan.title())
                    .periodStart(plan.start())
                    .periodEnd(plan.end())
                    .eventId(plan.eventId())
                    .outputIds(joinIds(plan.outputIds()))
                    .notes(plan.notes())
                    .build();
            apply(draft, result, null);
            return toResponse(draftRepository.save(draft), true);
        });
    }

    /** Stores the PI's edits after checking every sentence against the grant's current records. */
    public DraftResponse update(Long userId, Long awardId, Long draftId, UpdateDraftRequest request) {
        if (request == null || request.getSections() == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Send the draft's sections");
        }
        if (objectMapper.writeValueAsString(request.getSections()).length() > MAX_CONTENT_CHARS) {
            throw new ResponseStatusException(CONTENT_TOO_LARGE, "The draft is too long to save");
        }
        record Current(Map<String, Object> input, String title, Object warnings) {
        }
        Current current = transactionTemplate.execute(status -> {
            Award award = requireOwned(userId, awardId);
            GeneratedDraft draft = requireDraft(awardId, draftId);
            List<AwardOutput> outputs = outputsStillOnGrant(award, splitIds(draft.getOutputIds()));
            return new Current(reportInput(award, draft.getKind(), draft.getTitle(), draft.getPeriodStart(),
                    draft.getPeriodEnd(), outputs, draft.getNotes()), draft.getTitle(), readContent(draft).get("warnings"));
        });
        Map<String, Object> result = aiServiceClient.checkDraft(current.input(), current.title(), request.getSections());
        return transactionTemplate.execute(status -> {
            requireOwned(userId, awardId);
            GeneratedDraft draft = requireDraft(awardId, draftId);
            apply(draft, result, current.warnings());
            return toResponse(draftRepository.save(draft), true);
        });
    }

    @Transactional
    public void delete(Long userId, Long awardId, Long draftId) {
        requireOwned(userId, awardId);
        draftRepository.delete(requireDraft(awardId, draftId));
    }

    /** A Word file and the name to save it under. */
    public record Export(String fileName, byte[] content) {
    }

    /**
     * The draft as a Word document, marked as a draft, with the check's counts
     * at the top. Exporting isn't blocked by unsupported sentences: the PI
     * decides, and the document says how many there are and shows them in red.
     */
    @Transactional(readOnly = true)
    public Export export(Long userId, Long awardId, Long draftId) {
        requireOwned(userId, awardId);
        GeneratedDraft draft = requireDraft(awardId, draftId);
        Map<String, Object> content = readContent(draft);
        String title = content.get("title") instanceof String s && !s.isBlank() ? s : draft.getTitle();
        String subtitle = "Period covered: " + DAY.format(draft.getPeriodStart()) + " to " + DAY.format(draft.getPeriodEnd())
                + (draft.getCreatedAt() == null ? "" : " · drafted " + DAY.format(draft.getCreatedAt()));
        DocxReportWriter.Report report = new DocxReportWriter.Report(title, subtitle, draft.getUnsupportedCount(),
                draft.getPlaceholderCount(), draft.getConfirmedCount(), docxSections(content.get("sections")));
        return new Export(fileName(draft.getTitle()), DocxReportWriter.write(report, Instant.now()));
    }

    /** The stored sections as the Word writer's model; each sentence marked from its check result. */
    static List<DocxReportWriter.Section> docxSections(Object rawSections) {
        List<DocxReportWriter.Section> sections = new ArrayList<>();
        for (Map<?, ?> section : maps(rawSections)) {
            List<DocxReportWriter.Block> blocks = new ArrayList<>();
            for (Map<?, ?> block : maps(section.get("blocks"))) {
                List<DocxReportWriter.Sentence> sentences = new ArrayList<>();
                for (Map<?, ?> sentence : maps(block.get("sentences"))) {
                    String text = sentence.get("text") instanceof String s ? s : "";
                    if (text.isBlank()) {
                        continue;
                    }
                    DocxReportWriter.Mark mark = Boolean.TRUE.equals(sentence.get("placeholder"))
                            ? DocxReportWriter.Mark.PLACEHOLDER
                            : Boolean.FALSE.equals(sentence.get("supported")) && !Boolean.TRUE.equals(sentence.get("confirmed"))
                            ? DocxReportWriter.Mark.UNSUPPORTED
                            : DocxReportWriter.Mark.NORMAL;
                    sentences.add(new DocxReportWriter.Sentence(text, mark));
                }
                blocks.add(new DocxReportWriter.Block(block.get("heading") instanceof String h ? h : null,
                        "list".equals(block.get("style")), sentences));
            }
            sections.add(new DocxReportWriter.Section(section.get("heading") instanceof String h ? h : "", blocks));
        }
        return sections;
    }

    /** "Annual progress report, year 1" → "Annual-progress-report-year-1-DRAFT.docx". */
    static String fileName(String title) {
        String base = (title == null ? "" : title).replaceAll("[^A-Za-z0-9]+", "-").replaceAll("^-+|-+$", "");
        if (base.length() > 80) {
            base = base.substring(0, 80).replaceAll("-+$", "");
        }
        return (base.isEmpty() ? "Progress-report" : base) + "-DRAFT.docx";
    }

    private static List<Map<?, ?>> maps(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        List<Map<?, ?>> maps = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> map) {
                maps.add(map);
            }
        }
        return maps;
    }

    // ------------------------------------------------------------------
    // What goes into a draft
    // ------------------------------------------------------------------

    private Plan plan(Award award, GenerateDraftRequest request) {
        if (draftRepository.countByAwardId(award.getId()) >= MAX_DRAFTS_PER_GRANT) {
            throw new ResponseStatusException(BAD_REQUEST,
                    "This grant has " + MAX_DRAFTS_PER_GRANT + " drafts. Delete some old ones first");
        }
        ReportKind kind;
        String title;
        LocalDate start;
        LocalDate end;
        Long eventId = null;
        if (request.getEventId() != null) {
            ComplianceEvent event = award.getEvents().stream()
                    .filter(e -> request.getEventId().equals(e.getId()))
                    .findFirst()
                    .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Deadline not found"));
            kind = switch (event.getType()) {
                case PROGRESS_REPORT -> ReportKind.PROGRESS_REPORT;
                case FINAL_REPORT -> ReportKind.FINAL_REPORT;
                default -> throw new ResponseStatusException(BAD_REQUEST,
                        "Only progress-report and final-report deadlines have a report to draft");
            };
            title = event.getTitle();
            start = event.getPeriodStart() != null ? event.getPeriodStart() : award.getStartDate();
            end = event.getPeriodEnd() != null ? event.getPeriodEnd() : award.getEndDate();
            eventId = event.getId();
        } else {
            kind = request.getKind() == null ? ReportKind.PROGRESS_REPORT : request.getKind();
            boolean wholeProject = kind == ReportKind.FINAL_REPORT;
            start = request.getPeriodStart() != null ? request.getPeriodStart() : wholeProject ? award.getStartDate() : null;
            end = request.getPeriodEnd() != null ? request.getPeriodEnd() : wholeProject ? award.getEndDate() : null;
            if (start == null || end == null) {
                throw new ResponseStatusException(BAD_REQUEST, "Choose the period the report covers");
            }
            if (!end.isAfter(start)) {
                throw new ResponseStatusException(BAD_REQUEST, "The period must end after it starts");
            }
            if (start.isBefore(award.getStartDate()) || end.isAfter(award.getEndDate())) {
                throw new ResponseStatusException(BAD_REQUEST, "The period must fall within the project ("
                        + DAY.format(award.getStartDate()) + " to " + DAY.format(award.getEndDate()) + ")");
            }
            title = wholeProject ? "Final technical report"
                    : "Progress report, " + DAY.format(start) + " to " + DAY.format(end);
        }
        List<AwardOutput> outputs = chooseOutputs(award, request.getOutputIds(), start, end);
        String notes = clip(blankToNull(request.getNotes()), MAX_NOTES_LENGTH);
        return new Plan(kind, title, start, end, eventId, outputs.stream().map(AwardOutput::getId).toList(), notes,
                reportInput(award, kind, title, start, end, outputs, notes));
    }

    /**
     * The outputs the PI ticked, or by default those dated within the period
     * plus the undated ones (which may belong to it; the PI can untick them).
     */
    static List<AwardOutput> chooseOutputs(Award award, List<Long> outputIds, LocalDate start, LocalDate end) {
        if (outputIds == null) {
            return award.getOutputs().stream()
                    .filter(o -> o.getOutputDate() == null || PartialDates.overlaps(o.getOutputDate(), start, end))
                    .sorted(CHRONOLOGICAL)
                    .toList();
        }
        Map<Long, AwardOutput> byId = award.getOutputs().stream()
                .filter(o -> o.getId() != null)
                .collect(Collectors.toMap(AwardOutput::getId, Function.identity()));
        List<AwardOutput> chosen = new ArrayList<>();
        for (Long id : new LinkedHashSet<>(outputIds)) {
            AwardOutput output = byId.get(id);
            if (output == null) {
                throw new ResponseStatusException(BAD_REQUEST, "One of the chosen outputs isn't on this grant. Reload the page");
            }
            chosen.add(output);
        }
        chosen.sort(CHRONOLOGICAL);
        return chosen;
    }

    /** For re-checks: the draft's outputs that still exist. Deleted ones simply drop out. */
    private static List<AwardOutput> outputsStillOnGrant(Award award, List<Long> outputIds) {
        return award.getOutputs().stream()
                .filter(o -> o.getId() != null && outputIds.contains(o.getId()))
                .sorted(CHRONOLOGICAL)
                .toList();
    }

    /** The records a draft may draw on, keyed as the ai-service's ReportInput. */
    static Map<String, Object> reportInput(Award award, ReportKind kind, String title, LocalDate start, LocalDate end,
                                           List<AwardOutput> outputs, String notes) {
        Map<String, Object> grant = new LinkedHashMap<>();
        grant.put("project_title", award.getProjectTitle());
        grant.put("agency", award.getAgency());
        grant.put("scheme", award.getScheme());
        grant.put("sanction_no", award.getSanctionNo());
        grant.put("sanction_date", award.getSanctionDate() == null ? null : award.getSanctionDate().toString());
        grant.put("start_date", award.getStartDate().toString());
        grant.put("end_date", award.getEndDate().toString());
        grant.put("total_sanctioned", award.getTotalSanctioned());

        List<Map<String, Object>> outputEntries = outputs.stream().map(output -> {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("id", output.getId());
            entry.put("type", output.getType().name());
            entry.put("title", output.getTitle());
            entry.put("details", output.getDetails());
            entry.put("date", output.getOutputDate());
            entry.put("amount", output.getAmount());
            entry.put("reference", output.getReference());
            return entry;
        }).toList();

        List<Map<String, Object>> budget = award.getBudgetLines().stream()
                .sorted(Comparator.comparing(BudgetLine::getHead))
                .map(line -> {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("head", line.getHead().name());
                    entry.put("allocated", line.getAllocated());
                    return entry;
                })
                .toList();

        Map<String, Object> input = new LinkedHashMap<>();
        input.put("kind", kind.name());
        input.put("title", title);
        input.put("period_start", start.toString());
        input.put("period_end", end.toString());
        input.put("grant", grant);
        input.put("objectives", award.getObjectives() == null ? List.of() : List.of(award.getObjectives().split("\n")));
        input.put("outputs", outputEntries);
        input.put("budget", budget);
        input.put("notes", notes);
        return input;
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    /**
     * Stores the ai-service's draft and its counts. warningsToKeep replaces the
     * result's warnings on a re-check, which has none of its own.
     */
    private void apply(GeneratedDraft draft, Map<String, Object> result, Object warningsToKeep) {
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("title", result.get("title"));
        content.put("sections", result.getOrDefault("sections", List.of()));
        content.put("entries", result.getOrDefault("entries", List.of()));
        content.put("warnings", warningsToKeep != null ? warningsToKeep : result.getOrDefault("warnings", List.of()));
        draft.setContent(objectMapper.writeValueAsString(content));
        String model = blankToNull(result.get("model") instanceof String s ? s : null);
        if (model != null) {
            draft.setModel(clip(model, 100));
        }
        draft.setUnsupportedCount(count(result.get("unsupported_count")));
        draft.setPlaceholderCount(count(result.get("placeholder_count")));
        draft.setConfirmedCount(count(result.get("confirmed_count")));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readContent(GeneratedDraft draft) {
        return objectMapper.readValue(draft.getContent(), Map.class);
    }

    private DraftResponse toResponse(GeneratedDraft draft, boolean withContent) {
        return new DraftResponse(draft.getId(), draft.getAward().getId(), draft.getKind(), draft.getTitle(),
                draft.getPeriodStart(), draft.getPeriodEnd(), draft.getEventId(), splitIds(draft.getOutputIds()),
                draft.getNotes(), draft.getModel(), draft.getUnsupportedCount(), draft.getPlaceholderCount(),
                draft.getConfirmedCount(), withContent ? readContent(draft) : null, draft.getCreatedAt(),
                draft.getUpdatedAt());
    }

    private Award requireOwned(Long userId, Long awardId) {
        return awardRepository.findByIdAndOwnerId(awardId, userId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Grant not found"));
    }

    private GeneratedDraft requireDraft(Long awardId, Long draftId) {
        return draftRepository.findByIdAndAwardId(draftId, awardId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Draft not found"));
    }

    private static int count(Object value) {
        return value instanceof Number number ? number.intValue() : 0;
    }

    private static String joinIds(List<Long> ids) {
        return ids.isEmpty() ? null : ids.stream().map(String::valueOf).collect(Collectors.joining(","));
    }

    private static List<Long> splitIds(String ids) {
        if (ids == null || ids.isBlank()) {
            return List.of();
        }
        return Arrays.stream(ids.split(","))
                .map(String::strip)
                .filter(id -> !id.isEmpty() && id.chars().allMatch(Character::isDigit))
                .map(Long::valueOf)
                .toList();
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
