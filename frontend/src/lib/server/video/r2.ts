// Where a customer's clip lives (2026-11-07, owner: « je suis d'accord,
// fais-le » on moving the videos off Vercel).
//
// WHY NOT THE BUCKET THE FILMS ARE IN. renderbox-media is served from its
// public r2.dev address: anyone holding a URL can fetch it, which is right
// for marketing films and wrong for a client's project. So the clips go to a
// bucket of their own, with no public access, and each one is handed to the
// browser as a PRESIGNED URL that expires.
//
// WHY NOT THE PROXY THE IMAGES USE. Reading an image through
// /api/render-nodes/[id]/image costs a few hundred kilobytes of Vercel
// bandwidth. A 5-second clip is tens of megabytes, and the owner moved the
// landing films off Vercel for exactly that arithmetic. A presigned URL is
// read straight from R2, whose egress is free, while staying private.
//
// So the two properties hold together: off Vercel's bandwidth AND not
// world-readable. Without R2 configured the caller falls back to Vercel
// Blob behind the proxy — correct, just expensive.
import 'server-only';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Long enough to watch and to download, short enough that a copied link
 *  stops working the same day. */
export const VIDEO_URL_TTL_SECONDS = 6 * 60 * 60;

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_VIDEO_BUCKET,
  );
}

let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;
  client = new S3Client({
    // R2 ignores the region but the SDK demands one.
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
    },
  });
  return client;
}

/**
 * The marker kept in VideoJob.blobUrl for a clip on R2. It is NOT a URL on
 * purpose: a presigned URL expires, so storing one would hand the user a
 * dead link a few hours later. The key is stable, the URL is minted on read.
 */
export function r2Marker(key: string): string {
  return `r2:${key}`;
}

export function r2KeyFrom(stored: string): string | null {
  return stored.startsWith('r2:') ? stored.slice(3) : null;
}

/** Where a job's clip goes. The user id is in the path so a bucket listing
 *  stays readable, never as a secret — the bucket is private either way. */
export function videoKey(userId: string, jobId: string): string {
  return `clips/${userId}/${jobId}.mp4`;
}

export async function putVideo(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<{ marker: string; bytes: number }> {
  await s3().send(
    new PutObjectCommand({
      Bucket: process.env.R2_VIDEO_BUCKET ?? '',
      Key: key,
      Body: body,
      ContentType: contentType,
      // A clip never changes once written, and its URL is signed per read.
      CacheControl: 'private, max-age=31536000, immutable',
    }),
  );
  return { marker: r2Marker(key), bytes: body.byteLength };
}

/** A link only this viewer can use, and only for a few hours. */
export async function signedVideoUrl(
  key: string,
  ttlSeconds: number = VIDEO_URL_TTL_SECONDS,
): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: process.env.R2_VIDEO_BUCKET ?? '', Key: key }),
    { expiresIn: ttlSeconds },
  );
}
