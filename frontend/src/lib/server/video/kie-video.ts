// The Kie calls the video module makes (2026-11-07). Everything that touches
// the network lives here; the decisions live in settle.ts, which is why that
// file is tested and this one is thin.
//
// Three steps, the same shape as the image engines' kie.ts:
//   1. the frames are uploaded to Kie's file store — they must be URLs, and
//      Kie deletes them after 24 h, which is fine: a task starts at once;
//   2. POST api.kie.ai/api/v1/jobs/createTask with a `callBackUrl`, so we do
//      not hold a serverless function open for five minutes;
//   3. GET api.kie.ai/api/v1/jobs/recordInfo?taskId= — used by the callback
//      to re-ask what really happened, and by the sweeper for the tasks whose
//      callback never arrived.
// Kie answers HTTP 200 even on errors: the body's `code` says what happened.
import 'server-only';
import { randomUUID } from 'node:crypto';
import { KieError } from '@/lib/server/generation/engines/kie';
import { normalizeKieCredits } from '@/lib/provider-cost';
import type { KieVideoTask } from '@/lib/server/generation/video-adapters';

const API = 'https://api.kie.ai/api/v1/jobs';
const UPLOAD = 'https://kieai.redpandaai.co/api/file-stream-upload';
/** Kie's own figure for these endpoints; a hung call must not hold the route. */
const TIMEOUT_MS = 20_000;

function key(): string {
  const value = process.env.KIE_API_KEY ?? '';
  if (!value) throw new KieError('kie video: no KIE_API_KEY', null, 'create');
  return value;
}

function auth(): Record<string, string> {
  return { Authorization: `Bearer ${key()}` };
}

interface KieBody<T> {
  code?: number;
  msg?: string;
  data?: T;
}

async function readBody<T>(res: Response, stage: KieError['stage']): Promise<T> {
  const body = (await res.json().catch(() => null)) as KieBody<T> | null;
  const code = typeof body?.code === 'number' ? body.code : res.ok ? null : res.status;
  if (!res.ok || code !== 200 || !body?.data) {
    throw new KieError(`kie video ${stage}: ${body?.msg ?? res.statusText}`, code, stage);
  }
  return body.data;
}

/** A frame, in Kie's file store, as a URL its models can read. */
export async function uploadFrame(buffer: Buffer, mimeType: string): Promise<string> {
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const fileName = `${randomUUID()}.${extension}`;
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);
  form.append('uploadPath', 'renderpro-video');
  form.append('fileName', fileName);
  const res = await fetch(UPLOAD, {
    method: 'POST',
    headers: auth(),
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await readBody<{ downloadUrl?: string }>(res, 'upload');
  if (!data.downloadUrl) throw new KieError('kie video upload: no downloadUrl', null, 'upload');
  return data.downloadUrl;
}

/**
 * Create the task. The body comes from the engine's adapter and is sent as
 * built — this function adds only the callback, so that a mistake in a body
 * can only ever come from the adapter the tests cover.
 */
export async function createVideoTask(task: KieVideoTask, callBackUrl: string): Promise<string> {
  const res = await fetch(`${API}/createTask`, {
    method: 'POST',
    headers: { ...auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...task, callBackUrl }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await readBody<{ taskId?: string }>(res, 'create');
  if (!data.taskId) throw new KieError('kie video create: no taskId', null, 'create');
  return data.taskId;
}

export interface VideoTaskRecord {
  state: string;
  videoUrl: string | null;
  providerCredits: number | null;
  failCode: string | null;
  failMsg: string | null;
}

/**
 * Where the finished clip hides. Kie's own shape differs between endpoints
 * — Veo returns `result_urls`, the market models `resultUrls` — and a reader
 * that knows only one of them reports « finished with nothing », refunds a
 * good clip and throws it away. So every known shape is tried, and the first
 * URL that looks like a video wins.
 */
export function readVideoUrl(resultJson: unknown): string | null {
  let parsed: unknown = resultJson;
  if (typeof resultJson === 'string') {
    try {
      parsed = JSON.parse(resultJson);
    } catch {
      return null;
    }
  }
  const seen = new Set<unknown>();
  const stack: unknown[] = [parsed];
  const keys = ['resultUrls', 'result_urls', 'videoUrl', 'video_url', 'videos', 'url'];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    const record = node as Record<string, unknown>;
    for (const k of keys) {
      const value = record[k];
      if (typeof value === 'string' && /^https?:\/\//.test(value)) return value;
      if (Array.isArray(value)) {
        const first = value.find((v) => typeof v === 'string' && /^https?:\/\//.test(v));
        if (typeof first === 'string') return first;
      }
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return null;
}

/** Ask Kie what really happened. The callback's body is never believed. */
export async function readVideoTask(
  taskId: string,
  expectedCredits: number | null,
): Promise<VideoTaskRecord> {
  const res = await fetch(`${API}/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: auth(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await readBody<{
    state?: string;
    resultJson?: string | null;
    failCode?: string | null;
    failMsg?: string | null;
    creditsConsumed?: number;
  }>(res, 'poll');
  const raw = typeof data.creditsConsumed === 'number' ? data.creditsConsumed : null;
  return {
    state: data.state ?? '',
    videoUrl: readVideoUrl(data.resultJson ?? null),
    // Kie answered in tenths of a credit until 2026-10-19; the image path
    // reads the unit against the expected price, and so does this one.
    providerCredits: raw === null ? null : normalizeKieCredits(raw, expectedCredits),
    failCode: data.failCode ?? null,
    failMsg: data.failMsg ?? null,
  };
}

/** The finished clip's bytes. Kie keeps its copy days; we keep our own. */
export async function downloadVideo(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    throw new KieError(`kie video download: ${res.status}`, res.status, 'download');
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get('content-type') ?? 'video/mp4';
  return { buffer, mimeType: mimeType.startsWith('video/') ? mimeType : 'video/mp4' };
}
