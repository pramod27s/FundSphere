/**
 * The spend check (Objective 4, 4.3): the figures the PI copies from the
 * institute's statement, per financial year and budget head, and the check
 * worked out from them by SpendCheck. A light check, not accounting.
 *
 * Every method takes the caller's user id and only touches grants that user
 * owns; anything else is reported as not found.
 */
package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.award.SpendRequest;
import org.pramod.corebackend.dto.award.SpendResponse;
import org.pramod.corebackend.entity.Award;
import org.pramod.corebackend.entity.BudgetLine;
import org.pramod.corebackend.entity.SpendRecord;
import org.pramod.corebackend.enums.BudgetHead;
import org.pramod.corebackend.repository.AwardRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
@RequiredArgsConstructor
public class SpendService {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    private final AwardRepository awardRepository;

    /** The given year's check, or the year today falls in when fy is null. */
    @Transactional(readOnly = true)
    public SpendResponse get(Long userId, Long awardId, Integer fy) {
        Award award = requireOwned(userId, awardId);
        List<SpendCheck.Year> years = SpendCheck.years(award.getStartDate(), award.getEndDate());
        LocalDate today = LocalDate.now();
        SpendCheck.Year year = fy == null ? SpendCheck.yearFor(today, years) : requireYear(years, fy);
        return toResponse(award, years, year, today);
    }

    /** Replaces the year's figures with the statement's, and the Equipment warning settings if given. */
    @Transactional
    public SpendResponse update(Long userId, Long awardId, int fy, SpendRequest request) {
        Award award = requireOwned(userId, awardId);
        if (request == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Request body is required");
        }
        List<SpendCheck.Year> years = SpendCheck.years(award.getStartDate(), award.getEndDate());
        SpendCheck.Year year = requireYear(years, fy);
        LocalDate today = LocalDate.now();

        Map<BudgetHead, SpendRequest.HeadRequest> wanted = new EnumMap<>(BudgetHead.class);
        for (SpendRequest.HeadRequest line : request.getHeads() == null ? List.<SpendRequest.HeadRequest>of() : request.getHeads()) {
            if (line == null || line.head() == null) {
                throw new ResponseStatusException(BAD_REQUEST, "Each line needs a budget head");
            }
            String label = SpendCheck.label(line.head());
            if (wanted.containsKey(line.head())) {
                throw new ResponseStatusException(BAD_REQUEST, label + " is listed twice");
            }
            AwardService.checkAmount(line.budget(), label + "'s budget");
            AwardService.checkAmount(line.spent(), label + "'s spending");
            if (line.budget() != null || line.spent() != null) {
                wanted.put(line.head(), line);
            }
        }

        LocalDate asOf = request.getAsOf();
        boolean anySpent = wanted.values().stream().anyMatch(line -> line.spent() != null);
        if (anySpent) {
            if (asOf == null) {
                throw new ResponseStatusException(BAD_REQUEST, "Give the date of the statement you copied the spending from");
            }
            if (asOf.isAfter(today)) {
                throw new ResponseStatusException(BAD_REQUEST, "The statement date can't be in the future");
            }
            if (asOf.isBefore(year.start())) {
                throw new ResponseStatusException(BAD_REQUEST,
                        "The statement date is before " + year.label() + " starts (" + DAY.format(year.start()) + ")");
            }
        }
        applySettings(award, request.getEquipmentAlertPercent(), request.getEquipmentAlertMonth());

        List<SpendRecord> records = award.getSpendRecords();
        records.removeIf(record -> record.getFyStartYear() == fy && !wanted.containsKey(record.getHead()));
        wanted.forEach((head, line) -> {
            SpendRecord record = records.stream()
                    .filter(r -> r.getFyStartYear() == fy && r.getHead() == head)
                    .findFirst()
                    .orElseGet(() -> {
                        SpendRecord created = SpendRecord.builder().award(award).fyStartYear(fy).head(head).build();
                        records.add(created);
                        return created;
                    });
            record.setBudget(line.budget());
            record.setSpent(line.spent());
            record.setAsOf(anySpent ? asOf : null);
        });
        return toResponse(awardRepository.save(award), years, year, today);
    }

    // ------------------------------------------------------------------
    // The check, shared with the My grants list
    // ------------------------------------------------------------------

