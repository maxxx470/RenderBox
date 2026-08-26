import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    moderations: { create: mockCreate },
  })),
}));

import { moderateImage, ModerationNotConfiguredError } from './moderate-image';

beforeEach(() => {
  mockCreate.mockReset();
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
});

describe('moderateImage', () => {
  it('throws ModerationNotConfiguredError when OPENAI_API_KEY is absent', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    await expect(moderateImage(Buffer.from('x'), 'image/png')).rejects.toThrow(
      ModerationNotConfiguredError,
    );
  });

  it('returns flagged:false and empty categories for clean content', async () => {
    mockCreate.mockResolvedValue({
      results: [{ flagged: false, categories: { violence: false, sexual: false } }],
    });
    const result = await moderateImage(Buffer.from('x'), 'image/png');
    expect(result).toEqual({ flagged: false, categories: [] });
  });

  it('returns flagged:true with the flagged category keys', async () => {
    mockCreate.mockResolvedValue({
      results: [{ flagged: true, categories: { violence: true, sexual: false, hate: true } }],
    });
    const result = await moderateImage(Buffer.from('x'), 'image/png');
    expect(result.flagged).toBe(true);
    expect(result.categories.sort()).toEqual(['hate', 'violence']);
  });

  it('sends the image as a base64 data URL to the omni-moderation model', async () => {
    mockCreate.mockResolvedValue({ results: [{ flagged: false, categories: {} }] });
    await moderateImage(Buffer.from('abc'), 'image/jpeg');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'omni-moderation-latest',
        input: [
          {
            type: 'image_url',
            image_url: { url: expect.stringContaining('data:image/jpeg;base64,') },
          },
        ],
      }),
    );
  });
});
