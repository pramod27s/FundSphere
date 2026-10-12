package org.pramod.corebackend.service;

import org.junit.jupiter.api.Test;
import org.pramod.corebackend.enums.BudgetHead;
import org.pramod.corebackend.enums.UnspentPolicy;
import org.pramod.corebackend.service.SpendCheck.Entry;
import org.pramod.corebackend.service.SpendCheck.Grant;
import org.pramod.corebackend.service.SpendCheck.Kind;
import org.pramod.corebackend.service.SpendCheck.Result;
import org.pramod.corebackend.service.SpendCheck.Spending;
import org.pramod.corebackend.service.SpendCheck.Warning;
import org.pramod.corebackend.service.SpendCheck.Year;

import java.time.LocalDate;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.pramod.corebackend.enums.BudgetHead.CONSUMABLES;
import static org.pramod.corebackend.enums.BudgetHead.CONTINGENCY;
import static org.pramod.corebackend.enums.BudgetHead.EQUIPMENT;
import static org.pramod.corebackend.enums.BudgetHead.MANPOWER;
import static org.pramod.corebackend.enums.BudgetHead.OTHERS;
import static org.pramod.corebackend.enums.BudgetHead.TRAVEL;

/**
 * The 4.3 rules. The grant is sample 01: 15 Aug 2026 to 14 Aug 2029, so its
 * years are FY 2026-27 (from 15 Aug), 2027-28 (a leap year: 29 Feb 2028),
 * 2028-29, and a short FY 2029-30 that ends with the project on 14 Aug.
 */
class SpendCheckTest {

    private static final LocalDate START = LocalDate.of(2026, 8, 15);
    private static final LocalDate END = LocalDate.of(2029, 8, 14);
    private static final List<Year> YEARS = SpendCheck.years(START, END);
    private static final Year FY26 = YEARS.get(0);
    private static final Year FY27 = YEARS.get(1);
    private static final Year FY29 = YEARS.get(3);

    private static Grant grant(UnspentPolicy policy) {
        return grant(policy, SpendCheck.DEFAULT_EQUIPMENT_PERCENT, SpendCheck.DEFAULT_EQUIPMENT_MONTH);
    }

    private static Grant grant(UnspentPolicy policy, int equipmentPercent, int equipmentMonth) {
        Map<BudgetHead, Long> allocations = new EnumMap<>(BudgetHead.class);
        allocations.put(EQUIPMENT, 12_00_000L);
        allocations.put(MANPOWER, 14_40_000L);
        allocations.put(CONSUMABLES, 6_00_000L);
        allocations.put(TRAVEL, 1_50_000L);
        return new Grant(START, END, policy, allocations, equipmentPercent, equipmentMonth);
    }

    /** Spending for one head with an entered budget, as of the given date. */
    private static Spending spent(BudgetHead head, long budget, long spent, LocalDate asOf) {
        return new Spending(Map.of(head, new Entry(budget, spent)), asOf, 0);
    }

    private static List<Warning> warnings(Result result, Kind kind) {
        return result.warnings().stream().filter(w -> w.kind() == kind).toList();
    }

    private static String only(Result result, Kind kind) {
        List<Warning> found = warnings(result, kind);
        assertEquals(1, found.size(), "expected one " + kind + " in " + result.warnings());
        return found.get(0).message();
    }

    // ------------------------------------------------------------------
    // Years and estimates
    // ------------------------------------------------------------------

    @Test
    void yearsRunAprilToMarchCutToTheProject() {
        assertEquals(4, YEARS.size());
        assertEquals(new Year(2026, START, LocalDate.of(2027, 3, 31), false), FY26);
        assertEquals(new Year(2027, LocalDate.of(2027, 4, 1), LocalDate.of(2028, 3, 31), false), FY27);
        assertEquals(new Year(2029, LocalDate.of(2029, 4, 1), END, true), FY29);
        assertEquals("FY 2026-27", FY26.label());
        assertEquals(366, FY27.days(), "FY 2027-28 includes 29 February 2028");
    }

