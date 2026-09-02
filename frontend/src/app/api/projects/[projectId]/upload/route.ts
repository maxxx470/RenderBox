// POST /api/projects/[projectId]/upload — creates the root RenderNode
// (kind: UPLOADED) for a project from an uploaded photo.
//
// Pipeline mirrors the starter's old Cloudinary upload route byte-for-byte
// up through the magic-byte sniff + HEIC transcode (see sniff.ts /
// sanitize-filename.ts, both provider-agnostic and reused unchanged) — only
// the storage backend (Vercel Blob) and the destination table (RenderNode,
// not FileUpload) differ.
//
// The response NEVER includes blobUrl — the client fetches pixels via
// GET /api/render-nodes/[id]/image (project-ownership-checked proxy), never
// the raw Blob URL. See assert-project-owner.ts for the IDOR check.
export const runtime = 'nodejs';

import { randomUUID } from 'node:crypto';
import heicConvert from 'heic-convert';
import { NextResponse, type NextRequest } from 'next/server';

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { enforceUploadRateLimit } from '@/lib/server/middleware/rate-limit-upload';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { prisma } from '@/lib/server/prisma';
import { assertProjectOwner, ProjectNotFoundError } from '@/lib/server/idor/assert-project-owner';
import { StorageNotConfiguredError, uploadBuffer } from '@/lib/server/upload/vercel-blob-client';
import { verifyMagicBytes } from '@/lib/server/upload/sniff';

const HEIC_MIMES = new Set(['image/heic', 'image/heif']);

export async function POST(
  req: NextRequest,
  ctx0: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceUploadRateLimit(req);
    if (limited) return limited;

    const { projectId } = await ctx0.params;
    try {
      await assertProjectOwner(projectId, auth.user.sub);
    } catch (e) {
      if (e instanceof ProjectNotFoundError) {
        return NextResponse.json(
          { error: 'PROJECT_NOT_FOUND', message: 'Project not found' },
          { status: 404, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw e;
    }

    const allowedMime = (process.env.UPLOAD_ALLOWED_MIME ?? 'image/jpeg,image/png,image/webp')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const maxBytes = Number.parseInt(process.env.UPLOAD_MAX_BYTES ?? '15728640', 10);

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { code: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { code: 'UPLOAD_MISSING_FILE', message: 'file field is required' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (file.size > maxBytes) {
      return NextResponse.json(
        { code: 'FILE_TOO_LARGE', message: `Max ${maxBytes} bytes` },
        { status: 413, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (!allowedMime.includes(file.type)) {
      return NextResponse.json(
        { code: 'INVALID_MIME', message: `MIME ${file.type} not allowed` },
        { status: 415, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const ab = await file.arrayBuffer();
    let buf = Buffer.from(ab);
    const { match, sniffed } = verifyMagicBytes(buf, file.type);
    if (sniffed && !match) {
      return NextResponse.json(
        { code: 'MAGIC_BYTE_MISMATCH', message: 'File bytes do not match declared MIME' },
        { status: 415, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    let storedMime = file.type;

    if (HEIC_MIMES.has(storedMime)) {
      try {
        const converted = await heicConvert({
          buffer: buf as unknown as ArrayBufferLike,
          format: 'JPEG',
          quality: 0.9,
        });
        buf = Buffer.from(converted);
        storedMime = 'image/jpeg';
      } catch {
        return NextResponse.json(
          { code: 'HEIC_CONVERSION_FAILED', message: 'HEIC conversion failed' },
          { status: 502, headers: { 'x-request-id': ctx.requestId } },
        );
      }
    }

    const pathname = `renderbox/${auth.user.sub}/${projectId}/${randomUUID()}`;

    let uploaded;
    try {
      uploaded = await uploadBuffer(pathname, buf, storedMime);
    } catch (e) {
      if (e instanceof StorageNotConfiguredError) {
        return NextResponse.json(
          { code: 'STORAGE_NOT_CONFIGURED', message: 'Storage not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        { code: 'UPLOAD_FAILED', message: 'Storage write failed' },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const node = await prisma.renderNode.create({
      data: {
        projectId,
        parentId: null,
        kind: 'UPLOADED',
        blobUrl: uploaded.blobUrl,
        mimeType: storedMime,
        sizeBytes: uploaded.bytes,
      },
      select: {
        id: true,
        parentId: true,
        kind: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });

    return NextResponse.json(node, { status: 201, headers: { 'x-request-id': ctx.requestId } });
  });
}
