/**
 * What a grant produced (Objective 4, 4.4): papers imported from the PI's
 * ORCID record, and students trained, equipment, patents and milestones added
 * through a quick-add form. Progress-report drafts are written only from
 * these entries.
 *
 * Every method takes the caller's user id and only touches grants that user
 * owns; anything else is reported as not found. Each change returns the
 * grant's whole output list, newest first.
 */
package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import org.pramod.corebackend.dto.award.AwardOutputRequest;
import org.pramod.corebackend.dto.award.AwardOutputResponse;
import org.pramod.corebackend.dto.award.OrcidImportRequest;
import org.pramod.corebackend.dto.award.OrcidWorksResponse;
import org.pramod.corebackend.entity.Award;
import org.pramod.corebackend.entity.AwardOutput;
import org.pramod.corebackend.entity.Researcher;
import org.pramod.corebackend.enums.AwardOutputSource;
import org.pramod.corebackend.enums.AwardOutputType;
import org.pramod.corebackend.repository.AwardRepository;
import org.pramod.corebackend.repository.ResearcherRepository;
import org.pramod.corebackend.service.OrcidEnrichmentService.OrcidWork;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
@RequiredArgsConstructor
public class AwardOutputService {

    private static final int MAX_OUTPUTS = 500;
    private static final int MAX_TITLE_LENGTH = 1000;
    private static final int MAX_DETAILS_LENGTH = 3000;
    private static final int MAX_REFERENCE_LENGTH = 300;

    /** ORCID work types reported as papers. "patent" becomes a patent, and anything else (data sets, software, talks) another output. */
    private static final Set<String> PAPER_WORK_TYPES = Set.of(
            "journal-article", "conference-paper", "conference-abstract", "book", "book-chapter", "edited-book",
            "preprint", "report", "working-paper", "review", "book-review", "dissertation-thesis", "dissertation",
            "encyclopedia-entry", "magazine-article", "newspaper-article", "translation", "journal-issue",
            "supervised-student-publication", "manual", "annotation");

    private static final Map<AwardOutputType, String> TITLE_MISSING = new EnumMap<>(Map.of(
            AwardOutputType.PAPER, "Give the paper's title",
            AwardOutputType.STUDENT, "Give the student's name",
            AwardOutputType.EQUIPMENT, "Name the equipment",
            AwardOutputType.PATENT, "Give the patent's title",
            AwardOutputType.MILESTONE, "Say what was achieved",
            AwardOutputType.OTHER, "Say what the output is"));

    /** Newest first ("2027-03" before "2027"), undated ones after dated ones, then the most recently added. */
    private static final Comparator<AwardOutput> NEWEST_FIRST = Comparator
            .comparing(AwardOutput::getOutputDate, Comparator.nullsLast(Comparator.<String>reverseOrder()))
            .thenComparing(output -> output.getId() == null ? Long.MAX_VALUE : output.getId(), Comparator.reverseOrder());

    private final AwardRepository awardRepository;
    private final ResearcherRepository researcherRepository;
    private final OrcidEnrichmentService orcidService;

    @Transactional(readOnly = true)
    public List<AwardOutputResponse> list(Long userId, Long awardId) {
        return toResponses(requireOwned(userId, awardId));
    }

    /** Adds an output typed in through the quick-add form. */
    @Transactional
    public List<AwardOutputResponse> add(Long userId, Long awardId, AwardOutputRequest request) {
        Award award = requireOwned(userId, awardId);
        checkRoom(award, 1);
        AwardOutput output = AwardOutput.builder().award(award).source(AwardOutputSource.MANUAL).build();
        applyForm(output, request);
        award.getOutputs().add(output);
        return toResponses(awardRepository.save(award));
    }

    /** Replaces an output's fields with the form's values. An imported paper stays marked as from ORCID. */
    @Transactional
    public List<AwardOutputResponse> update(Long userId, Long awardId, Long outputId, AwardOutputRequest request) {
        Award award = requireOwned(userId, awardId);
        applyForm(requireOutput(award, outputId), request);
        return toResponses(awardRepository.save(award));
    }

    @Transactional
    public List<AwardOutputResponse> delete(Long userId, Long awardId, Long outputId) {
        Award award = requireOwned(userId, awardId);
        award.getOutputs().remove(requireOutput(award, outputId));
        return toResponses(awardRepository.save(award));
    }

