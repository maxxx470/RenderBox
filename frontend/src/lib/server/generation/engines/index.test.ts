import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const { mockNanobanana, mockGptImage } = vi.hoisted(() => ({
  mockNanobanana: vi.fn(),
  mockGptImage: vi.fn(),
}));

vi.mock('./nanobanana', () => ({ generateWithNanobanana: mockNanobanana }));
vi.mock('./gpt-image', () => ({ generateWithGptImage: mockGptImage }));

import { generateRender, isEngineConfigured } from './index';

const INPUT = { sourceImageBuffer: Buffer.from('x'), sourceMimeType: 'image/png', prompt: 'p' };

beforeEach(() => {
  mockNanobanana.mockReset();
  mockGptImage.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('generateRender', () => {
  it('dispatches to generateWithNanobanana for "nanobanana" and returns its output shape', async () => {
    mockNanobanana.mockResolvedValue({ imageBuffer: Buffer.from('a'), mimeType: 'image/png' });
    const result = await generateRender('nanobanana', INPUT);
    expect(mockNanobanana).toHaveBeenCalledWith(INPUT);
    expect(mockGptImage).not.toHaveBeenCalled();
    expect(result).toEqual({ imageBuffer: Buffer.from('a'), mimeType: 'image/png' });
  });

  it('dispatches to generateWithGptImage for "gpt_image" and returns its output shape', async () => {
    mockGptImage.mockResolvedValue({ imageBuffer: Buffer.from('b'), mimeType: 'image/png' });
    const result = await generateRender('gpt_image', INPUT);
    expect(mockGptImage).toHaveBeenCalledWith(INPUT);
    expect(mockNanobanana).not.toHaveBeenCalled();
    expect(result).toEqual({ imageBuffer: Buffer.from('b'), mimeType: 'image/png' });
  });
});

describe('isEngineConfigured', () => {
  it('is true for "nanobanana" only when GEMINI_API_KEY is set', () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(isEngineConfigured('nanobanana')).toBe(false);
    vi.stubEnv('GEMINI_API_KEY', 'key');
    expect(isEngineConfigured('nanobanana')).toBe(true);
  });

  it('is true for "gpt_image" only when OPENAI_API_KEY is set', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(isEngineConfigured('gpt_image')).toBe(false);
    vi.stubEnv('OPENAI_API_KEY', 'key');
    expect(isEngineConfigured('gpt_image')).toBe(true);
  });

  it('checks each engine independently — one missing key never affects the other', () => {
    vi.stubEnv('GEMINI_API_KEY', 'key');
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(isEngineConfigured('nanobanana')).toBe(true);
    expect(isEngineConfigured('gpt_image')).toBe(false);
  });
});
