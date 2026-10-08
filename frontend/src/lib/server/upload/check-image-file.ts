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
  | { ok: false; res: NextResponse };

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
      res: NextResponse.json(
        { code: 'FILE_TOO_LARGE', message: `Max ${maxBytes} bytes` },
        { status: 413, headers },
      ),
    };
  }
  if (!allowedMime.includes(file.type)) {
    return {
      ok: false,
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
      return {
        ok: false,
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
      res: NextResponse.json(
        { code: 'CONTENT_FLAGGED', message: `${what} was flagged by content moderation` },
        { status: 422, headers },
      ),
    };
  }
  return { ok: true, buffer: buf, mimeType: file.type };
}
