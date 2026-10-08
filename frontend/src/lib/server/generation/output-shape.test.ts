import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { cropBox, shapeOutput } from './output-shape';

async function png(width: number, height: number) {
  const imageBuffer = await sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 140, b: 160 } },
  })
    .png()
    .toBuffer();
  return { imageBuffer, mimeType: 'image/png' };
}

async function size(buffer: Buffer) {
  const meta = await sharp(buffer).metadata();
  return [meta.width, meta.height];
}

describe('cropBox', () => {
  it('trims the sides of an image that is too wide, centred', () => {
    expect(cropBox(1536, 1024, 1)).toEqual({ left: 256, top: 0, width: 1024, height: 1024 });
  });

  it('trims the top and bottom of an image that is too tall, centred', () => {
    expect(cropBox(1536, 1024, 16 / 9)).toEqual({ left: 0, top: 80, width: 1536, height: 864 });
  });
});

describe('shapeOutput', () => {
  it('leaves the image untouched when nothing is asked', async () => {
    const out = await png(1024, 1024);
    expect(await shapeOutput(out, {})).toBe(out);
  });

  it('leaves an image already at the ratio and size untouched', async () => {
    const out = await png(1536, 1024);
    expect(await shapeOutput(out, { ratio: '3:2', resolution: '1k' })).toBe(out);
  });

  it("crops Pixel IA's 3:2 to an exact 16:9", async () => {
    const shaped = await shapeOutput(await png(1536, 1024), { ratio: '16:9' });
    expect(shaped.mimeType).toBe('image/jpeg');
    expect(await size(shaped.imageBuffer)).toEqual([1536, 864]);
  });

  it('enlarges to the long edge of the size asked for', async () => {
    const shaped = await shapeOutput(await png(1024, 1536), { ratio: '2:3', resolution: '4k' });
    expect(await size(shaped.imageBuffer)).toEqual([2731, 4096]);
  });

  it('crops then enlarges when both are needed', async () => {
    const shaped = await shapeOutput(await png(1536, 1024), { ratio: '21:9', resolution: '2k' });
    const [w, h] = await size(shaped.imageBuffer);
    expect(w).toBe(2048);
    expect(w! / h!).toBeCloseTo(21 / 9, 1);
  });
});
