// Kie (kie.ai) — the one provider behind every engine version (owner,
// 2026-10-15: « l'API Kie seulement pour Nano Banana et ChatGPT Image »).
// Shown in the UI only as Visio / Pixel IA and their numbers.
//
// A Kie market task runs in three steps (docs.kie.ai, read 2026-10-15):
//   1. the images are uploaded to Kie's file store (they must be URLs; files
//      are deleted after 24 h) — POST kieai.redpandaai.co/api/file-stream-upload;
//   2. the task is created — POST api.kie.ai/api/v1/jobs/createTask;
//   3. the task is polled — GET api.kie.ai/api/v1/jobs/recordInfo?taskId= —
//      until `success` (resultJson.resultUrls) or `fail`, then the image is
//      downloaded (Kie keeps it 14 days; we store our own copy).
// Kie answers HTTP 200 even on errors: the body's `code` says what happened.
// Every request carries the engine deadline's signal (index.ts).
import 'server-only';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { GenerateRenderInput, GenerateRenderOutput } from './types';
import { ENGINE_VERSIONS, kieRatioFor, type EngineVersionKey } from '../engine-versions';
import { RESOLUTIONS } from '../resolutions';
import { log } from '@/lib/server/observability/log';

const API = 'https://api.kie.ai/api/v1/jobs';
const UPLOAD = 'https://kieai.redpandaai.co/api/file-stream-upload';
/** First look after 4 s, then every 3 s — a render takes 20 s to 2 min. */
const FIRST_POLL_MS = 4_000;
const POLL_MS = 3_000;

export function isKieConfigured(): boolean {
  return Boolean(process.env.KIE_API_KEY);
}

/** Kie refused or failed the request. `code` is Kie's own (body) code. */
export class KieError extends Error {
  constructor(
    message: string,
    public readonly code: number | null,
    public readonly stage: 'upload' | 'create' | 'poll' | 'task' | 'download',
  ) {
    super(message);
    this.name = 'KieError';
  }
}

/**
 * The Kie account itself is the problem — a key Kie does not accept (401) or
 * no credits left on it (402) — not the request. index.ts falls back to the
 * direct engine then, so a forgotten top-up does not stop every render.
 */
export function isKieAccountError(err: unknown): err is KieError {
  return err instanceof KieError && (err.code === 401 || err.code === 402);
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal!.reason);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
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
    throw new KieError(`kie ${stage}: ${body?.msg ?? res.statusText}`, code, stage);
  }
  return body.data;
}

async function upload(
  key: string,
  buffer: Buffer,
  mimeType: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const form = new FormData();
  const fileName = `${randomUUID()}.${extensionFor(mimeType)}`;
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);
  form.append('uploadPath', 'renderpro');
  form.append('fileName', fileName);
  const res = await fetch(UPLOAD, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    ...(signal ? { signal } : {}),
  });
  const data = await readBody<{ downloadUrl?: string }>(res, 'upload');
  if (!data.downloadUrl) throw new KieError('kie upload: no downloadUrl', null, 'upload');
  return data.downloadUrl;
}

interface TaskRecord {
  state?: string;
  resultJson?: string | null;
  failCode?: string | null;
  failMsg?: string | null;
  costTime?: number;
  creditsConsumed?: number;
}

