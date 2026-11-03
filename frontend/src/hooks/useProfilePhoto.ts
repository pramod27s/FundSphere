/**
 * The signed-in researcher's profile photo, stored by CoreBackend in
 * PostgreSQL so it shows on every device they sign in from.
 *
 * One in-memory copy is shared by the profile page and the avatar menu, so a
 * new photo shows in both at once and the photo is fetched once per tab.
 *
 * Photos used to live only in this browser's localStorage. The first time a
 * researcher with no stored photo loads the app here, the old copy is
 * uploaded and then removed.
 */
import { useEffect, useSyncExternalStore } from 'react';
import {
  deleteProfilePhoto,
  fetchProfilePhoto,
  shrinkPhoto,
  uploadProfilePhoto,
} from '../services/profilePhotoService';

const legacyStorageKey = (researcherId: number) => `profile_image_${researcherId}`;

interface PhotoState {
  /** Whose photo `url` is; a different researcher's photo is never shown. */
  researcherId: number | null;
  url: string | null;
}

let state: PhotoState = { researcherId: null, url: null };
let loading: { researcherId: number; promise: Promise<void> } | null = null;
const listeners = new Set<() => void>();

function setState(next: PhotoState): void {
  if (state.url && state.url !== next.url) URL.revokeObjectURL(state.url);
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function loadPhoto(researcherId: number): Promise<void> {
  if (state.researcherId === researcherId) return Promise.resolve();
  if (loading?.researcherId === researcherId) return loading.promise;

  const promise = (async () => {
    try {
      const photo = await fetchProfilePhoto();
      setState({ researcherId, url: photo ? URL.createObjectURL(photo) : null });
      if (!photo) await moveLegacyPhoto(researcherId);
    } catch {
      // The avatar falls back to initials; the next page load tries again.
    } finally {
      if (loading?.researcherId === researcherId) loading = null;
    }
  })();
  loading = { researcherId, promise };
  return promise;
}

async function moveLegacyPhoto(researcherId: number): Promise<void> {
  let dataUrl: string | null = null;
  try {
    dataUrl = localStorage.getItem(legacyStorageKey(researcherId));
  } catch {
    return;
  }
  if (!dataUrl) return;
  try {
    await changeProfilePhoto(researcherId, dataUrl);
    localStorage.removeItem(legacyStorageKey(researcherId));
  } catch {
    // Keep the local copy so the next visit can try again.
  }
}

/** Shrinks the image, stores it on the server, and shows it everywhere. Throws with a readable message on failure. */
export async function changeProfilePhoto(researcherId: number, source: Blob | string): Promise<void> {
  const photo = await shrinkPhoto(source);
  await uploadProfilePhoto(photo);
  setState({ researcherId, url: URL.createObjectURL(photo) });
}

/** Removes the photo from the server and any old copy in this browser. Throws with a readable message on failure. */
export async function removeProfilePhoto(researcherId: number): Promise<void> {
  await deleteProfilePhoto();
  // An old local copy left behind would otherwise be uploaded again on the next load.
  try {
    localStorage.removeItem(legacyStorageKey(researcherId));
  } catch {
    // Storage is blocked, so nothing was kept there either.
  }
  setState({ researcherId, url: null });
}

/** An object URL for the researcher's photo, or null while loading or when they have none. */
export function useProfilePhoto(researcherId: number | undefined): string | null {
  useEffect(() => {
    if (researcherId != null) void loadPhoto(researcherId);
  }, [researcherId]);

  return useSyncExternalStore(subscribe, () =>
    researcherId != null && state.researcherId === researcherId ? state.url : null,
  );
}
