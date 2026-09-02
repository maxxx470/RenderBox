// Lazy-gated Vercel Blob uploader — mirrors the shape the old Cloudinary
// client used (StorageNotConfiguredError + uploadBuffer), gated on
// BLOB_READ_WRITE_TOKEN so routes can return a clean 503 instead of a
// generic 500 when storage isn't configured.
//
// ⚠️ Vercel Blob has no private/signed access mode — any URL is fetchable
// by anyone who has it. RenderBox never exposes a blobUrl to the client;
// callers store it only in RenderNode.blobUrl and reads go through the
// authenticated proxy route (app/api/render-nodes/[id]/image). See the
// BLOB_READ_WRITE_TOKEN comment in .env.example for the full rationale.
import 'server-only';
import { put, del } from '@vercel/blob';

export class StorageNotConfiguredError extends Error {
  constructor() {
    super('Storage not configured (BLOB_READ_WRITE_TOKEN missing or empty)');
    this.name = 'StorageNotConfiguredError';
  }
}

export interface UploadResult {
  blobUrl: string;
  bytes: number;
}

/**
 * Upload a buffer to Vercel Blob at an exact, caller-chosen pathname (no
 * `addRandomSuffix` — the pathname already embeds a cuid, and the DB row is
 * the sole source of truth for the URL; we don't want a second, undocumented
 * source of "unguessability" to lean on).
 */
export async function uploadBuffer(
  pathname: string,
  body: Buffer,
  contentType: string,
): Promise<UploadResult> {
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? '';
  if (!token) {
    throw new StorageNotConfiguredError();
  }

  const result = await put(pathname, body, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    token,
  });

  return { blobUrl: result.url, bytes: body.length };
}

/**
 * Delete blobs by URL.
 *
 * Not a nicety: a Vercel Blob URL is fetchable by anyone holding it, with no
 * private mode to fall back on (see the file header). Dropping the DB rows
 * without this would leave the bytes readable forever at a URL the user
 * believes they deleted — a privacy failure, not just wasted storage.
 *
 * `del` is idempotent (already-deleted URLs are not an error), so a caller
 * that fails partway can safely retry the whole set.
 */
export async function deleteBlobs(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? '';
  if (!token) {
    throw new StorageNotConfiguredError();
  }
  await del(urls, { token });
}