export async function generateWithKie(
  versionKey: EngineVersionKey,
  input: GenerateRenderInput,
): Promise<GenerateRenderOutput> {
  const key = process.env.KIE_API_KEY ?? '';
  if (!key) throw new KieError('kie: KIE_API_KEY missing', 401, 'create');
  const version = ENGINE_VERSIONS[versionKey];
  const { signal } = input;
  const auth = { Authorization: `Bearer ${key}` };

  // Source first, then the references, as the prompt numbers them; cut to
  // what the model takes.
  const images = [
    { buffer: input.sourceImageBuffer, mimeType: input.sourceMimeType },
    ...(input.referenceImages ?? []),
  ];
  if (images.length > version.maxImages) {
    log.warn('kie: more images than the model takes, extra references dropped', {
      version: versionKey,
      given: images.length,
      max: version.maxImages,
    });
  }
  const urls = await Promise.all(
    images.slice(0, version.maxImages).map((img) => upload(key, img.buffer, img.mimeType, signal)),
  );

  const size = input.resolution ? RESOLUTIONS[input.resolution].gemini : undefined;
  let sourceAspect: number | null = null;
  if (version.ratioRequired && (!input.aspectRatio || input.aspectRatio === 'auto')) {
    const meta = await sharp(input.sourceImageBuffer).metadata();
    sourceAspect = meta.width && meta.height ? meta.width / meta.height : null;
  }
  const ratio = kieRatioFor(version, input.aspectRatio, sourceAspect, size);

  const created = await fetch(`${API}/createTask`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: version.kieModel,
      input: {
        prompt: input.prompt,
        [version.imageField]: urls,
        ...(ratio ? { aspect_ratio: ratio } : {}),
        ...(version.resolution ? { resolution: size ?? '1K' } : {}),
        ...version.extra,
      },
    }),
    ...(signal ? { signal } : {}),
  });
  const { taskId } = await readBody<{ taskId?: string }>(created, 'create');
  if (!taskId) throw new KieError('kie create: no taskId', null, 'create');

  // Until success or failure; the engine deadline (index.ts) aborts the wait.
  let record: TaskRecord;
  await sleep(FIRST_POLL_MS, signal);
  for (;;) {
    const res = await fetch(`${API}/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: auth,
      ...(signal ? { signal } : {}),
    });
    record = await readBody<TaskRecord>(res, 'poll');
    if (record.state === 'success' || record.state === 'fail') break;
    await sleep(POLL_MS, signal);
  }

  if (record.state === 'fail') {
    log.warn('kie: task failed', {
      version: versionKey,
      taskId,
      failCode: record.failCode,
      failMsg: record.failMsg,
    });
    throw new KieError(
      `kie task failed: ${record.failMsg ?? 'unknown'}`,
      record.failCode ? Number(record.failCode) : null,
      'task',
    );
  }

  let resultUrl: string | undefined;
  try {
    resultUrl = (JSON.parse(record.resultJson ?? '{}') as { resultUrls?: string[] })
      .resultUrls?.[0];
  } catch {
    resultUrl = undefined;
  }
  if (!resultUrl) throw new KieError('kie task: no result URL', null, 'task');

  // What each version really costs: read in the logs to price the versions.
  log.info('kie: task done', {
    version: versionKey,
    model: version.kieModel,
    taskId,
    costTime: record.costTime,
    creditsConsumed: record.creditsConsumed,
  });

  const image = await fetch(resultUrl, signal ? { signal } : {});
  if (!image.ok) throw new KieError(`kie download: HTTP ${image.status}`, image.status, 'download');
  const mimeType = image.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  const credits = Number(record.creditsConsumed);
  return {
    imageBuffer: Buffer.from(await image.arrayBuffer()),
    mimeType: mimeType.startsWith('image/') ? mimeType : 'image/png',
    ...(Number.isFinite(credits) && credits >= 0 ? { providerCredits: credits } : {}),
  };
}

/**
 * The Kie account's remaining credits (GET /api/v1/chat/credit; reading it
 * costs nothing) — for the API usage in /admin (owner, 2026-10-17). Null when
 * no key is set. Kie answers HTTP 200 even on failure: its body `code` says.
 */
export async function getKieBalance(signal?: AbortSignal): Promise<number | null> {
  const key = process.env.KIE_API_KEY;
  if (!key) return null;
  const res = await fetch('https://api.kie.ai/api/v1/chat/credit', {
    // Kie's refusal names both headers, so both are sent, as on createTask.
    headers: { Authorization: `Bearer ${key.trim()}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  const body = (await res.json().catch(() => null)) as KieBody<unknown> | null;
  const code = typeof body?.code === 'number' ? body.code : res.status;
  const credits = readCredits(body?.data);
  if (!res.ok || code !== 200 || credits === null) {
    throw new KieError(body?.msg ?? res.statusText ?? 'no answer', code, 'poll');
  }
  return credits;
}

/** The balance as Kie sends it: a number, a numeric string, or an object
 *  holding one (`credits`, `credit`, `balance`…). */
export function readCredits(data: unknown): number | null {
  if (typeof data === 'number') return Number.isFinite(data) ? data : null;
  if (typeof data === 'string' && data.trim() !== '') {
    const n = Number(data);
    return Number.isFinite(n) ? n : null;
  }
  if (data && typeof data === 'object') {
    for (const f of ['credits', 'credit', 'balance', 'remaining', 'remainCredits']) {
      const n = readCredits((data as Record<string, unknown>)[f]);
      if (n !== null) return n;
    }
  }
  return null;
}
