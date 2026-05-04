/**
 * Saved-grants hook backed by the Spring Boot persistence layer.
 *
 * Returns rich SavedGrantEntry rows: each carries the embedded grant +
 * the user's workflow status (INTERESTED / APPLYING / SUBMITTED /
 * REJECTED) and personal notes. State updates are optimistic with
 * rollback on failure.
 *
 * Legacy localStorage entries from the older client-only implementation
 * are migrated up to the server on first run for a logged-in user, then
 * the local cache is cleared.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchSavedGrantIds,
  fetchSavedGrants,
  saveGrantOnServer,
  unsaveGrantOnServer,
  updateSavedGrantOnServer,
  type SavedGrantEntry,
  type SavedGrantStatus,
} from '../services/savedGrantsService';
import type { DiscoveryGrant } from '../services/discoveryService';

const LEGACY_STORAGE_KEY = 'fundsphere.saved.grants';
const MIGRATION_FLAG_KEY = 'fundsphere.saved.grants.migrated';

function readLegacyCache(): DiscoveryGrant[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DiscoveryGrant[]) : [];
  } catch {
    return [];
  }
}

async function migrateLegacyEntries(): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG_KEY) === '1') return;
  const legacy = readLegacyCache();
  if (legacy.length > 0) {
    const results = await Promise.allSettled(
      legacy.map((g) => saveGrantOnServer(g.id)),
    );
    const allOk = results.every((r) => r.status === 'fulfilled');
    if (!allOk) {
      // Don't mark as migrated — leave it for a retry next session.
      return;
    }
  }
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.setItem(MIGRATION_FLAG_KEY, '1');
}

export function useSavedGrants() {
  const [savedGrants, setSavedGrants] = useState<SavedGrantEntry[]>([]);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const entries = await fetchSavedGrants();
      setSavedGrants(entries);
      setSavedIds(new Set(entries.map((e) => e.grant.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load saved grants');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await migrateLegacyEntries();
      } catch {
        // ignore — migration retries next session
      }
      if (!cancelled) {
        await refresh();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const isSaved = useCallback((id: number) => savedIds.has(id), [savedIds]);

  const toggleSave = useCallback(
    async (grant: DiscoveryGrant) => {
      if (inFlight.current.has(grant.id)) return;
      inFlight.current.add(grant.id);

      const wasSaved = savedIds.has(grant.id);

      // Optimistic update on the ID set so the UI flips instantly.
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(grant.id);
        else next.add(grant.id);
        return next;
      });

      // Optimistic update on the rich list. For an unsave we drop the row;
      // for a save we prepend a synthetic entry which the server response
      // (a real SavedGrantEntry) replaces below.
      const synthetic: SavedGrantEntry = {
        id: -grant.id, // negative id signals "optimistic, not yet confirmed"
        grant,
        status: 'INTERESTED',
        notes: null,
        savedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setSavedGrants((prev) =>
        wasSaved
          ? prev.filter((e) => e.grant.id !== grant.id)
          : [synthetic, ...prev.filter((e) => e.grant.id !== grant.id)],
      );

      try {
        if (wasSaved) {
          await unsaveGrantOnServer(grant.id);
        } else {
          const real = await saveGrantOnServer(grant.id);
          // Replace the synthetic optimistic entry with the real one.
          setSavedGrants((prev) =>
            prev.map((e) => (e.grant.id === grant.id ? real : e)),
          );
        }
      } catch (e) {
        // Rollback on failure
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(grant.id);
          else next.delete(grant.id);
          return next;
        });
        setSavedGrants((prev) =>
          wasSaved
            ? [synthetic, ...prev.filter((e) => e.grant.id !== grant.id)]
            : prev.filter((e) => e.grant.id !== grant.id),
        );
        setError(e instanceof Error ? e.message : 'Failed to update saved grant');
      } finally {
        inFlight.current.delete(grant.id);
      }
    },
    [savedIds],
  );

  /**
   * Update status and/or notes on an existing saved grant. Optimistic with
   * rollback. If the row isn't currently in our state (rare race), this is
   * a no-op locally — the server still receives the update.
   */
  const updateSaved = useCallback(
    async (grantId: number, changes: { status?: SavedGrantStatus; notes?: string }) => {
      const previous = savedGrants.find((e) => e.grant.id === grantId);
      if (previous) {
        // Optimistic patch
        setSavedGrants((prev) =>
          prev.map((e) =>
            e.grant.id === grantId
              ? {
                  ...e,
                  status: changes.status ?? e.status,
                  notes: changes.notes === undefined ? e.notes : (changes.notes === '' ? null : changes.notes),
                  updatedAt: new Date().toISOString(),
                }
              : e,
          ),
        );
      }
      try {
        const updated = await updateSavedGrantOnServer(grantId, changes);
        setSavedGrants((prev) => prev.map((e) => (e.grant.id === grantId ? updated : e)));
      } catch (e) {
        if (previous) {
          // Rollback to previous state on failure
          setSavedGrants((prev) => prev.map((row) => (row.grant.id === grantId ? previous : row)));
        }
        setError(e instanceof Error ? e.message : 'Failed to update saved grant');
        throw e;
      }
    },
    [savedGrants],
  );

  return { savedGrants, savedIds, isSaved, toggleSave, updateSaved, isLoading, error, refresh };
}

/**
 * Lightweight variant: only loads the IDs, used when a page just needs to
 * know which grants are saved (e.g. the Discovery list) without paying for
 * the full grant payload of every saved row.
 */
export function useSavedGrantIds() {
  const [ids, setIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchSavedGrantIds();
        if (!cancelled) setIds(new Set(list));
      } catch {
        if (!cancelled) setIds(new Set());
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { savedIds: ids, isSaved: (id: number) => ids.has(id), isLoading };
}
