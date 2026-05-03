package org.pramod.corebackend.service;

import org.pramod.corebackend.entity.Grant;
import org.pramod.corebackend.repository.GrantRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Single owner of "talk to FastAPI's vector indexer + flip the row's reindex flag".
 *
 * Both the inline write path ({@link GrantService#saveOrUpdateGrant}) and the
 * scheduled sweeper go through {@link #tryIndex(Long)} so the two paths cannot
 * drift. On HTTP success the flag is cleared; on failure the row is left
 * flagged with an exponential-backoff next-retry time and an attempt counter.
 *
 * Once a row exceeds {@code reindex.sweep.max-attempts}, the sweeper stops
 * retrying it (dead-letter) — visible via {@code last_index_error} on the row.
 * Operators reset by setting {@code reindex_attempts = 0} for the affected ids.
 */
@Service
public class GrantIndexingService {

    private static final Logger log = Logger.getLogger(GrantIndexingService.class.getName());

    private final GrantRepository grantRepository;
    private final AiServiceClient aiServiceClient;

    private final long backoffBaseSeconds;
    private final long backoffMaxSeconds;

    public GrantIndexingService(GrantRepository grantRepository,
                                @Lazy AiServiceClient aiServiceClient,
                                @Value("${reindex.backoff.base-seconds:60}") long backoffBaseSeconds,
                                @Value("${reindex.backoff.max-seconds:3600}") long backoffMaxSeconds) {
        this.grantRepository = grantRepository;
        this.aiServiceClient = aiServiceClient;
        this.backoffBaseSeconds = backoffBaseSeconds;
        this.backoffMaxSeconds = backoffMaxSeconds;
    }

    /**
     * Inline write path: fire-and-forget so the API response isn't blocked.
     * The async executor catches and logs any exception so it can never bubble
     * out and disappear silently.
     */
    @Async
    public void tryIndexAsync(Long grantId) {
        try {
            tryIndex(grantId);
        } catch (Throwable t) {
            // tryIndex already swallows expected failures, but defensively
            // catch anything else (e.g. a bug in markIndexed) so the executor
            // thread doesn't terminate without a trace.
            log.log(Level.SEVERE, "Unexpected error in async indexing for grantId=" + grantId, t);
        }
    }

    /**
     * Synchronous indexing call. Returns true on success, false on failure.
     * The sweeper invokes this directly inside its scheduled thread so a
     * batch is processed sequentially with predictable backpressure.
     */
    public boolean tryIndex(Long grantId) {
        if (grantId == null) {
            return false;
        }

        try {
            Map<String, Long> request = new HashMap<>();
            request.put("grantId", grantId);
            aiServiceClient.indexGrant(request);
            markIndexed(grantId);
            return true;
        } catch (Throwable t) {
            String message = describe(t);
            log.warning("Indexing failed for grantId=" + grantId + ": " + message);
            try {
                markFailed(grantId, message);
            } catch (Throwable inner) {
                log.log(Level.SEVERE,
                        "Could not record reindex failure for grantId=" + grantId,
                        inner);
            }
            return false;
        }
    }

    /**
     * Clears the flag in its own transaction. {@code REQUIRES_NEW} ensures the
     * commit doesn't ride along with whatever transaction (if any) the caller
     * was inside — important because the inline path is invoked from
     * {@link GrantService#saveOrUpdateGrant} via {@code @Async}, which has no
     * outer transaction, while the sweeper has none either.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markIndexed(Long grantId) {
        Grant grant = grantRepository.findById(grantId).orElse(null);
        if (grant == null) {
            // Row deleted between dispatch and confirmation — nothing to do.
            return;
        }
        grant.setNeedsReindex(false);
        grant.setReindexAttempts(0);
        grant.setLastIndexError(null);
        grant.setNextRetryAt(null);
        grant.setIndexedAt(LocalDateTime.now());
        grantRepository.save(grant);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(Long grantId, String error) {
        Grant grant = grantRepository.findById(grantId).orElse(null);
        if (grant == null) {
            return;
        }
        int attempts = grant.getReindexAttempts() + 1;
        grant.setReindexAttempts(attempts);
        grant.setLastIndexError(truncate(error, 1000));
        grant.setNextRetryAt(LocalDateTime.now().plusSeconds(backoffSeconds(attempts)));
        // Leave needsReindex = true so the sweeper revisits this row after
        // the backoff window, up to the dead-letter cap.
        grantRepository.save(grant);
    }

    /** Exponential backoff: base * 2^(attempts-1), clamped to a max. */
    private long backoffSeconds(int attempts) {
        if (attempts <= 0) {
            return backoffBaseSeconds;
        }
        // Guard against overflow on long-running poison-pill rows.
        long shift = Math.min(attempts - 1, 20);
        long candidate = backoffBaseSeconds * (1L << shift);
        if (candidate <= 0 || candidate > backoffMaxSeconds) {
            return backoffMaxSeconds;
        }
        return candidate;
    }

    private static String describe(Throwable t) {
        if (t == null) {
            return "unknown error";
        }
        String msg = t.getMessage();
        if (msg == null || msg.isBlank()) {
            return t.getClass().getSimpleName();
        }
        return t.getClass().getSimpleName() + ": " + msg;
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() <= max ? s : s.substring(0, max);
    }
}
