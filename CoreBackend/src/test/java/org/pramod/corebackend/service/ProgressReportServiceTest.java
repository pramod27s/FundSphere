package org.pramod.corebackend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pramod.corebackend.dto.award.DraftResponse;
import org.pramod.corebackend.dto.award.GenerateDraftRequest;
import org.pramod.corebackend.dto.award.UpdateDraftRequest;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.entity.Award;
import org.pramod.corebackend.entity.AwardOutput;
import org.pramod.corebackend.entity.BudgetLine;
import org.pramod.corebackend.entity.ComplianceEvent;
import org.pramod.corebackend.entity.GeneratedDraft;
import org.pramod.corebackend.enums.AwardOutputSource;
import org.pramod.corebackend.enums.AwardOutputType;
import org.pramod.corebackend.enums.BudgetHead;
import org.pramod.corebackend.enums.ComplianceEventType;
import org.pramod.corebackend.enums.ReportKind;
import org.pramod.corebackend.enums.ReportingProfile;
import org.pramod.corebackend.repository.AwardRepository;
import org.pramod.corebackend.repository.GeneratedDraftRepository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProgressReportServiceTest {

    private static final Long USER_ID = 7L;
    private static final Long AWARD_ID = 3L;

    @Mock
    private AwardRepository awardRepository;
    @Mock
    private GeneratedDraftRepository draftRepository;
    @Mock
    private AiServiceClient aiServiceClient;

    private final ObjectMapper objectMapper = JsonMapper.builder().build();
    private ProgressReportService service;
    private Award award;

    /** What the ai-service answers: a one-sentence draft with counts. */
    private static Map<String, Object> aiDraft(int unsupported, String model) {
        Map<String, Object> sentence = Map.of("id", "s1", "text", "Ravi Kumar joined in September 2026.",
                "sources", List.of("out_2"), "supported", unsupported == 0, "problems", List.of());
        Map<String, Object> section = Map.of("key", "summary", "heading", "Summary of progress",
                "blocks", List.of(Map.of("style", "paragraph", "sentences", List.of(sentence))));
        return Map.of("title", "Annual progress report, year 1", "sections", List.of(section),
                "entries", List.of(Map.of("id", "out_2", "label", "Student trained: Ravi Kumar")),
                "unsupported_count", unsupported, "placeholder_count", 2, "confirmed_count", 0,
                "model", model, "warnings", List.of("A warning from drafting"));
    }

    @BeforeEach
    void setUp() {
        TransactionTemplate transactions = new TransactionTemplate(mock(PlatformTransactionManager.class));
        service = new ProgressReportService(awardRepository, draftRepository, aiServiceClient, transactions, objectMapper);
        award = Award.builder()
                .id(AWARD_ID)
                .owner(AppUser.builder().id(USER_ID).build())
                .projectTitle("Low-cost sensors for groundwater arsenic")
                .agency("ANRF")
                .reportingProfile(ReportingProfile.ANRF)
                .startDate(LocalDate.of(2026, 8, 15))
                .endDate(LocalDate.of(2029, 8, 14))
                .totalSanctioned(39_27_000L)
                .objectives("To develop a paper-strip sensor\nTo validate it in 20 villages")
                .budgetLines(new ArrayList<>())
                .events(new ArrayList<>())
                .build();
        award.getBudgetLines().add(BudgetLine.builder().award(award).head(BudgetHead.MANPOWER).allocated(14_40_000L).build());
        award.getBudgetLines().add(BudgetLine.builder().award(award).head(BudgetHead.EQUIPMENT).allocated(12_00_000L).build());
        ComplianceSchedule.sync(award);
        long id = 100;
        for (ComplianceEvent event : award.getEvents()) {
            event.setId(id++);
        }
        output(1, AwardOutputType.PAPER, "Year-one paper", "2027-06");
        output(2, AwardOutputType.STUDENT, "Ravi Kumar", "2026-09-01");
        output(3, AwardOutputType.MILESTONE, "Undated milestone", null);
        output(4, AwardOutputType.PAPER, "Year-two paper", "2028-03");
        output(5, AwardOutputType.PAPER, "Before the project", "2025");

        lenient().when(awardRepository.findByIdAndOwnerId(AWARD_ID, USER_ID)).thenReturn(Optional.of(award));
        lenient().when(draftRepository.save(any(GeneratedDraft.class))).thenAnswer(invocation -> {
            GeneratedDraft draft = invocation.getArgument(0);
            if (draft.getId() == null) {
                draft.setId(50L);
            }
            return draft;
        });
    }

    private void output(long id, AwardOutputType type, String title, String date) {
        award.getOutputs().add(AwardOutput.builder().id(id).award(award).type(type).title(title).outputDate(date)
                .source(AwardOutputSource.MANUAL).build());
    }

    private ComplianceEvent event(String ruleKey) {
        return award.getEvents().stream().filter(e -> ruleKey.equals(e.getRuleKey())).findFirst().orElseThrow();
    }

    private static GenerateDraftRequest fromEvent(Long eventId) {
        GenerateDraftRequest request = new GenerateDraftRequest();
        request.setEventId(eventId);
        return request;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> sentInput() {
        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(aiServiceClient).generateDraft(captor.capture());
        return captor.getValue();
    }

    private static int status(ResponseStatusException ex) {
        return ex.getStatusCode().value();
    }

    @Test
    @SuppressWarnings("unchecked")
    void aDeadlineGivesTheTitleAndPeriodAndTheOutputsDatedWithinIt() {
        when(aiServiceClient.generateDraft(anyMap())).thenReturn(aiDraft(0, "gemini-2.5-flash"));
        ComplianceEvent yearOne = event("PROGRESS_REPORT:1");

        DraftResponse draft = service.generate(USER_ID, AWARD_ID, fromEvent(yearOne.getId()));

        Map<String, Object> input = sentInput();
        assertEquals("PROGRESS_REPORT", input.get("kind"));
        assertEquals(yearOne.getTitle(), input.get("title"));
        assertEquals("2026-08-15", input.get("period_start"));
        assertEquals(yearOne.getPeriodEnd().toString(), input.get("period_end"));
        List<Map<String, Object>> outputs = (List<Map<String, Object>>) input.get("outputs");
        assertEquals(List.of("Ravi Kumar", "Year-one paper", "Undated milestone"),
                outputs.stream().map(o -> o.get("title")).toList(), "oldest first, undated last; other years left out");
        assertEquals(List.of("To develop a paper-strip sensor", "To validate it in 20 villages"), input.get("objectives"));
        List<Map<String, Object>> budget = (List<Map<String, Object>>) input.get("budget");
        assertEquals(List.of("EQUIPMENT", "MANPOWER"), budget.stream().map(b -> b.get("head")).toList());
        assertEquals(39_27_000L, ((Map<String, Object>) input.get("grant")).get("total_sanctioned"));

        assertEquals(50L, draft.id());
        assertEquals(ReportKind.PROGRESS_REPORT, draft.kind());
        assertEquals(yearOne.getId(), draft.eventId());
        assertEquals(List.of(2L, 1L, 3L), draft.outputIds());
        assertEquals("gemini-2.5-flash", draft.model());
        assertEquals(2, draft.placeholderCount());
        assertNotNull(draft.content().get("sections"));
        assertEquals(List.of("A warning from drafting"), draft.content().get("warnings"));
    }

    @Test
    void theFinalReportCoversTheWholeProject() {
        when(aiServiceClient.generateDraft(anyMap())).thenReturn(aiDraft(0, "m"));
        ComplianceEvent finalReport = award.getEvents().stream()
                .filter(e -> e.getType() == ComplianceEventType.FINAL_REPORT).findFirst().orElseThrow();

        DraftResponse draft = service.generate(USER_ID, AWARD_ID, fromEvent(finalReport.getId()));

        assertEquals(ReportKind.FINAL_REPORT, draft.kind());
        assertEquals(LocalDate.of(2026, 8, 15), draft.periodStart());
        assertEquals(LocalDate.of(2029, 8, 14), draft.periodEnd());
        assertEquals(List.of(2L, 1L, 4L, 3L), draft.outputIds(), "a paper from before the project stays out");
    }

    @Test
    void onlyReportDeadlinesHaveADraft() {
        Long ucEvent = event("UC_SE:2026").getId();
        assertEquals(400, status(assertThrows(ResponseStatusException.class,
                () -> service.generate(USER_ID, AWARD_ID, fromEvent(ucEvent)))));
        assertEquals(404, status(assertThrows(ResponseStatusException.class,
                () -> service.generate(USER_ID, AWARD_ID, fromEvent(9999L)))));
        verify(aiServiceClient, never()).generateDraft(anyMap());
    }

    @Test
    void aChosenPeriodMustFallWithinTheProject() {
        GenerateDraftRequest early = new GenerateDraftRequest();
        early.setPeriodStart(LocalDate.of(2026, 1, 1));
        early.setPeriodEnd(LocalDate.of(2026, 12, 31));
        GenerateDraftRequest backwards = new GenerateDraftRequest();
        backwards.setPeriodStart(LocalDate.of(2027, 6, 1));
        backwards.setPeriodEnd(LocalDate.of(2027, 1, 1));
        GenerateDraftRequest missing = new GenerateDraftRequest();

        assertEquals(400, status(assertThrows(ResponseStatusException.class, () -> service.generate(USER_ID, AWARD_ID, early))));
        assertEquals(400, status(assertThrows(ResponseStatusException.class, () -> service.generate(USER_ID, AWARD_ID, backwards))));
        assertEquals(400, status(assertThrows(ResponseStatusException.class, () -> service.generate(USER_ID, AWARD_ID, missing))));
        verify(aiServiceClient, never()).generateDraft(anyMap());
    }

    @Test
    void aChosenPeriodGetsItsOwnTitleAndTheTickedOutputsOnly() {
        when(aiServiceClient.generateDraft(anyMap())).thenReturn(aiDraft(0, "m"));
        GenerateDraftRequest request = new GenerateDraftRequest();
        request.setPeriodStart(LocalDate.of(2027, 1, 1));
        request.setPeriodEnd(LocalDate.of(2027, 6, 30));
        request.setOutputIds(List.of(4L, 1L, 4L));
        request.setNotes("  Trials were delayed by the monsoon.  ");

        DraftResponse draft = service.generate(USER_ID, AWARD_ID, request);

        assertEquals("Progress report, 1 Jan 2027 to 30 Jun 2027", draft.title());
        assertEquals(List.of(1L, 4L), draft.outputIds());
        assertEquals("Trials were delayed by the monsoon.", sentInput().get("notes"));
    }

    @Test
    void anOutputFromAnotherGrantIsRefused() {
        GenerateDraftRequest request = fromEvent(event("PROGRESS_REPORT:1").getId());
        request.setOutputIds(List.of(1L, 77L));

        assertEquals(400, status(assertThrows(ResponseStatusException.class, () -> service.generate(USER_ID, AWARD_ID, request))));
    }

    @Test
    @SuppressWarnings("unchecked")
    void anEditIsCheckedAgainstTheCurrentRecordsAndKeepsModelAndWarnings() {
        GeneratedDraft stored = GeneratedDraft.builder()
                .id(50L).award(award).kind(ReportKind.PROGRESS_REPORT).title("Annual progress report, year 1")
                .periodStart(LocalDate.of(2026, 8, 15)).periodEnd(LocalDate.of(2027, 8, 14))
                .outputIds("1,2,99").model("gemini-2.5-flash").unsupportedCount(1)
                .content("{\"sections\":[],\"warnings\":[\"A warning from drafting\"]}")
                .build();
        when(draftRepository.findByIdAndAwardId(50L, AWARD_ID)).thenReturn(Optional.of(stored));
        Map<String, Object> checked = new java.util.HashMap<>(aiDraft(0, ""));
        checked.put("warnings", List.of());
        when(aiServiceClient.checkDraft(anyMap(), anyString(), anyList())).thenReturn(checked);

        DraftResponse draft = service.update(USER_ID, AWARD_ID, 50L, new UpdateDraftRequest(List.of(Map.of("key", "summary"))));

        ArgumentCaptor<Map<String, Object>> input = ArgumentCaptor.forClass(Map.class);
        verify(aiServiceClient).checkDraft(input.capture(), anyString(), anyList());
        List<Map<String, Object>> outputs = (List<Map<String, Object>>) input.getValue().get("outputs");
        assertEquals(List.of("Ravi Kumar", "Year-one paper"), outputs.stream().map(o -> o.get("title")).toList(),
                "output 99 was deleted, so it drops out and sentences citing it fail the check");
        assertEquals(0, draft.unsupportedCount());
        assertEquals("gemini-2.5-flash", draft.model());
        assertEquals(List.of("A warning from drafting"), draft.content().get("warnings"));
    }

    @Test
    void anotherUsersGrantIsNotFound() {
        when(awardRepository.findByIdAndOwnerId(AWARD_ID, 8L)).thenReturn(Optional.empty());

        assertEquals(404, status(assertThrows(ResponseStatusException.class,
                () -> service.generate(8L, AWARD_ID, fromEvent(100L)))));
        assertEquals(404, status(assertThrows(ResponseStatusException.class, () -> service.list(8L, AWARD_ID))));
        verify(aiServiceClient, never()).generateDraft(anyMap());
    }

    @Test
    void exportMarksEachSentenceFromItsCheckResultAndNamesTheFile() throws Exception {
        String content = """
                {"title": "Annual progress report, year 1", "sections": [{"heading": "Summary of progress", "blocks": [
                  {"heading": null, "style": "paragraph", "sentences": [
                    {"text": "Fine.", "supported": true, "placeholder": false, "confirmed": false},
                    {"text": "Invented 12.", "supported": false, "placeholder": false, "confirmed": false},
                    {"text": "Kept 7.", "supported": false, "placeholder": false, "confirmed": true},
                    {"text": "[Fill this in.]", "supported": true, "placeholder": true, "confirmed": false},
                    {"text": "   ", "supported": true}]}]}]}
                """;
        GeneratedDraft stored = GeneratedDraft.builder()
                .id(50L).award(award).kind(ReportKind.PROGRESS_REPORT).title("Annual progress report, year 1")
                .periodStart(LocalDate.of(2026, 8, 15)).periodEnd(LocalDate.of(2027, 8, 14))
                .content(content).unsupportedCount(1).placeholderCount(1).confirmedCount(1).build();
        when(draftRepository.findByIdAndAwardId(50L, AWARD_ID)).thenReturn(Optional.of(stored));

        ProgressReportService.Export export = service.export(USER_ID, AWARD_ID, 50L);

        assertEquals("Annual-progress-report-year-1-DRAFT.docx", export.fileName());
        List<DocxReportWriter.Section> sections =
                ProgressReportService.docxSections(objectMapper.readValue(content, Map.class).get("sections"));
        assertEquals(List.of(DocxReportWriter.Mark.NORMAL, DocxReportWriter.Mark.UNSUPPORTED, DocxReportWriter.Mark.NORMAL,
                        DocxReportWriter.Mark.PLACEHOLDER),
                sections.get(0).blocks().get(0).sentences().stream().map(DocxReportWriter.Sentence::mark).toList());
        assertEquals('P', (char) export.content()[0], "a zip file starts with PK");
        assertEquals("Progress-report-DRAFT.docx", ProgressReportService.fileName("  ***  "));
    }

    @Test
    void listingLeavesOutTheContent() {
        GeneratedDraft stored = GeneratedDraft.builder()
                .id(50L).award(award).kind(ReportKind.PROGRESS_REPORT).title("t")
                .periodStart(LocalDate.of(2026, 8, 15)).periodEnd(LocalDate.of(2027, 8, 14))
                .content("{\"sections\":[]}").unsupportedCount(2).build();
        when(draftRepository.findAllByAwardIdOrderByCreatedAtDesc(AWARD_ID)).thenReturn(List.of(stored));

        List<DraftResponse> drafts = service.list(USER_ID, AWARD_ID);

        assertEquals(1, drafts.size());
        assertNull(drafts.get(0).content());
        assertEquals(2, drafts.get(0).unsupportedCount());
        assertEquals(List.of(), drafts.get(0).outputIds());
    }
}
