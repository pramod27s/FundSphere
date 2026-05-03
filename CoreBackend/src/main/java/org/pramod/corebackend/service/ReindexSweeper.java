package org.pramod.corebackend.service;

import org.pramod.corebackend.entity.Grant;
import org.pramod.corebackend.repository.GrantRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Periodically drains grants whose Pinecone indexing previously failed
 * (or was never attempted because the inline async call lost its race).
 *
 * Uses {@code fixedDelay} (not {@code fixedRate}) so a long-running sweep
 * cannot overlap with the next one. Each row is processed sequentially via
 * {@link GrantIndexingService#tryIndex(Long)} so a backlog drains with
 * predictable backpressure on FastAPI rather than firing N async calls at
 * once.
 *
 * Failures don't stop the sweep — each row is independent. Rows that have
 * exceeded {@code reindex.sweep.max-attempts} are filtered out at the SQL
 * level and become dead-letter (visible via {@code last_index_error} on
 * the row). Operators reset by zeroing {@code reindex_attempts}.
 */
@Component
public class ReindexSweeper {

    private static final Logger log = Logger.getLogger(ReindexSweeper.class.getName());

    private final GrantRepository grantRepository;
    private final GrantIndexingService indexingService;

    private final int batchSize;
    private final int maxAttempts;

    public ReindexSweeper(GrantRepository grantRepository,
                          GrantIndexingService indexingService,
                          @Value("${reindex.sweep.batch-size:25}") int batchSize,
                          @Value("${reindex.sweep.max-attempts:5}") int maxAttempts) {
        this.grantRepository = grantRepository;
        this.indexingService = indexingService;
        this.batchSize = batchSize;
        this.maxAttempts = maxAttempts;
    }

    @Scheduled(
            fixedDelayString = "${reindex.sweep.delay-ms:300000}",
            initialDelayString = "${reindex.sweep.initial-delay-ms:60000}"
    )
    public void sweep() {
        Pageable page = PageRequest.of(0, Math.max(batchSize, 1));
        List<Grant> due;
        try {
            due = grantRepository.findEligibleForReindex(LocalDateTime.now(), maxAttempts, page);
        } catch (Throwable t) {
            // DB hiccup: log and bail. Next tick will retry.
            log.log(Level.WARNING, "Reindex sweep query failed; will retry next tick", t);
            return;
        }

        if (due.isEmpty()) {
            return;
        }

        log.info("Reindex sweep: " + due.size() + " row(s) eligible (batch=" + batchSize
                + ", maxAttempts=" + maxAttempts + ")");

        int ok = 0;
        int fail = 0;
        for (Grant grant : due) {
            Long id = grant.getId();
            if (id == null) {
                continue;
            }
            try {
                if (indexingService.tryIndex(id)) {
                    ok++;
                } else {
                    fail++;
                }
            } catch (Throwable t) {
                // tryIndex already swallows expected failures, but in case
                // a non-Exception escapes, keep sweeping the rest of the batch.
                fail++;
                log.log(Level.SEVERE,
                        "Unexpected error while reindexing grantId=" + id + "; continuing batch",
                        t);
            }
        }

        log.info("Reindex sweep done: ok=" + ok + " failed=" + fail
                + " backlog=" + grantRepository.countByNeedsReindexTrue());
    }
}
