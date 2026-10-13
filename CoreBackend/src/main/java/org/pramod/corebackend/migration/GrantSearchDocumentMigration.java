/**
 * Keeps a stored full-text document on every grant, with a GIN index, for the
 * AI keyword channel (GrantRepository.keywordSearch).
 *
 * The keyword search used to build each grant's tsvector inside the query, so
 * every search parsed the whole table. Now a trigger fills
 * grants.search_document whenever a grant is written, and a second one
 * refreshes it when the grant's tags change: tags live in grant_tags, which a
 * generated column can't read. Hibernate doesn't map the column, so it never
 * overwrites it.
 *
 * Runs at startup and every statement is idempotent; grants saved before the
 * trigger existed are filled in on the first run. After changing what goes
 * into the document below, run "update grants set search_document = null" once
 * so the trigger rebuilds every row. A failure is logged and the next start
 * tries again.
 */
package org.pramod.corebackend.migration;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class GrantSearchDocumentMigration implements ApplicationRunner {

    /**
     * Title and program weigh most (A), then fields, themes and tags (B), then
     * the long text (C), then agency and applicant types (D).
     */
    static final List<String> STATEMENTS = List.of(
            "alter table grants add column if not exists search_document tsvector",
            """
            create or replace function grants_search_document() returns trigger language plpgsql as $$
            begin
                new.search_document :=
                       setweight(to_tsvector('english',
                           coalesce(new.grant_title, '') || ' ' || coalesce(new.program_name, '')), 'A')
                    || setweight(to_tsvector('english',
                           coalesce(new.field, '') || ' ' || coalesce(new.research_themes, '') || ' '
                           || coalesce((select string_agg(t.tag, ' ') from grant_tags t where t.grant_id = new.id), '')), 'B')
                    || setweight(to_tsvector('english',
                           coalesce(new.description, '') || ' ' || coalesce(new.objectives, '') || ' '
                           || coalesce(new.funding_scope, '')), 'C')
                    || setweight(to_tsvector('english',
                           coalesce(new.funding_agency, '') || ' ' || coalesce(new.eligible_applicants, '')), 'D');
                return new;
            end
            $$""",
            "drop trigger if exists grants_search_document on grants",
            "create trigger grants_search_document before insert or update on grants"
                    + " for each row execute function grants_search_document()",
            // Clearing the document makes the grants trigger above rebuild it with the new tags.
            """
            create or replace function grant_tags_refresh_search_document() returns trigger language plpgsql as $$
            begin
                update grants set search_document = null
                where id = case when tg_op = 'DELETE' then old.grant_id else new.grant_id end;
                return null;
            end
            $$""",
            "drop trigger if exists grant_tags_search_document on grant_tags",
            "create trigger grant_tags_search_document after insert or update or delete on grant_tags"
                    + " for each row execute function grant_tags_refresh_search_document()",
            "create index if not exists grants_search_document_idx on grants using gin (search_document)");

    /** Rows without a document yet: setting it fires the trigger, which fills it in. */
    static final String BACKFILL = "update grants set search_document = null where search_document is null";

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(ApplicationArguments args) {
        try {
            STATEMENTS.forEach(jdbcTemplate::execute);
            int filled = jdbcTemplate.update(BACKFILL);
            if (filled > 0) {
                log.info("Built the keyword-search document for {} grants", filled);
            }
        } catch (RuntimeException ex) {
            log.error("Couldn't set up the keyword-search document on grants; will retry on the next start", ex);
        }
    }
}
