/**
 * One-time move of the old Saved-page statuses into applications.
 *
 * Saved grants used to carry their own status (Interested, Applying,
 * Submitted, Rejected), which repeated what applications track. While
 * saved_grants still has its status column, each saved grant marked
 * Applying, Submitted or Rejected becomes an application (Preparing,
 * Submitted or Not funded) unless the user already has one for that grant,
 * and then the column is dropped. Bookmarks and their notes stay.
 *
 * Runs at startup and does nothing once the column is gone. Everything
 * happens in one transaction, so a failure changes nothing and the next
 * start tries again.
 */
package org.pramod.corebackend.migration;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.pramod.corebackend.enums.ApplicationStatus;
import org.pramod.corebackend.service.ApplicationService;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class SavedGrantStatusMigration implements ApplicationRunner {

    private static final Map<String, ApplicationStatus> NEW_STATUS = Map.of(
            "APPLYING", ApplicationStatus.PREPARING,
            "SUBMITTED", ApplicationStatus.SUBMITTED,
            "REJECTED", ApplicationStatus.NOT_FUNDED);

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;
    private final ApplicationService applicationService;

    @Override
    public void run(ApplicationArguments args) {
        try {
            if (statusColumnExists()) {
                transactionTemplate.executeWithoutResult(status -> migrate());
            }
        } catch (RuntimeException ex) {
            log.error("Couldn't move saved-grant statuses into applications; will retry on the next start", ex);
        }
    }

    private boolean statusColumnExists() {
        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from information_schema.columns "
                        + "where table_schema = current_schema() and table_name = 'saved_grants' and column_name = 'status'",
                Integer.class);
        return count != null && count > 0;
    }

    private void migrate() {
        List<OldStatus> rows = jdbcTemplate.query(
                "select user_id, grant_id, status, saved_at, updated_at from saved_grants "
                        + "where status in ('APPLYING', 'SUBMITTED', 'REJECTED') order by id",
                (rs, rowNum) -> new OldStatus(
                        rs.getLong("user_id"),
                        rs.getLong("grant_id"),
                        rs.getString("status"),
                        rs.getTimestamp("saved_at").toLocalDateTime(),
                        rs.getTimestamp("updated_at").toLocalDateTime()));

        int created = 0;
        for (OldStatus row : rows) {
            ApplicationStatus status = NEW_STATUS.get(row.status());
            if (applicationService.importFromSavedGrant(row.userId(), row.grantId(), status, row.savedAt(), row.updatedAt())) {
                created++;
                log.info("Saved grant {} of user {} ({}) is now an application ({})",
                        row.grantId(), row.userId(), row.status(), status);
            }
        }
        jdbcTemplate.execute("alter table saved_grants drop column status");
        log.info("Saved-grant statuses moved: {} application(s) created, {} already existed; dropped saved_grants.status",
                created, rows.size() - created);
    }

    private record OldStatus(long userId, long grantId, String status, LocalDateTime savedAt, LocalDateTime updatedAt) {
    }
}
