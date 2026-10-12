package org.pramod.corebackend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pramod.corebackend.dto.award.AwardOutputRequest;
import org.pramod.corebackend.dto.award.AwardOutputResponse;
import org.pramod.corebackend.dto.award.OrcidImportRequest;
import org.pramod.corebackend.dto.award.OrcidWorksResponse;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.entity.Award;
import org.pramod.corebackend.entity.AwardOutput;
import org.pramod.corebackend.entity.Researcher;
import org.pramod.corebackend.enums.AwardOutputSource;
import org.pramod.corebackend.enums.AwardOutputType;
import org.pramod.corebackend.repository.AwardRepository;
import org.pramod.corebackend.repository.ResearcherRepository;
import org.pramod.corebackend.service.OrcidEnrichmentService.OrcidWork;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AwardOutputServiceTest {

    private static final Long USER_ID = 7L;
    private static final Long AWARD_ID = 3L;
    private static final String ORCID_ID = "0000-0002-1825-0097";

    @Mock
    private AwardRepository awardRepository;
    @Mock
    private ResearcherRepository researcherRepository;
    @Mock
    private OrcidEnrichmentService orcidService;

    private AwardOutputService service;
    private Award award;
    private Researcher researcher;

    @BeforeEach
    void setUp() {
        service = new AwardOutputService(awardRepository, researcherRepository, orcidService);
        award = Award.builder()
                .id(AWARD_ID)
                .owner(AppUser.builder().id(USER_ID).build())
                .projectTitle("Low-cost sensors for groundwater arsenic")
                .startDate(LocalDate.of(2026, 8, 15))
                .endDate(LocalDate.of(2029, 8, 14))
                .build();
        researcher = Researcher.builder().orcidId(ORCID_ID).build();
        lenient().when(awardRepository.findByIdAndOwnerId(AWARD_ID, USER_ID)).thenReturn(Optional.of(award));
        lenient().when(awardRepository.save(any(Award.class))).thenAnswer(invocation -> invocation.getArgument(0));
        lenient().when(researcherRepository.findByUserId(USER_ID)).thenAnswer(invocation -> Optional.of(researcher));
    }

    private static AwardOutputRequest form(AwardOutputType type, String title, String date) {
        AwardOutputRequest request = new AwardOutputRequest();
        request.setType(type);
        request.setTitle(title);
        request.setDate(date);
        return request;
    }

    private AwardOutput stored(long id, AwardOutputType type, String title, String date) {
        AwardOutput output = AwardOutput.builder()
                .id(id).award(award).type(type).title(title).outputDate(date).source(AwardOutputSource.MANUAL).build();
        award.getOutputs().add(output);
        return output;
    }

    private static int status(ResponseStatusException ex) {
        return ex.getStatusCode().value();
    }

    @Test
    void addsATypedOutputTidied() {
        AwardOutputRequest request = form(AwardOutputType.EQUIPMENT, "  Portable XRF analyser ", "2027-01-20");
        request.setDetails("   ");
        request.setAmount(8_50_000L);

        List<AwardOutputResponse> outputs = service.add(USER_ID, AWARD_ID, request);

        assertEquals(1, outputs.size());
        AwardOutputResponse output = outputs.get(0);
        assertEquals(AwardOutputType.EQUIPMENT, output.type());
        assertEquals("Portable XRF analyser", output.title());
        assertNull(output.details());
        assertEquals("2027-01-20", output.date());
        assertEquals(8_50_000L, output.amount());
        assertEquals(AwardOutputSource.MANUAL, output.source());
    }

    @Test
    void needsATypeATitleAndARealDate() {
        assertEquals(400, status(assertThrows(ResponseStatusException.class,
                () -> service.add(USER_ID, AWARD_ID, form(null, "Ravi Kumar", null)))));
        ResponseStatusException noName = assertThrows(ResponseStatusException.class,
                () -> service.add(USER_ID, AWARD_ID, form(AwardOutputType.STUDENT, "  ", null)));
        assertEquals("Give the student's name", noName.getReason());
        assertEquals(400, status(assertThrows(ResponseStatusException.class,
                () -> service.add(USER_ID, AWARD_ID, form(AwardOutputType.MILESTONE, "Field trial", "2027-02-30")))));

        AwardOutputRequest negative = form(AwardOutputType.EQUIPMENT, "Pump", null);
        negative.setAmount(-1L);
        assertEquals(400, status(assertThrows(ResponseStatusException.class, () -> service.add(USER_ID, AWARD_ID, negative))));
        assertTrue(award.getOutputs().isEmpty());
    }

    @Test
    void listsNewestFirstWithUndatedLast() {
        stored(1, AwardOutputType.MILESTONE, "Undated", null);
        stored(2, AwardOutputType.PAPER, "Year only", "2027");
        stored(3, AwardOutputType.PAPER, "March", "2027-03");
        stored(4, AwardOutputType.STUDENT, "Older", "2026-09-01");

        assertEquals(List.of("March", "Year only", "Older", "Undated"),
                service.list(USER_ID, AWARD_ID).stream().map(AwardOutputResponse::title).toList());
    }

    @Test
    void updatesAndDeletesOnlyOutputsOfTheGrant() {
        stored(5, AwardOutputType.MILESTONE, "Prototype built", "2027-02-01");

        List<AwardOutputResponse> updated = service.update(USER_ID, AWARD_ID, 5L,
                form(AwardOutputType.MILESTONE, "Prototype tested in 5 villages", "2027-04"));
        assertEquals("Prototype tested in 5 villages", updated.get(0).title());
        assertEquals("2027-04", updated.get(0).date());

        assertEquals(404, status(assertThrows(ResponseStatusException.class,
                () -> service.delete(USER_ID, AWARD_ID, 99L))));
        assertTrue(service.delete(USER_ID, AWARD_ID, 5L).isEmpty());
    }

    @Test
    void anotherUsersGrantIsNotFound() {
        when(awardRepository.findByIdAndOwnerId(AWARD_ID, 8L)).thenReturn(Optional.empty());

        assertEquals(404, status(assertThrows(ResponseStatusException.class, () -> service.list(8L, AWARD_ID))));
        assertEquals(404, status(assertThrows(ResponseStatusException.class, () -> service.orcidWorks(8L, AWARD_ID, null))));
        verify(orcidService, never()).fetchWorks(anyString());
    }

    @Test
    void listsOrcidWorksNewestFirstMarkedByProjectPeriodAndAlreadyAdded() {
        AwardOutput imported = stored(6, AwardOutputType.PAPER, "Already imported", "2027");
        imported.setSource(AwardOutputSource.ORCID);
        imported.setExternalId("100");
        stored(7, AwardOutputType.PAPER, "Typed in with its DOI", "2027-05").setReference("https://doi.org/10.1/TYPED");
        when(orcidService.fetchWorks(ORCID_ID)).thenReturn(List.of(
                new OrcidWork("100", "Already imported", "J. Sensors", "2027", null, "journal-article"),
                new OrcidWork("101", "Before the project", "J. Water", "2025-11", null, "journal-article"),
                new OrcidWork("102", "Same DOI as a typed one", null, "2027-05", "10.1/typed", "journal-article"),
                new OrcidWork("103", "No date", null, null, null, "data-set"),
                new OrcidWork("104", "Year the project started", null, "2026", null, "patent")));

        OrcidWorksResponse response = service.orcidWorks(USER_ID, AWARD_ID, null);

        assertEquals(ORCID_ID, response.orcidId());
        assertEquals(List.of("102", "100", "104", "101", "103"),
                response.works().stream().map(OrcidWorksResponse.Work::putCode).toList());
        OrcidWorksResponse.Work sameDoi = response.works().get(0);
        assertTrue(sameDoi.alreadyAdded(), "matched by DOI, ignoring case and prefix");
        assertTrue(response.works().get(1).alreadyAdded(), "matched by put-code");
        OrcidWorksResponse.Work patent = response.works().get(2);
        assertTrue(patent.inPeriod());
        assertEquals(AwardOutputType.PATENT, patent.outputType());
        assertFalse(response.works().get(3).inPeriod());
        OrcidWorksResponse.Work undated = response.works().get(4);
        assertNull(undated.inPeriod());
        assertEquals(AwardOutputType.OTHER, undated.outputType());
    }

    @Test
    void withoutAnOrcidIdTheListSaysSoInsteadOfFailing() {
        researcher.setOrcidId(null);

        OrcidWorksResponse response = service.orcidWorks(USER_ID, AWARD_ID, null);

        assertNull(response.orcidId());
        assertTrue(response.works().isEmpty());
        assertNotNull(response.message());
        verify(orcidService, never()).fetchWorks(anyString());
        assertEquals(400, status(assertThrows(ResponseStatusException.class,
                () -> service.orcidWorks(USER_ID, AWARD_ID, "not-an-orcid"))));
    }

    @Test
    void importsTickedWorksOnceFromWhatOrcidSays() {
        when(orcidService.fetchWorks(ORCID_ID)).thenReturn(List.of(
                new OrcidWork("200", "Arsenic sensing with paper strips", "Analyst", "2027-06", "10.1039/abc", "journal-article"),
                new OrcidWork("201", "Field data, 2027", null, "2027", null, "data-set"),
                new OrcidWork("202", "Not ticked", "J. X", "2027", null, "journal-article"),
                new OrcidWork("203", "Talk at IEEE SENSORS", "IEEE SENSORS 2027", "2027-10", null, "conference-paper")));

        List<AwardOutputResponse> outputs = service.importOrcid(USER_ID, AWARD_ID,
                new OrcidImportRequest(null, List.of("200", " 201 ", "203")));

        assertEquals(3, outputs.size());
        AwardOutputResponse paper = outputs.stream().filter(o -> "200".equals(o.externalId())).findFirst().orElseThrow();
        assertEquals(AwardOutputType.PAPER, paper.type());
        assertEquals("Analyst", paper.details());
        assertEquals("2027-06", paper.date());
        assertEquals("10.1039/abc", paper.reference());
        assertEquals(AwardOutputSource.ORCID, paper.source());
        AwardOutputResponse dataSet = outputs.stream().filter(o -> "201".equals(o.externalId())).findFirst().orElseThrow();
        assertEquals(AwardOutputType.OTHER, dataSet.type());
        assertEquals("Data set", dataSet.details());
        AwardOutputResponse talk = outputs.stream().filter(o -> "203".equals(o.externalId())).findFirst().orElseThrow();
        assertEquals("Conference paper, IEEE SENSORS 2027", talk.details());

        // A second import of the same work adds nothing.
        assertEquals(3, service.importOrcid(USER_ID, AWARD_ID, new OrcidImportRequest(null, List.of("200"))).size());
    }

    @Test
    void refusesAnImportWithNothingTickedOrNothingStillOnOrcid() {
        assertEquals(400, status(assertThrows(ResponseStatusException.class,
                () -> service.importOrcid(USER_ID, AWARD_ID, new OrcidImportRequest(null, List.of())))));

        when(orcidService.fetchWorks(ORCID_ID)).thenReturn(List.of());
        assertEquals(400, status(assertThrows(ResponseStatusException.class,
                () -> service.importOrcid(USER_ID, AWARD_ID, new OrcidImportRequest(null, List.of("300"))))));
        assertTrue(award.getOutputs().isEmpty());
    }

    @Test
    void aTypedOrcidIdIsRememberedOnlyWhenTheProfileHasNone() {
        String typed = "0000-0001-5109-3700";
        when(orcidService.fetchWorks(typed)).thenReturn(List.of(new OrcidWork("400", "A paper", null, "2027", null, null)));

        researcher.setOrcidId(null);
        service.importOrcid(USER_ID, AWARD_ID, new OrcidImportRequest("https://orcid.org/" + typed, List.of("400")));
        assertEquals(typed, researcher.getOrcidId());

        researcher.setOrcidId(ORCID_ID);
        service.importOrcid(USER_ID, AWARD_ID, new OrcidImportRequest(typed, List.of("400")));
        assertEquals(ORCID_ID, researcher.getOrcidId());
    }
}
