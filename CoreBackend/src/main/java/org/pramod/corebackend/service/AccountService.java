package org.pramod.corebackend.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.pramod.corebackend.dto.application.ApplicationResponse;
import org.pramod.corebackend.dto.award.AwardResponse;
import org.pramod.corebackend.entity.AppUser;
import org.pramod.corebackend.entity.Award;
import org.pramod.corebackend.repository.AppUserRepository;
import org.pramod.corebackend.repository.ApplicationRepository;
import org.pramod.corebackend.repository.AwardRepository;
import org.pramod.corebackend.repository.ProposalReviewRepository;
import org.pramod.corebackend.repository.RefreshTokenRepository;
import org.pramod.corebackend.repository.ResearcherPhotoRepository;
import org.pramod.corebackend.repository.ResearcherRepository;
import org.pramod.corebackend.repository.SavedGrantRepository;
import org.pramod.corebackend.security.OwnerAccess;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.UNAUTHORIZED;

/**
 * A user's rights over their own data, as India's Digital Personal Data
 * Protection Act, 2023 sets them out: a copy of everything FundSphere holds
 * about them, and erasure of their account.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AccountService {

    private final AppUserRepository appUserRepository;
    private final ResearcherRepository researcherRepository;
    private final ResearcherPhotoRepository researcherPhotoRepository;
    private final SavedGrantRepository savedGrantRepository;
    private final ApplicationRepository applicationRepository;
    private final AwardRepository awardRepository;
    private final ProposalReviewRepository proposalReviewRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final OwnerAccess ownerAccess;

    private final ResearcherService researcherService;
    private final SavedGrantService savedGrantService;
    private final ApplicationService applicationService;
    private final AwardService awardService;
    private final AwardOutputService awardOutputService;
    private final ProgressReportService progressReportService;
    private final ProposalReviewService proposalReviewService;

    /**
     * Everything the user has entered or FundSphere has produced for them, as
     * one JSON document. Not read-only: reading a grant can fill in deadlines
     * it was missing (AwardService.list).
     */
    @Transactional
    public Map<String, Object> export(Long userId) {
        AppUser user = requireUser(userId);

        Map<String, Object> account = new LinkedHashMap<>();
        account.put("fullName", user.getFullName());
        account.put("email", user.getEmail());
        account.put("role", user.getRole().name());
        account.put("createdAt", user.getCreatedAt());

        List<Map<String, Object>> awards = awardService.list(userId).stream()
                .map(award -> awardExport(userId, award))
                .toList();
        List<ApplicationResponse> applications = applicationService.list(userId).stream()
                .map(application -> applicationService.get(userId, application.getId()))
                .toList();

        Map<String, Object> export = new LinkedHashMap<>();
        export.put("exportedAt", LocalDateTime.now());
        export.put("account", account);
        export.put("profile", researcherRepository.findByUserId(userId).isPresent()
                ? researcherService.getResearcherByUserId(userId)
                : null);
        export.put("savedGrants", savedGrantService.listSaved(userId));
        export.put("applications", applications);
        export.put("proposalReviews", proposalReviewService.listAllForExport(userId));
        export.put("awards", awards);
        return export;
    }

    private Map<String, Object> awardExport(Long userId, AwardResponse award) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("award", award);
        entry.put("outputs", awardOutputService.list(userId, award.getId()));
        entry.put("spending", awardRepository.findByIdAndOwnerId(award.getId(), userId)
                .map(Award::getSpendRecords)
                .orElse(List.of())
                .stream()
                .map(record -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("financialYearStart", record.getFyStartYear());
                    row.put("head", record.getHead());
                    row.put("budget", record.getBudget());
                    row.put("spent", record.getSpent());
                    row.put("asOf", record.getAsOf());
                    return row;
                })
                .toList());
        entry.put("reportDrafts", progressReportService.list(userId, award.getId()));
        return entry;
    }

    /**
     * Deletes the account and everything that belongs to it, in an order the
     * foreign keys allow: reviews and grants point at applications, so they go
     * first. Grant calls themselves are shared and stay.
     *
     * The owner's account can't be deleted while OWNER_EMAIL names it, or
     * nobody could manage admins.
     */
    @Transactional
    public void deleteAccount(Long userId, String password) {
        AppUser user = requireUser(userId);
        if (!StringUtils.hasText(password) || !passwordEncoder.matches(password, user.getPasswordHash())) {
            // 400, not 401/403: the frontend treats those as an expired session.
            throw new ResponseStatusException(BAD_REQUEST, "Your password is incorrect");
        }
        if (ownerAccess.isOwner(user.getEmail())) {
            throw new ResponseStatusException(CONFLICT,
                    "This is the owner account. Set OWNER_EMAIL to another account before deleting it.");
        }

        proposalReviewRepository.deleteByOwnerId(userId);
        awardRepository.deleteByOwnerId(userId);
        applicationRepository.deleteByOwnerId(userId);
        savedGrantRepository.deleteByUserId(userId);
        researcherRepository.findByUserId(userId).ifPresent(researcher -> {
            researcherPhotoRepository.deleteById(researcher.getId());
            researcherRepository.delete(researcher);
        });
        refreshTokenRepository.deleteByUser(user);
        appUserRepository.delete(user);
        log.info("Deleted account {} and all of its data", userId);
    }

    private AppUser requireUser(Long userId) {
        return appUserRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(UNAUTHORIZED, "Account not found"));
    }
}
