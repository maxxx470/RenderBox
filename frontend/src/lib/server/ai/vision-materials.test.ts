import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { detectMaterials, VisionNotConfiguredError } from './vision-materials';

beforeEach(() => {
  mockCreate.mockReset();
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
});

describe('detectMaterials', () => {
  it('throws VisionNotConfiguredError when ANTHROPIC_API_KEY is absent', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    await expect(detectMaterials(Buffer.from('x'), 'image/jpeg')).rejects.toThrow(
      VisionNotConfiguredError,
    );
  });

  it('returns the parsed array on a well-formed JSON response', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '[{"face":"toiture","valeur":"Tuile terre cuite","confidence":89}]',
        },
      ],
    });
    const result = await detectMaterials(Buffer.from('x'), 'image/jpeg');
    expect(result).toEqual([{ face: 'toiture', valeur: 'Tuile terre cuite', confidence: 89 }]);
  });

  it('strips a markdown code fence before parsing', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '```json\n[{"face":"toiture","valeur":"Tuile","confidence":80}]\n```',
        },
      ],
    });
    const result = await detectMaterials(Buffer.from('x'), 'image/jpeg');
    expect(result).toEqual([{ face: 'toiture', valeur: 'Tuile', confidence: 80 }]);
  });

  it('returns [] (never throws) when the response is not valid JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Sure, here is my analysis: not json at all' }],
    });
    const result = await detectMaterials(Buffer.from('x'), 'image/jpeg');
    expect(result).toEqual([]);
  });

  it('returns [] when the JSON is valid but does not match the expected shape', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"face":"toiture"}' }],
    });
    const result = await detectMaterials(Buffer.from('x'), 'image/jpeg');
    expect(result).toEqual([]);
  });

  it('returns [] when confidence is out of the 0-100 range', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '[{"face":"toiture","valeur":"Tuile","confidence":150}]' }],
    });
    const result = await detectMaterials(Buffer.from('x'), 'image/jpeg');
    expect(result).toEqual([]);
  });

  it('returns [] when there is no text block in the response', async () => {
    mockCreate.mockResolvedValue({ content: [] });
    const result = await detectMaterials(Buffer.from('x'), 'image/jpeg');
    expect(result).toEqual([]);
  });
});