    // ------------------------------------------------------------------
    // ORCID import
    // ------------------------------------------------------------------

    /**
     * The works on the PI's ORCID record (the given iD, else the one on their
     * profile), newest first, each marked by whether its date falls within
     * the project and whether the grant already has it.
     */
    @Transactional(readOnly = true)
    public OrcidWorksResponse orcidWorks(Long userId, Long awardId, String orcidId) {
        Award award = requireOwned(userId, awardId);
        String id = resolveOrcidId(userId, orcidId);
        if (id == null) {
            return new OrcidWorksResponse(null, List.of(), "Add your ORCID iD to list your papers");
        }
        Known known = new Known(award);
        List<OrcidWorksResponse.Work> works = orcidService.fetchWorks(id).stream()
                .sorted(Comparator.comparing(OrcidWork::date, Comparator.nullsLast(Comparator.<String>reverseOrder())))
                .map(work -> new OrcidWorksResponse.Work(work.putCode(), work.title(), work.journal(), work.date(),
                        work.doi(), work.type(), outputType(work.type()),
                        work.date() == null ? null
                                : PartialDates.overlaps(work.date(), award.getStartDate(), award.getEndDate()),
                        known.has(work)))
                .toList();
        return new OrcidWorksResponse(id, works, works.isEmpty() ? "Your ORCID record has no public works yet" : null);
    }

    /**
     * Adds the ticked works, fetched again from ORCID so what's stored is what
     * the record says. Works the grant already has are skipped. A typed iD is
     * saved on the PI's profile when it has none, so next time it's filled in.
     */
    @Transactional
    public List<AwardOutputResponse> importOrcid(Long userId, Long awardId, OrcidImportRequest request) {
        Award award = requireOwned(userId, awardId);
        Set<String> wanted = request == null || request.getPutCodes() == null ? Set.of()
                : request.getPutCodes().stream()
                        .filter(Objects::nonNull)
                        .map(String::strip)
                        .filter(code -> !code.isEmpty())
                        .collect(Collectors.toSet());
        if (wanted.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "Tick the papers from this grant first");
        }
        String id = resolveOrcidId(userId, request.getOrcidId());
        if (id == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Add your ORCID iD first");
        }

