// The in-app assistant: auth + CSRF + validation, the model answer with its
// web sources, the keyword fallback when there is no key or the call fails,
// and the hourly limit.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies, __cookieStore } from '@/test-utils/mock-cookies';

mockNextCookies();

vi.mock('@/lib/server/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/auth')>('@/lib/server/auth');
  return { ...actual, verifyToken: vi.fn() };
});

const { mockGenerateContent, mockRateLimit } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
  mockRateLimit: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

vi.mock('@/lib/server/middleware/rate-limit-assistant', () => ({
  enforceAssistantRateLimit: mockRateLimit,
}));

import { verifyToken } from '@/lib/server/auth';
import { NextResponse } from 'next/server';
import { POST } from './route';

const USER_ID = 'user-1';

function makeReq(body: unknown, { csrf = true } = {}): NextRequest {
  return new NextRequest('https://test/api/assistant', {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-access-token',
      'content-type': 'application/json',
      ...(csrf ? { 'x-csrf-token': 'csrf-tok', cookie: 'app-csrf=csrf-tok' } : {}),
    },
    body: JSON.stringify(body),
  });
}

const ask = (content: string, extra: Record<string, unknown> = {}) => ({
  messages: [{ role: 'user', content }],
  ...extra,
});

beforeEach(() => {
  __cookieStore.clear();
  mockGenerateContent.mockReset();
  mockRateLimit.mockReset().mockResolvedValue(null);
  vi.mocked(verifyToken).mockReset().mockResolvedValue({
    sub: USER_ID,
    email: 'owner@test.local',
    tokenVersion: 0,
  });
  prismaMock.user.findUnique.mockResolvedValue({
    id: USER_ID,
    email: 'owner@test.local',
    tokenVersion: 0,
  } as never);
  process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
});

describe('POST /api/assistant', () => {
  it('rejects a request without the CSRF token', async () => {
    const res = await POST(makeReq(ask('Bonjour'), { csrf: false }));
    expect(res.status).toBe(403);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('rejects an empty conversation', async () => {
    const res = await POST(makeReq({ messages: [] }));
    expect(res.status).toBe(400);
  });

  it('answers with the model, from the RenderBox documentation', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'Ouvrez le mode **Commenter**.',
      candidates: [],
    });
    const res = await POST(makeReq(ask('Comment modifier un rendu ?')));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reply).toBe('Ouvrez le mode **Commenter**.');
    const call = mockGenerateContent.mock.calls[0]![0];
    expect(call.config.systemInstruction).toContain('COMMENTER');
    expect(call.config.tools).toBeUndefined();
    expect(call.contents).toEqual([
      { role: 'user', parts: [{ text: 'Comment modifier un rendu ?' }] },
    ]);
  });

  it('search mode turns on web search and returns the sources', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'Le béton brut…',
      candidates: [
        {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: 'https://example.org/beton', title: 'Béton' } },
              { web: {} },
            ],
          },
        },
      ],
    });
    const res = await POST(makeReq(ask('Entretien du béton brut ?', { mode: 'search' })));
    const json = await res.json();
    expect(mockGenerateContent.mock.calls[0]![0].config.tools).toEqual([{ googleSearch: {} }]);
    expect(json.sources).toEqual([{ title: 'Béton', url: 'https://example.org/beton' }]);
  });

  it('falls back to a keyword answer when the model call fails', async () => {
    mockGenerateContent.mockRejectedValue(new Error('upstream down'));
    const res = await POST(makeReq(ask('Quel moteur choisir ?')));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.fallback).toBe(true);
    expect(json.reply).toContain('Moteur 1');
  });

  it('falls back without calling anything when there is no key, in the asked language', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await POST(makeReq(ask('What is Enhance for?', { locale: 'en' })));
    const json = await res.json();
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(json.reply).toContain('Enhance');
    expect(json.reply).toContain('Subtle');
  });

  it('returns the limiter response when the hourly limit is reached', async () => {
    mockRateLimit.mockResolvedValue(
      NextResponse.json({ error: 'ASSISTANT_RATE_LIMITED' }, { status: 429 }),
    );
    const res = await POST(makeReq(ask('Bonjour')));
    expect(res.status).toBe(429);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});
