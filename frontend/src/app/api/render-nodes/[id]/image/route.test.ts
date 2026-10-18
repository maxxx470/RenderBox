// The image proxy: the owner's image as stored, or a small WebP thumbnail
// for the project tree (2026-10-18) — both behind the same ownership check.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { prismaMock } from '@/test-utils/prisma-mock';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'owner-1' } })),
}));

import { GET } from './route';

let png: Buffer;

beforeEach(async () => {
  png = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: '#2948FC' },
  })
    .png()
    .toBuffer();
  prismaMock.renderNode.findUnique.mockResolvedValue({
    blobUrl: 'https://blob.test/image.png',
    mimeType: 'image/png',
    project: { userId: 'owner-1' },
  } as never);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array(png), { status: 200 })),
  );
});

const get = (query = '') =>
  GET(new NextRequest(`https://test/api/render-nodes/n1/image${query}`), {
    params: Promise.resolve({ id: 'n1' }),
  });

describe('GET /api/render-nodes/[id]/image', () => {
  it('streams the stored image unchanged', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await res.arrayBuffer()).equals(png)).toBe(true);
  });

  it('serves a small WebP thumbnail with ?size=thumb, its long edge 192 px', async () => {
    const res = await get('?size=thumb');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(192);
    expect(meta.height).toBe(108);
  });

  it('keeps another account’s image out, thumbnail or not', async () => {
    prismaMock.renderNode.findUnique.mockResolvedValue({
      blobUrl: 'https://blob.test/image.png',
      mimeType: 'image/png',
      project: { userId: 'someone-else' },
    } as never);
    expect((await get('?size=thumb')).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
