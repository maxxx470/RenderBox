import 'server-only';
import { NextResponse } from 'next/server';
import { verifyMagicBytes } from '@/lib/server/upload/sniff';
import {
  moderateImage,
  ModerationNotConfiguredError,
} from '@/lib/server/moderation/moderate-image';
import { log } from '@/lib/server/observability/log';

export type ImageCheck =
  | { ok: true; buffer: Buffer; mimeType: string }
  | { ok: false; res: NextResponse; code: string };

/**
 * What this gate does when the deployment has NO moderation provider at all.
 *
 * `refuse` answers 503 and the caller's feature is unavailable.
 * `send-unmoderated` accepts the picture — size, MIME allow-list and magic
 * bytes all still applied, only the content check skipped.
 *
 * The owner settled this on 2026-10-25 for the generator's reference images
 * (« à la place de la fiche de matériel … des images de référence ») and
 * reaffirmed it on 2026-10-28 for « Ajouter »: a reference is a private
 * picture an account uploads for its own render, it is never published, and
 * the product does not depend on a third-party moderation subscription.
 * Where a provider IS configured, nothing changes: a flagged picture is
 * still refused with 422.
 */
export type WhenUnconfigured = 'refuse' | 'send-unmoderated';

/**
 * Size, MIME allow-list, magic bytes, then moderation — the gate for every
 * image a generation route receives besides the stored source: the
 * add_element reference and the annotate marked copy (edit route), the
 * per-improvement references (enhance route). They come from the client, so
 * none is trusted because of what it claims to be. Moved out of the edit
 * route on 2026-10-08 so the enhance route runs the very same gate.
 */
export async function checkImageFile(
  file: File,
  requestId: string,
  what: string,
  whenUnconfigured: WhenUnconfigured = 'refuse',
): Promise<ImageCheck> {
  const headers = { 'x-request-id': requestId };
  const allowedMime = (process.env.UPLOAD_ALLOWED_MIME ?? 'image/jpeg,image/png,image/webp')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const maxBytes = Number.parseInt(process.env.UPLOAD_MAX_BYTES ?? '15728640', 10);

  if (file.size > maxBytes) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      res: NextResponse.json(
        { code: 'FILE_TOO_LARGE', message: `Max ${maxBytes} bytes` },
        { status: 413, headers },
      ),
    };
  }
  if (!allowedMime.includes(file.type)) {
    return {
      ok: false,
      code: 'INVALID_MIME',
      res: NextResponse.json(
        { code: 'INVALID_MIME', message: `MIME ${file.type} not allowed` },
        { status: 415, headers },
      ),
    };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const { match, sniffed } = verifyMagicBytes(buf, file.type);
  if (sniffed && !match) {
    return {
      ok: false,
      code: 'MAGIC_BYTE_MISMATCH',
      res: NextResponse.json(
        { code: 'MAGIC_BYTE_MISMATCH', message: 'File bytes do not match declared MIME' },
        { status: 415, headers },
      ),
    };
  }

  let moderation;
  try {
    moderation = await moderateImage(buf, file.type);
  } catch (e) {
    if (e instanceof ModerationNotConfiguredError) {
      if (whenUnconfigured === 'send-unmoderated') {
        log.warn('image accepted without a content check: no moderation provider', { what });
        return { ok: true, buffer: buf, mimeType: file.type };
      }
      return {
        ok: false,
        code: 'MODERATION_NOT_CONFIGURED',
        res: NextResponse.json(
          { code: 'MODERATION_NOT_CONFIGURED', message: 'Content moderation is not configured' },
          { status: 503, headers },
        ),
      };
    }
    throw e;
  }
  if (moderation.flagged) {
    log.warn('uploaded image flagged by moderation', {
      what,
      categories: moderation.categories,
    });
    return {
      ok: false,
      code: 'CONTENT_FLAGGED',
      res: NextResponse.json(
        { code: 'CONTENT_FLAGGED', message: `${what} was flagged by content moderation` },
        { status: 422, headers },
      ),
    };
  }
  return { ok: true, buffer: buf, mimeType: file.type };
}