    @Test
    void aProjectEndingOn31MarchHasNoShortYear() {
        List<Year> years = SpendCheck.years(LocalDate.of(2027, 4, 1), LocalDate.of(2030, 3, 31));
        assertEquals(3, years.size());
        assertTrue(years.stream().noneMatch(Year::endsWithProject));
    }

    @Test
    void theYearShownIsTodaysOrTheNearestEnd() {
        assertEquals(FY26, SpendCheck.yearFor(LocalDate.of(2026, 1, 1), YEARS));
        assertEquals(FY26, SpendCheck.yearFor(LocalDate.of(2027, 3, 31), YEARS));
        assertEquals(FY27, SpendCheck.yearFor(LocalDate.of(2027, 4, 1), YEARS));
        assertEquals(FY29, SpendCheck.yearFor(LocalDate.of(2031, 1, 1), YEARS));
    }

    @Test
    void theYearGoneCountsDaysInclusiveAndCountsTheLeapDay() {
        assertEquals(0, FY26.gone(LocalDate.of(2026, 8, 14)));
        assertEquals(100, FY26.gone(LocalDate.of(2027, 3, 31)));
        assertEquals(335 * 100.0 / 366, FY27.gone(LocalDate.of(2028, 2, 29)), 1e-9);
    }

    @Test
    void estimatesShareOtherHeadsByDaysAndLeaveEquipmentWhateverIsUnspent() {
        // 229 of the project's 1,096 days fall in FY 2026-27: ₹3,00,876, rounded to the nearest ₹1,000.
        assertEquals(3_01_000, SpendCheck.estimate(MANPOWER, 14_40_000, FY26, START, END, 0));
        assertEquals(60_000, SpendCheck.estimate(CONTINGENCY, 1_80_000, FY27, START, END, 0), "₹60,109 rounded");
        assertEquals(12_00_000, SpendCheck.estimate(EQUIPMENT, 12_00_000, FY26, START, END, 0));
        assertEquals(3_00_000, SpendCheck.estimate(EQUIPMENT, 12_00_000, FY27, START, END, 9_00_000));
        assertEquals(0, SpendCheck.estimate(EQUIPMENT, 12_00_000, FY27, START, END, 13_00_000));
    }

    @Test
    void rowsShowBudgetSpentAndPercentUsed() {
        Map<BudgetHead, Entry> entries = new EnumMap<>(BudgetHead.class);
        entries.put(CONSUMABLES, new Entry(2_00_000L, 1_33_333L));
        entries.put(OTHERS, new Entry(null, 40_000L));
        Result result = SpendCheck.check(grant(UnspentPolicy.LAPSES), FY26,
                new Spending(entries, LocalDate.of(2026, 9, 10), 0), LocalDate.of(2026, 9, 10));

        assertEquals(List.of(EQUIPMENT, MANPOWER, CONSUMABLES, TRAVEL, OTHERS),
                result.heads().stream().map(SpendCheck.HeadRow::head).toList(), "standard order, plus a head with spending only");
        SpendCheck.HeadRow consumables = result.heads().get(2);
        assertEquals(66, consumables.usedPercent(), "rounded down");
        assertFalse(consumables.estimated());
        SpendCheck.HeadRow manpower = result.heads().get(1);
        assertTrue(manpower.estimated());
        assertNull(manpower.spent());
        assertNull(manpower.usedPercent());
    }

    // ------------------------------------------------------------------
    // Year-end warnings
    // ------------------------------------------------------------------

    @Test
    void slowHeadsAreWarnedAboutInTheWordsOfEachYearEndSetting() {
        LocalDate today = LocalDate.of(2027, 1, 15); // 67% of the year gone
        Spending consumables = spent(CONSUMABLES, 2_00_000, 84_000, today); // 42% used

        assertEquals("Consumables: 42% used, 2 months left in FY 2026-27. Unspent money lapses on 31 March.",
                only(SpendCheck.check(grant(UnspentPolicy.LAPSES), FY26, consumables, today), Kind.YEAR_END));
        assertEquals("Consumables: 42% used, 2 months left in FY 2026-27. Unspent money may be deducted from your next release.",
                only(SpendCheck.check(grant(UnspentPolicy.DEDUCTED_NEXT_RELEASE), FY26, consumables, today), Kind.YEAR_END));
        assertEquals("Consumables: 42% used, 2 months left in FY 2026-27. Check your sanction order for what happens to unspent money.",
                only(SpendCheck.check(grant(UnspentPolicy.UNKNOWN), FY26, consumables, today), Kind.YEAR_END));
        assertTrue(warnings(SpendCheck.check(grant(UnspentPolicy.CARRY_FORWARD), FY26, consumables, today), Kind.YEAR_END).isEmpty(),
                "money that carries forward doesn't need a year-end warning");
    }

