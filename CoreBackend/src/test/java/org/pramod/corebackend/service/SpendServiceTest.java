package org.pramod.corebackend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.pramod.corebackend.dto.award.SpendRequest;
import org.pramod.corebackend.dto.award.SpendRequest.HeadRequest;
import org.pramod.corebackend.dto.award.SpendResponse;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.entity.Award;
import org.pramod.corebackend.entity.BudgetLine;
import org.pramod.corebackend.entity.SpendRecord;
import org.pramod.corebackend.enums.BudgetHead;
import org.pramod.corebackend.enums.UnspentPolicy;
import org.pramod.corebackend.repository.AwardRepository;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SpendServiceTest {

    private static final Long USER_ID = 7L;
    private static final Long AWARD_ID = 3L;
    private static final LocalDate TODAY = LocalDate.now();

    @Mock
    private AwardRepository awardRepository;

    private SpendService service;
    private Award award;
    /** The financial year today falls in; the grant runs from 100 days ago for about 3 years. */
    private SpendCheck.Year current;

    @BeforeEach
    void setUp() {
        service = new SpendService(awardRepository);
        award = Award.builder()
                .id(AWARD_ID)
                .owner(AppUser.builder().id(USER_ID).build())
                .projectTitle("Sensors")
                .startDate(TODAY.minusDays(100))
                .endDate(TODAY.plusDays(1000))
                .unspentPolicy(UnspentPolicy.LAPSES)
                .budgetLines(new ArrayList<>())
                .spendRecords(new ArrayList<>())
                .build();
        award.getBudgetLines().add(BudgetLine.builder().award(award).head(BudgetHead.TRAVEL).allocated(1_50_000L).build());
        award.getBudgetLines().add(BudgetLine.builder().award(award).head(BudgetHead.EQUIPMENT).allocated(12_00_000L).build());
        current = SpendCheck.yearFor(TODAY, SpendCheck.years(award.getStartDate(), award.getEndDate()));
        lenient().when(awardRepository.findByIdAndOwnerId(AWARD_ID, USER_ID)).thenReturn(Optional.of(award));
        lenient().when(awardRepository.save(any(Award.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private static SpendRequest request(LocalDate asOf, HeadRequest... heads) {
        SpendRequest request = new SpendRequest();
        request.setAsOf(asOf);
        request.setHeads(List.of(heads));
        return request;
    }

    private static int status(ResponseStatusException ex) {
        return ex.getStatusCode().value();
    }

    private SpendRecord record(BudgetHead head) {
        return award.getSpendRecords().stream().filter(r -> r.getHead() == head).findFirst().orElse(null);
    }

    @Test
    void savesTheYearsFiguresAndReturnsItsCheck() {
        SpendResponse response = service.update(USER_ID, AWARD_ID, current.startYear(), request(TODAY,
                new HeadRequest(BudgetHead.TRAVEL, 1_00_000L, 25_000L),
                new HeadRequest(BudgetHead.EQUIPMENT, null, 2_00_000L)));

        assertEquals(current.startYear(), response.fyStartYear());
        assertTrue(response.current());
        assertEquals(TODAY, response.asOf());
        SpendResponse.Head travel = response.heads().stream().filter(h -> h.head() == BudgetHead.TRAVEL).findFirst().orElseThrow();
        assertEquals(1_00_000L, travel.budget());
        assertFalse(travel.estimated());
        assertEquals(25, travel.usedPercent());
        SpendResponse.Head equipment = response.heads().stream().filter(h -> h.head() == BudgetHead.EQUIPMENT).findFirst().orElseThrow();
        assertTrue(equipment.estimated());
        assertEquals(12_00_000L, equipment.budget(), "nothing spent on Equipment in earlier years");
        assertEquals(2_25_000L, response.totalSpent());
        assertEquals(2, award.getSpendRecords().size());
        assertEquals(TODAY, record(BudgetHead.TRAVEL).getAsOf());
    }

    @Test
    void anUpdateReplacesTheYearButKeepsOtherYears() {
        award.getSpendRecords().add(SpendRecord.builder().award(award).fyStartYear(current.startYear() - 1)
                .head(BudgetHead.TRAVEL).spent(9_000L).asOf(TODAY.minusYears(1)).build());
        service.update(USER_ID, AWARD_ID, current.startYear(), request(TODAY,
                new HeadRequest(BudgetHead.TRAVEL, null, 10_000L), new HeadRequest(BudgetHead.EQUIPMENT, null, 5_000L)));

        service.update(USER_ID, AWARD_ID, current.startYear(), request(TODAY,
                new HeadRequest(BudgetHead.TRAVEL, null, 20_000L), new HeadRequest(BudgetHead.EQUIPMENT, null, null)));

        List<SpendRecord> thisYear = award.getSpendRecords().stream().filter(r -> r.getFyStartYear() == current.startYear()).toList();
        assertEquals(1, thisYear.size(), "a head with neither number is dropped");
        assertEquals(20_000L, thisYear.get(0).getSpent());
        assertEquals(2, award.getSpendRecords().size(), "last year's figures stay");
    }

    @Test
    void aBudgetCanBeEnteredBeforeAnySpendingWithoutADate() {
        SpendResponse response = service.update(USER_ID, AWARD_ID, current.startYear(),
                request(null, new HeadRequest(BudgetHead.TRAVEL, 60_000L, null)));

        assertNull(response.asOf());
        assertNull(response.totalSpent());
        assertNull(record(BudgetHead.TRAVEL).getAsOf());
    }

    @Test
    void checksTheStatementDateAndTheAmounts() {
        int fy = current.startYear();
        assertEquals(400, status(assertThrows(ResponseStatusException.class, () -> service.update(USER_ID, AWARD_ID, fy,
                request(null, new HeadRequest(BudgetHead.TRAVEL, null, 1_000L))))), "spending needs a statement date");
        assertEquals(400, status(assertThrows(ResponseStatusException.class, () -> service.update(USER_ID, AWARD_ID, fy,
                request(TODAY.plusDays(1), new HeadRequest(BudgetHead.TRAVEL, null, 1_000L))))));
        assertEquals(400, status(assertThrows(ResponseStatusException.class, () -> service.update(USER_ID, AWARD_ID, fy,
                request(current.start().minusDays(1), new HeadRequest(BudgetHead.TRAVEL, null, 1_000L))))));
        assertEquals(400, status(assertThrows(ResponseStatusException.class, () -> service.update(USER_ID, AWARD_ID, fy,
                request(TODAY, new HeadRequest(BudgetHead.TRAVEL, null, -1L))))));
        assertEquals(400, status(assertThrows(ResponseStatusException.class, () -> service.update(USER_ID, AWARD_ID, fy,
                request(TODAY, new HeadRequest(BudgetHead.TRAVEL, null, 1L), new HeadRequest(BudgetHead.TRAVEL, null, 2L))))));
        assertTrue(award.getSpendRecords().isEmpty());
    }

    @Test
    void aYearOutsideTheProjectIsRefused() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () -> service.get(USER_ID, AWARD_ID, 2001));
        assertEquals(400, status(ex));
        assertTrue(ex.getReason().startsWith("FY 2001-02 isn't part of this project"));
    }

    @Test
    void theEquipmentWarningSettingsAreSavedAndChecked() {
        SpendRequest settings = request(null);
        settings.setEquipmentAlertPercent(40);
        settings.setEquipmentAlertMonth(12);

        SpendResponse response = service.update(USER_ID, AWARD_ID, current.startYear(), settings);

        assertEquals(40, response.equipmentAlertPercent());
        assertEquals(12, response.equipmentAlertMonth());
        SpendRequest keep = request(null);
        assertEquals(40, service.update(USER_ID, AWARD_ID, current.startYear(), keep).equipmentAlertPercent(), "null keeps it");

        SpendRequest bad = request(null);
        bad.setEquipmentAlertMonth(13);
        assertEquals(400, status(assertThrows(ResponseStatusException.class,
                () -> service.update(USER_ID, AWARD_ID, current.startYear(), bad))));
    }

    @Test
    void theYearShownByDefaultIsTodays() {
        SpendResponse response = service.get(USER_ID, AWARD_ID, null);
        assertEquals(current.startYear(), response.fyStartYear());
        assertEquals(SpendCheck.DEFAULT_EQUIPMENT_PERCENT, response.equipmentAlertPercent());
        assertFalse(response.years().isEmpty());
    }

    @Test
    void theMyGrantsCardGetsTheWarningsButNotTheNotices() {
        award.getSpendRecords().add(SpendRecord.builder().award(award).fyStartYear(current.startYear())
                .head(BudgetHead.TRAVEL).budget(1_00_000L).spent(1_20_000L).asOf(TODAY).build());

        List<String> warnings = SpendService.currentWarnings(award, TODAY);

        assertEquals(1, warnings.size(), warnings.toString());
        assertTrue(warnings.get(0).startsWith("Travel: overspent by ₹20,000"));
        assertTrue(AwardService.toResponse(award).getSpendWarnings().get(0).startsWith("Travel: overspent"));
    }

    @Test
    void anotherUsersGrantIsNotFound() {
        when(awardRepository.findByIdAndOwnerId(AWARD_ID, 8L)).thenReturn(Optional.empty());
        assertEquals(404, status(assertThrows(ResponseStatusException.class, () -> service.get(8L, AWARD_ID, null))));
    }
}
