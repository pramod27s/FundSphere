/**
 * One-time move of date-only deadlines to the end of their day.
 *
 * Older scrapes stored a deadline that had no time as midnight, so the
 * grant counted as closed from the start of its last day. The scraper now
 * sends 23:59:59 for these and GrantService keeps anything else that way;
 * this moves the rows saved before that. A deadline at exactly midnight is
 * taken to be date-only. updated_at is left alone, so the grants don't jump
 * to the top of "recently updated".
 *
 * Runs at startup and changes nothing once no midnight deadlines are left.
 * A failure is logged and the next start tries again.
 */
package org.pramod.corebackend.migration;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class DeadlineEndOfDayMigration implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(ApplicationArguments args) {
        try {
            int applicationDeadlines = moveToEndOfDay("application_deadline");
            int loiDeadlines = moveToEndOfDay("loi_deadline");
            if (applicationDeadlines + loiDeadlines > 0) {
                log.info("Moved {} application and {} LOI deadlines from midnight to the end of their day",
                        applicationDeadlines, loiDeadlines);
            }
        } catch (RuntimeException ex) {
            log.error("Couldn't move midnight deadlines to the end of their day; will retry on the next start", ex);
        }
    }

    /** The column is one of the two constants above, never user input. */
    private int moveToEndOfDay(String column) {
        return jdbcTemplate.update("update grants set " + column + " = " + column + " + interval '23 hours 59 minutes 59 seconds'"
                + " where " + column + " = date_trunc('day', " + column + ")");
    }
}
