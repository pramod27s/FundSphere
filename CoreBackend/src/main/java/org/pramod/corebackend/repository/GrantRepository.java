/**
 * This file contains the GrantRepository class.
 * This adds business logic, data transfer object, or configurations.
 */
package org.pramod.corebackend.repository;

import org.pramod.corebackend.entity.Grant;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface GrantRepository extends JpaRepository<Grant, Long>, JpaSpecificationExecutor<Grant> {

    Optional<Grant> findByGrantUrl(String grantUrl);

    /** Lookup across URL spellings (e.g. with/without a trailing slash on legacy rows). */
    Optional<Grant> findFirstByGrantUrlIn(Collection<String> grantUrls);

    @Query("SELECT g.grantUrl FROM Grant g WHERE g.grantUrl IS NOT NULL AND g.grantUrl <> ''")
    List<String> findAllGrantUrls();

    /** Every funding agency name, for the Discovery agency filter; without closed grants unless asked. */
    @Query("""
            SELECT DISTINCT g.fundingAgency FROM Grant g
            WHERE g.fundingAgency IS NOT NULL AND TRIM(g.fundingAgency) <> ''
              AND (:includeClosed = true OR g.applicationDeadline IS NULL OR g.applicationDeadline >= :now)
            ORDER BY g.fundingAgency
            """)
    List<String> findAgencies(@Param("includeClosed") boolean includeClosed, @Param("now") LocalDateTime now);

    @Query("""
            SELECT g.id FROM Grant g
            WHERE g.updatedAt >= :since
               OR g.lastScrapedAt >= :since
               OR g.createdAt >= :since
            """)
    List<Long> findIdsChangedSince(@Param("since") LocalDateTime since);

    /** One keyword-search result row; {@code countries} is the raw eligible_countries text. */
    interface KeywordMatch {
        Long getId();
        String getCountries();
        Double getScore();
    }

    /**
     * Full-text keyword search: PostgreSQL tsvector/tsquery with English
     * stemming and stop words, matched on whole words. Title and program
     * weigh most (A), then fields, themes and tags (B), then the long text (C),
     * then agency and applicant types (D). The score is ts_rank normalised by
     * document length and mapped into [0, 1).
     *
     * @param tsQuery a to_tsquery expression built by KeywordQuery.toTsQuery
     */
    @Query(value = """
            SELECT d.id AS id,
                   d.eligible_countries AS countries,
                   CAST(ts_rank(d.document, query, 1 | 32) AS double precision) AS score
            FROM (
                SELECT g.id, g.eligible_countries,
                       setweight(to_tsvector('english',
                               coalesce(g.grant_title, '') || ' ' || coalesce(g.program_name, '')), 'A')
                    || setweight(to_tsvector('english',
                               coalesce(g.field, '') || ' ' || coalesce(g.research_themes, '') || ' ' || coalesce(t.tags, '')), 'B')
                    || setweight(to_tsvector('english',
                               coalesce(g.description, '') || ' ' || coalesce(g.objectives, '') || ' ' || coalesce(g.funding_scope, '')), 'C')
                    || setweight(to_tsvector('english',
                               coalesce(g.funding_agency, '') || ' ' || coalesce(g.eligible_applicants, '')), 'D') AS document
                FROM grants g
                LEFT JOIN (SELECT grant_id, string_agg(tag, ' ') AS tags FROM grant_tags GROUP BY grant_id) t
                       ON t.grant_id = g.id
                WHERE :includeClosed = TRUE OR g.application_deadline IS NULL OR g.application_deadline >= :now
            ) d
            CROSS JOIN to_tsquery('english', :tsQuery) AS query
            WHERE d.document @@ query
            ORDER BY score DESC, d.id
            LIMIT :limit
            """, nativeQuery = true)
    List<KeywordMatch> keywordSearch(@Param("tsQuery") String tsQuery,
                                     @Param("includeClosed") boolean includeClosed,
                                     @Param("now") LocalDateTime now,
                                     @Param("limit") int limit);

    boolean existsByGrantUrl(String grantUrl);

    Optional<Grant> findFirstByApplicationLinkIgnoreCase(String applicationLink);

    List<Grant> findTop100ByFundingAgencyContainingIgnoreCaseOrderByUpdatedAtDesc(String fundingAgency);

    List<Grant> findTop100ByGrantTitleContainingIgnoreCaseOrderByUpdatedAtDesc(String grantTitle);

    /**
     * Rows the sweeper is allowed to retry RIGHT NOW:
     *   - flagged for reindex
     *   - under the dead-letter attempt cap
     *   - past their backoff window (or never attempted)
     *
     * Ordered oldest-first so a backlog drains FIFO. The {@link Pageable}
     * argument bounds the batch so a giant backlog can't overwhelm FastAPI
     * in a single sweep.
     */
    @Query("""
            SELECT g FROM Grant g
            WHERE g.needsReindex = true
              AND g.reindexAttempts < :maxAttempts
              AND (g.nextRetryAt IS NULL OR g.nextRetryAt <= :now)
            ORDER BY COALESCE(g.nextRetryAt, g.updatedAt) ASC
            """)
    List<Grant> findEligibleForReindex(@Param("now") LocalDateTime now,
                                       @Param("maxAttempts") int maxAttempts,
                                       Pageable pageable);

    long countByNeedsReindexTrue();
}


