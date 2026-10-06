// POST /api/assistant — the in-app help chat (after the owner's Metrio
// assistant). Two modes: "renderbox" answers from the app's own
// documentation (lib/server/assistant/knowledge.ts), "search" answers
// architecture/material questions with web search and returns its sources.
//
// Gemini first (the key the engines already use); if there is no key or the
// call fails, a keyword answer (lib/server/assistant/fallback.ts) so the
// assistant never just errors out.
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { enforceAssistantRateLimit } from '@/lib/server/middleware/rate-limit-assistant';
import { buildSystemPrompt } from '@/lib/server/assistant/knowledge';
import { fallbackReply } from '@/lib/server/assistant/fallback';

export const runtime = 'nodejs';

const MODEL = process.env.ASSISTANT_MODEL || 'gemini-2.5-flash';
const MAX_MESSAGES = 20;
const MAX_CHARS = 2000;

const Body = z.object({
  mode: z.enum(['renderbox', 'search']).default('renderbox'),
  locale: z.enum(['fr', 'en']).default('fr'),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(MAX_CHARS),
      }),
    )
    .min(1)
    .max(MAX_MESSAGES),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', issues: parsed.error.issues },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { mode, locale, messages } = parsed.data;
    const last = [...messages].reverse().find((m) => m.role === 'user');
    if (!last) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'No user message' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const limited = await enforceAssistantRateLimit(auth.user.sub);
    if (limited) return limited;

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const client = new GoogleGenAI({ apiKey });
        const response = await client.models.generateContent({
          model: MODEL,
          contents: messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          config: {
            systemInstruction: buildSystemPrompt(mode, locale),
            temperature: 0.4,
            maxOutputTokens: 900,
            ...(mode === 'search' ? { tools: [{ googleSearch: {} }] } : {}),
          },
        });
        const reply = response.text?.trim();
        if (reply) {
          const sources = (response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
            .map((c) => c.web)
            .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri))
            .slice(0, 5)
            .map((w) => ({ title: w.title || w.uri, url: w.uri }));
          return NextResponse.json(
            { reply, mode, sources },
            { headers: { 'x-request-id': ctx.requestId } },
          );
        }
      } catch (err) {
        log.warn('assistant: model call failed, using the keyword answer', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json(
      { reply: fallbackReply(last.content, locale), mode, sources: [], fallback: true },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
