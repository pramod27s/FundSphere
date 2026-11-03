import { apiFetch } from './apiClient';

const PHOTO_PATH = '/api/researchers/me/photo';

/** Photos are cropped to a square this many pixels wide before upload (about 30 KB as JPEG). */
const PHOTO_SIZE = 256;

/** The signed-in researcher's photo, or null when they haven't added one. */
export async function fetchProfilePhoto(): Promise<Blob | null> {
  const response = await apiFetch(PHOTO_PATH);
  if (response.status === 204) return null;
  await ensureOk(response, 'Could not load your photo');
  return response.blob();
}

export async function uploadProfilePhoto(photo: Blob): Promise<void> {
  const form = new FormData();
  form.append('photo', photo, 'photo.jpg');
  const response = await apiFetch(PHOTO_PATH, { method: 'POST', body: form });
  await ensureOk(response, 'Could not save your photo');
}

export async function deleteProfilePhoto(): Promise<void> {
  const response = await apiFetch(PHOTO_PATH, { method: 'DELETE' });
  await ensureOk(response, 'Could not remove your photo');
}

/**
 * Crops an image (a file, or a data: URL from the old localStorage copy) to a
 * centred square, as the round avatars show it, and re-encodes it as a small JPEG.
 */
export async function shrinkPhoto(source: Blob | string): Promise<Blob> {
  const src = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    const image = await loadImage(src);
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const size = Math.min(PHOTO_SIZE, side);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not process the photo');
    // JPEG has no transparency: put transparent areas on white rather than black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not process the photo'))),
        'image/jpeg',
        0.85,
      ),
    );
  } finally {
    if (typeof source !== 'string') URL.revokeObjectURL(src);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("This browser can't open that image. Try a JPEG or PNG."));
    image.src = src;
  });
}

async function ensureOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  let message = `${fallback} (${response.status})`;
  try {
    const payload = (await response.clone().json()) as { message?: string; detail?: string; error?: string };
    const detail = payload.message ?? payload.detail ?? payload.error;
    if (detail) message = detail;
  } catch {
    // not JSON — keep the fallback
  }
  throw new Error(message);
}
