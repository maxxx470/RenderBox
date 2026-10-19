// The analysis of a render against its source — no network: the SDK and
// fetch are replaced, and only what is sent and how the answer is read is
// checked.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import sharp from 'sharp';

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

import { analyzeRenderSheet, parseSheetLines } from './vision-sheet';

let png: Buffer;
beforeEach(async () => {
  png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#cc8844' } })
    .png()
    .toBuffer();
  mockCreate.mockReset();
  vi.stubEnv('KIE_API_KEY', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('OPENAI_API_KEY', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const run = () => analyzeRenderSheet({ source: png, render: png, locale: 'fr' });
const answer = (text: string) => ({ content: [{ type: 'text', text }] });

describe('parseSheetLines', () => {
  it('reads a strict array, with or without a code fence', () => {
    const json = '[{"color":"brun-rouge des murs","material":"brique rouge"}]';
    expect(parseSheetLines(json)).toEqual([
      { color: 'brun-rouge des murs', material: 'brique rouge' },
    ]);
    expect(parseSheetLines('```json\n' + json + '\n```')).toHaveLength(1);
  });

  it('refuses anything that is not that array — never half-reads it', () => {
    expect(parseSheetLines('not json')).toBeNull();
    expect(parseSheetLines('{"color":"a","material":"b"}')).toBeNull();
    expect(parseSheetLines('[{"color":"a"}]')).toBeNull();
    expect(parseSheetLines('[{"color":"","material":"b"}]')).toBeNull();
    const eleven = Array.from({ length: 21 }, () => ({ color: 'a', material: 'b' }));
    expect(parseSheetLines(JSON.stringify(eleven))).toBeNull();
  });

  it('an empty list is a valid answer: nothing was readable', () => {
    expect(parseSheetLines('[]')).toEqual([]);
  });
});

describe('analyzeRenderSheet', () => {
  it('is not_configured with neither key', async () => {
    expect(await run()).toEqual({ kind: 'not_configured' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('sends the source then the render to Claude and returns the lines', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    mockCreate.mockResolvedValue(answer('[{"color":"gris du toit","material":"zinc"}]'));
    expect(await run()).toEqual({
      kind: 'lines',
      lines: [{ color: 'gris du toit', material: 'zinc' }],
    });

    const request = mockCreate.mock.calls[0]?.[0] as {
      messages: { content: { type: string; text?: string }[] }[];
    };
    const content = request.messages[0]!.content;
    expect(content.map((c) => c.type)).toEqual(['image', 'image', 'text']);
    // The language asked for is the interface's.
    expect(content[2]?.text).toContain('write both in French');
  });

  it('answers invalid_response when the model does not follow the format', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    mockCreate.mockResolvedValue(answer('Voici les matériaux : brique.'));
    expect(await run()).toEqual({ kind: 'invalid_response' });
  });

  it('turns a provider failure into a fixed code, never its message', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    mockCreate.mockRejectedValue(Object.assign(new Error('secret detail'), { status: 429 }));
    expect(await run()).toEqual({ kind: 'error', code: 'rate_limited', status: 429 });
    mockCreate.mockRejectedValue(Object.assign(new Error('x'), { status: 401 }));
    expect(await run()).toEqual({ kind: 'error', code: 'auth', status: 401 });
  });

  it('uses OpenAI vision when only its key is set (the GPT image API can do it too)', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai');
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: '[{"color":"mur beige","material":"enduit taloché"}]' } },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await run()).toEqual({
      kind: 'lines',
      lines: [{ color: 'mur beige', material: 'enduit taloché' }],
    });
    expect(mockCreate).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-openai');
    const body = JSON.parse(String(init.body)) as { messages: { content: { type: string }[] }[] };
    expect(body.messages[0]!.content.map((c) => c.type)).toEqual([
      'text',
      'image_url',
      'image_url',
    ]);
  });

  it('uses Claude through Kie with the renders’ own key, and prefers it to the others', async () => {
    vi.stubEnv('KIE_API_KEY', 'kie-test');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: [{ type: 'text', text: '[{"color":"mur beige","material":"enduit"}]' }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await run()).toEqual({
      kind: 'lines',
      lines: [{ color: 'mur beige', material: 'enduit' }],
    });
    expect(mockCreate).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.kie.ai/claude/v1/messages');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer kie-test');
    const body = JSON.parse(String(init.body)) as {
      stream: boolean;
      messages: { content: { type: string }[] }[];
    };
    expect(body.stream).toBe(false);
    expect(body.messages[0]!.content.map((c) => c.type)).toEqual(['image', 'image', 'text']);
  });

  it('reads the array when the model writes a sentence around it', () => {
    expect(parseSheetLines('Voici : [{"color":"a","material":"b"}] Voilà.')).toEqual([
      { color: 'a', material: 'b' },
    ]);
  });

  it('a Kie error returned as 200 with a code is an error with that code', async () => {
    vi.stubEnv('KIE_API_KEY', 'kie-test');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ code: 402, msg: 'credits' }), { status: 200 }),
      ),
    );
    expect(await run()).toEqual({ kind: 'error', code: 'unknown', status: 402 });
  });

  it('a Kie refusal becomes a fixed code', async () => {
    vi.stubEnv('KIE_API_KEY', 'kie-test');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 402 })),
    );
    expect(await run()).toEqual({ kind: 'error', code: 'unknown', status: 402 });
  });

  it('prefers Claude when both keys are set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai');
    mockCreate.mockResolvedValue(answer('[]'));
    expect(await run()).toEqual({ kind: 'lines', lines: [] });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});