        List<OrcidWork> ticked = orcidService.fetchWorks(id).stream()
                .filter(work -> wanted.contains(work.putCode()))
                .toList();
        if (ticked.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "Those works are no longer on your ORCID record. Refresh the list");
        }

        Known known = new Known(award);
        List<OrcidWork> fresh = new ArrayList<>();
        for (OrcidWork work : ticked) {
            if (!known.has(work)) {
                known.add(work);
                fresh.add(work);
            }
        }
        checkRoom(award, fresh.size());
        for (OrcidWork work : fresh) {
            award.getOutputs().add(AwardOutput.builder()
                    .award(award)
                    .type(outputType(work.type()))
                    .title(clip(work.title(), MAX_TITLE_LENGTH))
                    .details(clip(importDetails(work), MAX_DETAILS_LENGTH))
                    .outputDate(work.date())
                    .reference(clip(work.doi(), MAX_REFERENCE_LENGTH))
                    .source(AwardOutputSource.ORCID)
                    .externalId(work.putCode())
                    .build());
        }
        rememberOrcidId(userId, id);
        return toResponses(awardRepository.save(award));
    }

    /** PAPER for articles, chapters, theses and the like; PATENT for patents; OTHER for data sets, software, talks. */
    static AwardOutputType outputType(String workType) {
        String type = normaliseWorkType(workType);
        if (type == null || PAPER_WORK_TYPES.contains(type)) {
            return AwardOutputType.PAPER;
        }
        return type.equals("patent") ? AwardOutputType.PATENT : AwardOutputType.OTHER;
    }

    /** The journal, led by the kind of work when it isn't a journal article: "Conference paper, IEEE SENSORS 2027". */
    static String importDetails(OrcidWork work) {
        String type = normaliseWorkType(work.type());
        String kind = type == null || type.equals("journal-article") || type.equals("patent") ? null
                : Character.toUpperCase(type.charAt(0)) + type.substring(1).replace('-', ' ');
        String details = Stream.of(kind, work.journal()).filter(Objects::nonNull).collect(Collectors.joining(", "));
        return details.isEmpty() ? null : details;
    }

    /** ORCID writes "journal-article"; older records and exports write "JOURNAL_ARTICLE". */
    private static String normaliseWorkType(String workType) {
        String type = blankToNull(workType);
        return type == null ? null : type.toLowerCase(Locale.ROOT).replace('_', '-');
    }

    private String resolveOrcidId(Long userId, String given) {
        if (given != null && !given.isBlank()) {
            String id = OrcidEnrichmentService.normalizeId(given);
            if (id == null) {
                throw new ResponseStatusException(BAD_REQUEST, "That isn't an ORCID iD. It looks like 0000-0002-1825-0097");
            }
            return id;
        }
        return researcherRepository.findByUserId(userId)
                .map(Researcher::getOrcidId)
                .map(OrcidEnrichmentService::normalizeId)
                .orElse(null);
    }

    private void rememberOrcidId(Long userId, String orcidId) {
        researcherRepository.findByUserId(userId)
                .filter(researcher -> blankToNull(researcher.getOrcidId()) == null)
                .ifPresent(researcher -> researcher.setOrcidId(orcidId));
    }

    /** The ORCID put-codes and DOIs a grant already has, to spot works imported (or typed in) before. */
    private static final class Known {
        private final Set<String> putCodes = new HashSet<>();
        private final Set<String> dois = new HashSet<>();

        Known(Award award) {
            for (AwardOutput output : award.getOutputs()) {
                if (output.getSource() == AwardOutputSource.ORCID && output.getExternalId() != null) {
                    putCodes.add(output.getExternalId());
                }
                String doi = doiKey(output.getReference());
                if (doi != null) {
                    dois.add(doi);
                }
            }
        }

        boolean has(OrcidWork work) {
            String doi = doiKey(work.doi());
            return putCodes.contains(work.putCode()) || (doi != null && dois.contains(doi));
        }

        void add(OrcidWork work) {
            putCodes.add(work.putCode());
            String doi = doiKey(work.doi());
            if (doi != null) {
                dois.add(doi);
            }
        }
    }

    /** DOIs are compared without case or a https://doi.org/ prefix. */
    private static String doiKey(String value) {
        String doi = OrcidEnrichmentService.stripDoiPrefix(value);
        return doi == null ? null : doi.toLowerCase(Locale.ROOT);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private Award requireOwned(Long userId, Long awardId) {
        return awardRepository.findByIdAndOwnerId(awardId, userId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Grant not found"));
    }

    private static AwardOutput requireOutput(Award award, Long outputId) {
        return award.getOutputs().stream()
                .filter(output -> output.getId() != null && output.getId().equals(outputId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Output not found"));
    }

    private static void checkRoom(Award award, int adding) {
        if (award.getOutputs().size() + adding > MAX_OUTPUTS) {
            throw new ResponseStatusException(BAD_REQUEST, "A grant can hold up to " + MAX_OUTPUTS + " outputs");
        }
    }

    /** Validates the quick-add form and copies it onto the output. */
    private static void applyForm(AwardOutput output, AwardOutputRequest request) {
        if (request == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Request body is required");
        }
        AwardOutputType type = request.getType();
        if (type == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Choose what kind of output this is");
        }
        String title = blankToNull(request.getTitle());
        if (title == null) {
            throw new ResponseStatusException(BAD_REQUEST, TITLE_MISSING.get(type));
        }
        String date;
        try {
            date = PartialDates.normalise(request.getDate());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(BAD_REQUEST,
                    "The date isn't a real date. Give it as YYYY-MM-DD, YYYY-MM or just the year");
        }
        Long amount = request.getAmount();
        AwardService.checkAmount(amount, "The amount");

        output.setType(type);
        output.setTitle(clip(title, MAX_TITLE_LENGTH));
        output.setDetails(clip(blankToNull(request.getDetails()), MAX_DETAILS_LENGTH));
        output.setOutputDate(date);
        output.setAmount(amount == null || amount == 0 ? null : amount);
        output.setReference(clip(blankToNull(request.getReference()), MAX_REFERENCE_LENGTH));
    }

    private static List<AwardOutputResponse> toResponses(Award award) {
        return award.getOutputs().stream()
                .sorted(NEWEST_FIRST)
                .map(output -> new AwardOutputResponse(output.getId(), output.getType(), output.getTitle(),
                        output.getDetails(), output.getOutputDate(), output.getAmount(), output.getReference(),
                        output.getSource(), output.getExternalId()))
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
