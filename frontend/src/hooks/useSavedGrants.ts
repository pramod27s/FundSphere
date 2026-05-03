/**
 * Saved-grants hook backed by the Spring Boot persistence layer.
 *
 * - Listing the current user's saved grants is a server fetch
 *   (`fetchSavedGrants`), so it survives logout, browser switch, and
 *   sync across devices.
 * - `toggleSave` updates state optimistically and rolls back on failure.
 * - On first run for a logged-in user, any pre-existing localStorage
 *   bookmarks (from the old client-only implementation) are migrated
 *   up to the server, then the local cache is cleared.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchSavedGrantIds,
  fetchSavedGrants,
  saveGrantOnServer,
  unsaveGrantOnServer,
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
  const [savedGrants, setSavedGrants] = useState<DiscoveryGrant[]>([]);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const grants = await fetchSavedGrants();
      setSavedGrants(grants);
      setSavedIds(new Set(grants.map((g) => g.id)));
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

      // Optimistic update
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(grant.id);
        else next.add(grant.id);
        return next;
      });
      setSavedGrants((prev) =>
        wasSaved ? prev.filter((g) => g.id !== grant.id) : [grant, ...prev.filter((g) => g.id !== grant.id)],
      );

      try {
        if (wasSaved) {
          await unsaveGrantOnServer(grant.id);
        } else {
          await saveGrantOnServer(grant.id);
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
          wasSaved ? [grant, ...prev.filter((g) => g.id !== grant.id)] : prev.filter((g) => g.id !== grant.id),
        );
        setError(e instanceof Error ? e.message : 'Failed to update saved grant');
      } finally {
        inFlight.current.delete(grant.id);
      }
    },
    [savedIds],
  );

  return { savedGrants, savedIds, isSaved, toggleSave, isLoading, error, refresh };
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