    @Test
    void yearEndWarningsStartOn1JanuaryNot31December() {
        LocalDate dec31 = LocalDate.of(2026, 12, 31);
        LocalDate jan1 = LocalDate.of(2027, 1, 1);

        assertTrue(warnings(SpendCheck.check(grant(UnspentPolicy.LAPSES), FY26, spent(TRAVEL, 1_00_000, 10_000, dec31), dec31),
                Kind.YEAR_END).isEmpty());
        assertEquals("Travel: 10% used, 3 months left in FY 2026-27. Unspent money lapses on 31 March.",
                only(SpendCheck.check(grant(UnspentPolicy.LAPSES), FY26, spent(TRAVEL, 1_00_000, 10_000, jan1), jan1), Kind.YEAR_END));
    }

    @Test
    void aHeadKeepingPaceIsNotWarnedAbout() {
        LocalDate today = LocalDate.of(2027, 1, 15); // 67% gone; 60% used is within 15 points
        Result result = SpendCheck.check(grant(UnspentPolicy.LAPSES), FY26, spent(CONSUMABLES, 1_00_000, 60_000, today), today);
        assertTrue(warnings(result, Kind.YEAR_END).isEmpty());
    }

    @Test
    void onTheLastDayAndAfterTheYearEnds() {
        LocalDate mar31 = LocalDate.of(2027, 3, 31);
        assertEquals("Travel: 50% used, and today is the last day of FY 2026-27. Unspent money lapses on 31 March.",
                only(SpendCheck.check(grant(UnspentPolicy.LAPSES), FY26, spent(TRAVEL, 1_00_000, 50_000, mar31), mar31), Kind.YEAR_END));

        LocalDate apr1 = LocalDate.of(2027, 4, 1);
        Result lastYear = SpendCheck.check(grant(UnspentPolicy.LAPSES), FY26, spent(TRAVEL, 1_00_000, 50_000, mar31), apr1);
        assertTrue(warnings(lastYear, Kind.YEAR_END).isEmpty(), "a past year's money can't be saved any more");
        Result newYear = SpendCheck.check(grant(UnspentPolicy.LAPSES), FY27, new Spending(Map.of(), null, 0), apr1);
        assertTrue(newYear.warnings().stream().noneMatch(w -> !w.kind().isNotice()), "a new year starts clean");
    }

    @Test
    void theLeapYearCountsItsExtraDay() {
        LocalDate leapDay = LocalDate.of(2028, 2, 29); // 91.5% of FY 2027-28 gone
        assertEquals("Travel: 50% used, 1 month left in FY 2027-28. Unspent money lapses on 31 March.",
                only(SpendCheck.check(grant(UnspentPolicy.LAPSES), FY27, spent(TRAVEL, 1_00_000, 50_000, leapDay), leapDay),
                        Kind.YEAR_END));
    }

    @Test
    void aProjectEndingMidYearIsWarnedAboutBeforeItsEnd() {
        LocalDate may14 = LocalDate.of(2029, 5, 14);
        LocalDate may15 = LocalDate.of(2029, 5, 15);
        Grant carriesForward = grant(UnspentPolicy.CARRY_FORWARD);

        assertTrue(warnings(SpendCheck.check(carriesForward, FY29, spent(TRAVEL, 40_000, 4_000, may14), may14), Kind.YEAR_END).isEmpty());
        assertEquals("Travel: 10% used, 3 months left before the project ends on 14 Aug 2029. "
                        + "Unspent money is refunded at the end of the project.",
                only(SpendCheck.check(carriesForward, FY29, spent(TRAVEL, 40_000, 4_000, may15), may15), Kind.YEAR_END),
                "there's no next year to carry it to");
    }

