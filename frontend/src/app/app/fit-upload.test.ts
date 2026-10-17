import { describe, it, expect, vi, afterEach } from 'vitest';
import { fitForUpload, UPLOAD_FIT } from './fit-upload';

afterEach(() => vi.unstubAllGlobals());

describe('fitForUpload', () => {
  it('sends a light JPEG, PNG or WebP as it is', async () => {
    const file = new File([new Uint8Array(1000)], 'photo.png', { type: 'image/png' });
    expect(await fitForUpload(file)).toBe(file);
  });

  it('keeps every budget under what Vercel accepts in one request (4.5 MB)', () => {
    expect(UPLOAD_FIT.source.maxBytes).toBeLessThan(4_500_000);
    // The edit request carries the marked copy and a reference together.
    expect(2 * UPLOAD_FIT.reference.maxBytes).toBeLessThan(4_500_000);
    // Améliorer sends up to seven references at once.
    expect(7 * UPLOAD_FIT.reference.maxBytes).toBeLessThan(4_500_000);
  });

  it('leaves a file the browser cannot decode to the server (HEIC)', async () => {
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('unsupported')));
    const heavy = new File([new Uint8Array(5_000_000)], 'IMG_0001.heic', { type: 'image/heic' });
    expect(await fitForUpload(heavy)).toBe(heavy);
  });
});
