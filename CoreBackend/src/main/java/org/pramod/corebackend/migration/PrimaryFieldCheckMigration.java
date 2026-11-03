/**
 * Lets researchers.primary_field hold every PrimaryField value.
 *
 * Hibernate created the column with a CHECK constraint listing the enum's
 * values at that time, and ddl-auto=update never widens it, so saving a
 * profile with a field added later (Physics, Chemistry, ...) would fail.
 * At startup this replaces any such constraint that doesn't list every
 * value. It does nothing once the constraint is current, or when there is
 * none. Drop and re-add run in one transaction, so a failure changes nothing.
 */
package org.pramod.corebackend.migration;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.pramod.corebackend.enums.PrimaryField;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Component
@RequiredArgsConstructor
public class PrimaryFieldCheckMigration implements ApplicationRunner {

    private static final String TABLE = "researchers";
    private static final String COLUMN = "primary_field";

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;

    @Override
    public void run(ApplicationArguments args) {
        try {
            List<Map<String, Object>> checks = jdbcTemplate.queryForList(
                    "select con.conname as name, pg_get_constraintdef(con.oid) as definition "
                            + "from pg_constraint con "
                            + "join pg_class rel on rel.oid = con.conrelid "
                            + "join pg_namespace nsp on nsp.oid = rel.relnamespace "
                            + "where nsp.nspname = current_schema() and rel.relname = ? and con.contype = 'c'",
                    TABLE);
            for (Map<String, Object> check : checks) {
                String definition = String.valueOf(check.get("definition"));
                if (definition.contains(COLUMN) && !listsEveryValue(definition)) {
                    replace(String.valueOf(check.get("name")));
                }
            }
        } catch (RuntimeException ex) {
            log.error("Couldn't update the primary field check on researchers; profiles with newer fields may not save", ex);
        }
    }

    private void replace(String name) {
        String quoted = "\"" + name.replace("\"", "\"\"") + "\"";
        String values = Arrays.stream(PrimaryField.values())
                .map(field -> "'" + field.name() + "'")
                .collect(Collectors.joining(", "));
        transactionTemplate.executeWithoutResult(status -> {
            jdbcTemplate.execute("alter table " + TABLE + " drop constraint " + quoted);
            jdbcTemplate.execute("alter table " + TABLE + " add constraint " + quoted
                    + " check (" + COLUMN + " in (" + values + "))");
        });
        log.info("Check constraint {} on {}.{} now allows all {} research fields",
                name, TABLE, COLUMN, PrimaryField.values().length);
    }

    /** True when the constraint's definition already names every PrimaryField value. */
    static boolean listsEveryValue(String definition) {
        return Arrays.stream(PrimaryField.values())
                .allMatch(field -> definition.contains("'" + field.name() + "'"));
    }
}