    /** The warnings (not the notices) of the year today falls in, for the grant's card on My grants. */
    static List<String> currentWarnings(Award award, LocalDate today) {
        if (award.getStartDate() == null || award.getEndDate() == null) {
            return List.of();
        }
        SpendCheck.Year year = SpendCheck.yearFor(today, SpendCheck.years(award.getStartDate(), award.getEndDate()));
        if (!year.contains(today)) {
            return List.of();
        }
        return check(award, year, today).warnings().stream()
                .filter(warning -> !warning.kind().isNotice())
                .map(SpendCheck.Warning::message)
                .toList();
    }

    static SpendCheck.Result check(Award award, SpendCheck.Year year, LocalDate today) {
        Map<BudgetHead, Long> allocations = new EnumMap<>(BudgetHead.class);
        for (BudgetLine line : award.getBudgetLines()) {
            allocations.put(line.getHead(), line.getAllocated());
        }
        Map<BudgetHead, SpendCheck.Entry> entries = new EnumMap<>(BudgetHead.class);
        LocalDate asOf = null;
        long equipmentBefore = 0;
        for (SpendRecord record : award.getSpendRecords()) {
            if (record.getFyStartYear() == year.startYear()) {
                entries.put(record.getHead(), new SpendCheck.Entry(record.getBudget(), record.getSpent()));
                if (record.getSpent() != null && record.getAsOf() != null && (asOf == null || record.getAsOf().isAfter(asOf))) {
                    asOf = record.getAsOf();
                }
            } else if (record.getFyStartYear() < year.startYear() && record.getHead() == BudgetHead.EQUIPMENT
                    && record.getSpent() != null) {
                equipmentBefore += record.getSpent();
            }
        }
        SpendCheck.Grant grant = new SpendCheck.Grant(award.getStartDate(), award.getEndDate(), award.getUnspentPolicy(),
                allocations, equipmentPercent(award), equipmentMonth(award));
        return SpendCheck.check(grant, year, new SpendCheck.Spending(entries, asOf, equipmentBefore), today);
    }

    private static SpendResponse toResponse(Award award, List<SpendCheck.Year> years, SpendCheck.Year year, LocalDate today) {
        SpendCheck.Result result = check(award, year, today);
        List<SpendResponse.Head> heads = result.heads().stream()
                .map(row -> new SpendResponse.Head(row.head(), row.allocated(), row.budget(), row.estimated(), row.spent(),
                        row.usedPercent()))
                .toList();
        boolean anySpent = heads.stream().anyMatch(head -> head.spent() != null);
        Long totalSpent = anySpent ? heads.stream().map(SpendResponse.Head::spent).filter(Objects::nonNull)
                .mapToLong(Long::longValue).sum() : null;
        return new SpendResponse(year.startYear(), year.label(), year.start(), year.end(), year.endsWithProject(),
                year.contains(today), result.yearGonePercent(), result.asOf(), heads,
                heads.stream().mapToLong(SpendResponse.Head::budget).sum(), totalSpent,
                result.warnings().stream()
                        .map(w -> new SpendResponse.Warning(w.kind(), w.head(), w.message(), w.kind().isNotice()))
                        .toList(),
                years.stream().map(y -> new SpendResponse.YearOption(y.startYear(), y.label())).toList(),
                equipmentPercent(award), equipmentMonth(award));
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static void applySettings(Award award, Integer percent, Integer month) {
        if (percent != null) {
            if (percent < 1 || percent > 100) {
                throw new ResponseStatusException(BAD_REQUEST, "The Equipment warning needs a percentage from 1 to 100");
            }
            award.setEquipmentAlertPercent(percent);
        }
        if (month != null) {
            if (month < 1 || month > 12) {
                throw new ResponseStatusException(BAD_REQUEST, "The Equipment warning needs a month from 1 to 12");
            }
            award.setEquipmentAlertMonth(month);
        }
    }

    private static int equipmentPercent(Award award) {
        return award.getEquipmentAlertPercent() == null ? SpendCheck.DEFAULT_EQUIPMENT_PERCENT : award.getEquipmentAlertPercent();
    }

    private static int equipmentMonth(Award award) {
        return award.getEquipmentAlertMonth() == null ? SpendCheck.DEFAULT_EQUIPMENT_MONTH : award.getEquipmentAlertMonth();
    }

    private static SpendCheck.Year requireYear(List<SpendCheck.Year> years, int fy) {
        return years.stream()
                .filter(year -> year.startYear() == fy)
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(BAD_REQUEST, "FY " + ComplianceRules.financialYear(fy)
                        + " isn't part of this project (" + years.get(0).label() + " to "
                        + years.get(years.size() - 1).label() + ")"));
    }

    private Award requireOwned(Long userId, Long awardId) {
        return awardRepository.findByIdAndOwnerId(awardId, userId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Grant not found"));
    }
}
