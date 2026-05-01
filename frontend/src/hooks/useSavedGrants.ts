import { useState, useCallback } from 'react';
import type { DiscoveryGrant } from '../services/discoveryService';

const STORAGE_KEY = 'fundsphere.saved.grants';

function load(): DiscoveryGrant[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DiscoveryGrant[]) : [];
  } catch {
    return [];
  }
}

function persist(grants: DiscoveryGrant[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(grants));
}

export function useSavedGrants() {
  const [saved, setSaved] = useState<DiscoveryGrant[]>(load);

  const isSaved = useCallback((id: number) => saved.some((g) => g.id === id), [saved]);

  const toggleSave = useCallback((grant: DiscoveryGrant) => {
    setSaved((prev) => {
      const next = prev.some((g) => g.id === grant.id)
        ? prev.filter((g) => g.id !== grant.id)
        : [...prev, grant];
      persist(next);
      return next;
    });
  }, []);

  return { savedGrants: saved, isSaved, toggleSave };
}