    @Test
    void olderFiguresAreJudgedAtTheirOwnDateAndSaySo() {
        LocalDate statement = LocalDate.of(2026, 12, 10); // 51% of the year gone then
        LocalDate today = LocalDate.of(2027, 1, 20);

        assertEquals("Consumables: 20% used by 10 Dec 2026, 2 months left in FY 2026-27. Unspent money lapses on 31 March.",
                only(SpendCheck.check(grant(UnspentPolicy.LAPSES), FY26, spent(CONSUMABLES, 1_00_000, 20_000, statement), today),
                        Kind.YEAR_END));
        assertTrue(warnings(SpendCheck.check(grant(UnspentPolicy.LAPSES), FY26, spent(CONSUMABLES, 1_00_000, 40_000, statement), today),
                Kind.YEAR_END).isEmpty(), "40% was within 15 points of the 51% gone on the statement date");
    }

    // ------------------------------------------------------------------
    // Equipment, overspending and notices
    // ------------------------------------------------------------------

    @Test
    void equipmentIsWarnedAboutFrom1OctoberInAFullYear() {
        LocalDate sep30 = LocalDate.of(2027, 9, 30);
        LocalDate oct1 = LocalDate.of(2027, 10, 1);

        assertTrue(warnings(SpendCheck.check(grant(UnspentPolicy.LAPSES), FY27, spent(EQUIPMENT, 10_00_000, 1_00_000, sep30), sep30),
                Kind.EQUIPMENT).isEmpty());
        String message = only(SpendCheck.check(grant(UnspentPolicy.LAPSES), FY27, spent(EQUIPMENT, 10_00_000, 1_00_000, oct1), oct1),
                Kind.EQUIPMENT);
        assertTrue(message.startsWith("Equipment: 10% used. Most research equipment costs more than ₹2 lakh"), message);
        assertTrue(message.endsWith("Start now to finish within FY 2027-28."), message);
        assertTrue(warnings(SpendCheck.check(grant(UnspentPolicy.LAPSES), FY27, spent(EQUIPMENT, 10_00_000, 3_00_000, oct1), oct1),
                Kind.EQUIPMENT).isEmpty(), "30% is above the 25% threshold");
    }

    @Test
    void inTheFirstYearEquipmentWaitsThreeMonthsAfterAMidYearStart() {
        LocalDate nov14 = LocalDate.of(2026, 11, 14);
        LocalDate nov15 = LocalDate.of(2026, 11, 15);
        assertTrue(warnings(SpendCheck.check(grant(UnspentPolicy.LAPSES), FY26, spent(EQUIPMENT, 12_00_000, 0, nov14), nov14),
                Kind.EQUIPMENT).isEmpty());
        assertEquals(1, warnings(SpendCheck.check(grant(UnspentPolicy.LAPSES), FY26, spent(EQUIPMENT, 12_00_000, 0, nov15), nov15),
                Kind.EQUIPMENT).size());
    }

    @Test
    void theEquipmentThresholdAndMonthCanBeChanged() {
        Grant byDecember = grant(UnspentPolicy.LAPSES, 40, 12);
        LocalDate nov30 = LocalDate.of(2027, 11, 30);
        LocalDate dec1 = LocalDate.of(2027, 12, 1);

        assertTrue(warnings(SpendCheck.check(byDecember, FY27, spent(EQUIPMENT, 10_00_000, 3_00_000, nov30), nov30), Kind.EQUIPMENT).isEmpty());
        assertEquals(1, warnings(SpendCheck.check(byDecember, FY27, spent(EQUIPMENT, 10_00_000, 3_00_000, dec1), dec1), Kind.EQUIPMENT).size());
        assertTrue(warnings(SpendCheck.check(byDecember, FY27, spent(EQUIPMENT, 10_00_000, 4_50_000, dec1), dec1), Kind.EQUIPMENT).isEmpty());
    }

