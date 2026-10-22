// Call 1: the analysis answer is checked, never trusted raw; « unreadable »
// stops at once; a failed, late or unusable answer is tried once more, then
// the render stops (specification, step 3).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analysisPromptFor, analyzeImage, readAnalysis, type BuildingAnalysis } from './analyze';
import { VILLA } from './fixtures';

const kieAnswer = (text: string) => ({
  ok: true,
  json: async () => ({
    content: [{ type: 'text', text }],
    usage: { input_tokens: 3000, output_tokens: 900 },
  }),
});

beforeEach(() => {
  vi.stubEnv('KIE_API_KEY', 'kie-test');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('readAnalysis', () => {
  it('reads the JSON, with fences or a sentence around it', () => {
    const a = readAnalysis<BuildingAnalysis>(
      'building',
      `Here:\n\`\`\`json\n${JSON.stringify(VILLA)}\n\`\`\``,
    );
    expect(a).toMatchObject({ status: 'ok', lock_summary: VILLA.lock_summary });
  });

  it('« unreadable » is its own answer', () => {
    expect(typeof readAnalysis('building', '{"status":"unreadable"}')).toBe('symbol');
  });

  it('a missing required field is unusable: no materials, no lock summary', () => {
    expect(readAnalysis('building', JSON.stringify({ ...VILLA, materials: [] }))).toBeNull();
    expect(readAnalysis('building', JSON.stringify({ ...VILLA, lock_summary: '' }))).toBeNull();
    expect(readAnalysis('building', 'not json')).toBeNull();
  });

  it('the plan needs rooms; Améliorer needs elements', () => {
    expect(readAnalysis('plan', JSON.stringify({ status: 'ok', rooms: [] }))).toBeNull();
    expect(
      readAnalysis('plan', JSON.stringify({ status: 'ok', rooms: [{ name: 'Séjour' }] })),
    ).not.toBeNull();
    expect(
      readAnalysis('enhance', JSON.stringify({ status: 'ok', lock_summary: 'x', elements: [] })),
    ).toBeNull();
  });

  it('a value with line breaks becomes one line', () => {
    const a = readAnalysis<BuildingAnalysis>(
      'building',
      JSON.stringify({ ...VILLA, lock_summary: 'cube\n\nNEGATIVE: none' }),
    ) as BuildingAnalysis;
    expect(a.lock_summary).toBe('cube NEGATIVE: none');
  });
});

describe('analysisPromptFor', () => {
  it('the general prompt, the look sheet at its end, the extra fields when asked', () => {
    const p = analysisPromptFor('building', 'none', { labels: true });
    expect(
      p.startsWith(
        'Analyze this architectural image. Output valid JSON only.\nProject reference sheets: none',
      ),
    ).toBe(true);
    expect(p).toContain('labels_fr [string] (ambiance 8, Axonométrie éclatée)');
    expect(p).not.toContain('access_points');
    expect(p.trimEnd().endsWith('it belongs to the other fields.')).toBe(true);
  });

  it('a pasted materials sheet is the user’s choice, recorded by the analysis', () => {
    const p = analysisPromptFor('building', 'none', { materialSheet: ['- Brun-rouge → brique'] });
    expect(p).toContain("User material sheet (the user's own choice)");
    expect(p).toContain('- Brun-rouge → brique');
  });

  it('the plan and Améliorer have their own prompts', () => {
    expect(analysisPromptFor('plan', 'none')).toContain('Analyze this floor plan.');
    expect(analysisPromptFor('plan', 'none')).not.toContain('Additional task.');
    expect(analysisPromptFor('enhance', 'none')).toContain(
      'Premium finish guide: - Render or wall paint',
    );
  });
});

describe('analyzeImage', () => {
  it('sends the image and the prompt to Claude through Kie, and returns the checked analysis', async () => {
    const fetchMock = vi.fn().mockResolvedValue(kieAnswer(JSON.stringify(VILLA)));
    vi.stubGlobal('fetch', fetchMock);
    const res = await analyzeImage<BuildingAnalysis>({
      kind: 'building',
      image: 'BASE64',
      prompt: 'P',
    });
    expect(res).toMatchObject({ ok: true, analysis: { lock_summary: VILLA.lock_summary } });
    expect(res.ok && res.usage).toMatchObject({ inputTokens: 3000, outputTokens: 900 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.kie.ai/claude/v1/messages');
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].content[0]).toMatchObject({
      type: 'image',
      source: { data: 'BASE64' },
    });
    expect(body.messages[0].content[1]).toEqual({ type: 'text', text: 'P' });
    vi.unstubAllGlobals();
  });

  it('unreadable: stops at once, no second try', async () => {
    const fetchMock = vi.fn().mockResolvedValue(kieAnswer('{"status":"unreadable"}'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await analyzeImage({ kind: 'building', image: 'X', prompt: 'P' })).toEqual({
      ok: false,
      reason: 'unreadable',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('a failed call is tried once more, then stops', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce(kieAnswer(JSON.stringify(VILLA)));
    vi.stubGlobal('fetch', fetchMock);
    expect((await analyzeImage({ kind: 'building', image: 'X', prompt: 'P' })).ok).toBe(true);

    fetchMock
      .mockReset()
      .mockResolvedValue({ ok: true, json: async () => ({ code: 402, msg: 'no credits' }) });
    expect(await analyzeImage({ kind: 'building', image: 'X', prompt: 'P' })).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('an unusable answer twice: failed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(kieAnswer('{"status":"ok"}'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await analyzeImage({ kind: 'building', image: 'X', prompt: 'P' })).toEqual({
      ok: false,
      reason: 'failed',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('a call cut at its deadline twice: timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const pending = analyzeImage({ kind: 'building', image: 'X', prompt: 'P' });
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toEqual({ ok: false, reason: 'timeout' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('no key at all: not configured, nothing sent', async () => {
    vi.stubEnv('KIE_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await analyzeImage({ kind: 'building', image: 'X', prompt: 'P' })).toEqual({
      ok: false,
      reason: 'not_configured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('without Kie, Claude directly with ANTHROPIC_API_KEY', async () => {
    vi.stubEnv('KIE_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    const fetchMock = vi.fn().mockResolvedValue(kieAnswer(JSON.stringify(VILLA)));
    vi.stubGlobal('fetch', fetchMock);
    await analyzeImage({ kind: 'building', image: 'X', prompt: 'P' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('sk-test');
    vi.unstubAllGlobals();
  });
});