    @Test
    void equipmentSlowAtTheYearEndGetsOneWarningNotTwo() {
        LocalDate today = LocalDate.of(2028, 2, 1);
        Result result = SpendCheck.check(grant(UnspentPolicy.LAPSES), FY27, spent(EQUIPMENT, 10_00_000, 1_00_000, today), today);
        assertEquals(1, warnings(result, Kind.YEAR_END).size());
        assertTrue(warnings(result, Kind.EQUIPMENT).isEmpty());
    }

    @Test
    void overspentHeadsAreFlaggedAtAnyTime() {
        LocalDate september = LocalDate.of(2026, 9, 10);
        assertEquals("Travel: overspent by ₹12,000 (₹1.6 Lakh spent of a ₹1.5 Lakh budget for FY 2026-27). "
                        + "Moving money between heads needs the agency's approval.",
                only(SpendCheck.check(grant(UnspentPolicy.CARRY_FORWARD), FY26, spent(TRAVEL, 1_50_000, 1_62_000, september), september),
                        Kind.OVERSPENT));

        Result noBudget = SpendCheck.check(grant(UnspentPolicy.CARRY_FORWARD), FY26,
                new Spending(Map.of(OTHERS, new Entry(null, 40_000L)), september, 0), september);
        assertEquals("Others: ₹40,000 spent, but it has no budget in FY 2026-27.", only(noBudget, Kind.OVERSPENT));

        Result pastYear = SpendCheck.check(grant(UnspentPolicy.LAPSES), FY26, spent(TRAVEL, 1_50_000, 1_62_000, september),
                LocalDate.of(2027, 6, 1));
        assertEquals(1, warnings(pastYear, Kind.OVERSPENT).size(), "still worth knowing for the UC");
    }

    @Test
    void anOverspendAgainstAnEstimateSaysSo() {
        LocalDate today = LocalDate.of(2026, 9, 10);
        Result result = SpendCheck.check(grant(UnspentPolicy.LAPSES), FY26,
                new Spending(Map.of(TRAVEL, new Entry(null, 50_000L)), today, 0), today);
        assertTrue(only(result, Kind.OVERSPENT).endsWith("The budget is an estimate: enter this year's figure if it's different."));
    }

    @Test
    void noticesAskForMissingOrOldFigures() {
        Result early = SpendCheck.check(grant(UnspentPolicy.LAPSES), FY26, new Spending(Map.of(), null, 0), LocalDate.of(2026, 9, 1));
        assertTrue(warnings(early, Kind.NO_SPENDING).isEmpty(), "too early in the year to ask");
        Result later = SpendCheck.check(grant(UnspentPolicy.LAPSES), FY26, new Spending(Map.of(), null, 0), LocalDate.of(2026, 11, 15));
        assertEquals(1, warnings(later, Kind.NO_SPENDING).size());

        Result stale = SpendCheck.check(grant(UnspentPolicy.LAPSES), FY26,
                spent(CONSUMABLES, 2_00_000, 1_00_000, LocalDate.of(2026, 10, 1)), LocalDate.of(2027, 1, 15));
        assertEquals("Spending was last updated on 1 Oct 2026. Update it from your latest statement before relying on these figures.",
                only(stale, Kind.STALE));

        assertEquals("The Equipment, Manpower and Travel budgets are estimates from the project's allocation. "
                        + "Enter this year's figures from your sanction order or release letter.",
                only(stale, Kind.ESTIMATED));
    }

    @Test
    void amountsUseLakhAndCrore() {
        assertEquals("₹999", SpendCheck.inr(999));
        assertEquals("₹12,000", SpendCheck.inr(12_000));
        assertEquals("₹99,999", SpendCheck.inr(99_999));
        assertEquals("₹1 Lakh", SpendCheck.inr(1_00_000));
        assertEquals("₹8.5 Lakh", SpendCheck.inr(8_47_000));
        assertEquals("₹39.3 Lakh", SpendCheck.inr(39_27_000));
        assertEquals("₹2.5 Cr", SpendCheck.inr(2_50_00_000));
    }
}
