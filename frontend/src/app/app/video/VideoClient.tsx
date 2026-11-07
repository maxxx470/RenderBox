'use client';

// The video workspace (2026-11-07, owner's « Cahier de référence »).
//
// Image to video only. There is no free prompt field that could run on its
// own: the source is always one of the account's own renders, because a
// prompt alone would invent a building and this module exists to preserve
// one.
//
// THE RULE THAT SHAPES THE WHOLE SCREEN, in the owner's words: « ne jamais
// afficher une fonctionnalité comme disponible si l'endpoint et la version
// du modèle sélectionné ne la prennent pas réellement en charge. » So every
// control below is drawn from the chosen engine's own catalogue, and a
// control that does not apply DISAPPEARS rather than sitting greyed out —
// Gemini Omni has no start frame, Hailuo has no end frame, Wan has no ratio,
// and the interface simply does not offer them.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppSurface, type AppSurfaceProps } from '../AppSurface';
import { CHIP_ACTIVE, CHIP_BASE, CHIP_SLOT, CHIP_STATIC } from '../chip';
import type { RecentRenderCardData } from '../GenerationHome';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { api, ApiError } from '@/lib/api';
import { videoPrice } from '@/lib/provider-cost';
import {
  DEFAULT_VIDEO_MODEL,
  VIDEO_MODELS,
  VIDEO_MODEL_KEYS,
  videoResolutionsFor,
  type VideoMode,
  type VideoModelKey,
} from '@/lib/server/generation/video-models';
import {
  ANIMATION_INTENSITY,
  CAMERA_MOVES,
  CAMERA_MOVE_KEYS,
  ENVIRONMENT_ELEMENTS,
  ENVIRONMENT_KEYS,
  INTENSITY_KEYS,
  type CameraMoveKey,
  type EnvironmentKey,
  type IntensityKey,
} from '@/lib/server/generation/video-moves';

interface VideoJobRow {
  id: string;
  model: string;
  camera: string;
  duration: number;
  resolution: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  creditsCharged: number;
  failCode: string | null;
  createdAt: string;
  sourceNodeId: string | null;
}

/** While a clip works, ask again. This poll is also what keeps the sweeper
 *  running without anyone scheduling it — see sweep.ts. */
const POLL_MS = 8_000;

const CARD = 'rounded-2xl bg-white p-4 min-[640px]:p-5 shadow-[0_1px_2px_rgba(23,22,31,0.04)]';
const LABEL =
  'mb-2 block font-[family-name:var(--font-mono)] text-[11px] font-medium uppercase tracking-[0.14em] text-[#8A8896]';

export function VideoClient({
  surface,
  recentRenders,
}: {
  surface: AppSurfaceProps;
  recentRenders: RecentRenderCardData[];
}) {
  const { t, locale } = useLocale();
  const lang = locale === 'fr' ? 'fr' : 'en';

  const [model, setModel] = useState<VideoModelKey>(DEFAULT_VIDEO_MODEL);
  const [sourceId, setSourceId] = useState<string | null>(recentRenders[0]?.id ?? null);
  const [endId, setEndId] = useState<string | null>(null);
  const [camera, setCamera] = useState<CameraMoveKey>('push_in');
  const [environment, setEnvironment] = useState<EnvironmentKey[]>(['trees', 'clouds']);
  const [intensity, setIntensity] = useState<IntensityKey>('natural');
  const [note, setNote] = useState('');
  const [audio, setAudio] = useState(false);
  const [jobs, setJobs] = useState<VideoJobRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const engine = VIDEO_MODELS[model];
  const caps = engine.capabilities;

  // The mode follows the engine and the frames, never the other way round:
  // picking an end frame on an engine that has none is impossible because
  // the slot is not drawn.
  const mode: VideoMode = caps.modes.includes('first')
    ? endId && caps.modes.includes('first_last')
      ? 'first_last'
      : 'first'
    : 'reference';

  // Durations and sizes come from the engine, and the size list depends on
  // the duration (Hailuo has no 10 s at 1080P).
  const [duration, setDuration] = useState<number>(caps.durations[0] ?? 5);
  const resolutions = videoResolutionsFor(model, duration);
  const [resolution, setResolution] = useState<string>(resolutions[0] ?? '720p');

  // Changing engine can leave an impossible duration or size behind. Rather
  // than refusing the request later, the settings snap to what the new
  // engine really offers.
  useEffect(() => {
    const next = VIDEO_MODELS[model].capabilities;
    setDuration((d) => (next.durations.includes(d) ? d : (next.durations[0] ?? 5)));
    if (!next.modes.includes('first_last')) setEndId(null);
    if (next.audio !== 'toggle') setAudio(next.audio === 'always');
  }, [model]);

  useEffect(() => {
    const allowed = videoResolutionsFor(model, duration);
    setResolution((r) => (allowed.includes(r) ? r : (allowed[0] ?? '720p')));
  }, [model, duration]);

  const cost = videoPrice(model, duration, resolution);

  const load = useCallback(async () => {
    try {
      const data = await api<{ jobs: VideoJobRow[] }>('/api/video/jobs');
      setJobs(data.jobs);
    } catch {
      // A failed poll is not worth a message: the next one is 8 s away.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll only while something is actually working.
  const working = jobs.some((j) => j.status === 'PENDING' || j.status === 'RUNNING');
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [working, load]);

  const canSend = Boolean(sourceId || mode === 'reference') && cost !== null && !busy;

  async function send() {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/video/jobs', {
        method: 'POST',
        body: JSON.stringify({
          model,
          mode,
          ...(sourceId ? { sourceNodeId: sourceId } : {}),
          ...(mode === 'first_last' && endId ? { endNodeId: endId } : {}),
          ...(mode === 'reference' && sourceId ? { referenceNodeIds: [sourceId] } : {}),
          camera,
          environment,
          intensity,
          duration,
          resolution,
          audio,
          ...(note.trim() ? { request: note.trim() } : {}),
        }),
      });
      setNote('');
      await load();
    } catch (err: unknown) {
      const code = err instanceof ApiError ? err.code : 'UNKNOWN';
      setError(code);
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = useMemo(
    () => ({
      PENDING: t('video.statusPending'),
      RUNNING: t('video.statusRunning'),
      SUCCEEDED: t('video.statusReady'),
      FAILED: t('video.statusFailed'),
      EXPIRED: t('video.statusFailed'),
    }),
    [t],
  );

  return (
    <AppSurface
      {...surface}
      eyebrow={t('video.eyebrow')}
      title={t('video.title')}
      subtitle={t('video.subtitle')}
    >
      <div className="flex flex-col gap-5">
        {/* ── The engines, as cards carrying their vendor's own mark ───── */}
        <section className={CARD}>
          <span className={LABEL}>{t('video.engine')}</span>
          <div className="grid grid-cols-1 gap-2 min-[560px]:grid-cols-2 min-[900px]:grid-cols-3">
            {VIDEO_MODEL_KEYS.map((key) => {
              const m = VIDEO_MODELS[key];
              const on = key === model;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setModel(key)}
                  aria-pressed={on}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 text-left transition-colors ${
                    on ? 'bg-[#EEF1FF]' : 'bg-[#F7F7FA] hover:bg-[#F2F2F5]'
                  }`}
                >
                  {/* The vendor's trademark, used to say whose engine this
                      is — never recoloured to our charter. */}
                  <img
                    src={m.logo}
                    alt=""
                    aria-hidden
                    width={32}
                    height={32}
                    className="h-8 w-8 flex-shrink-0 rounded-lg bg-white"
                  />
                  <span className="min-w-0">
                    <span
                      className={`block truncate font-[family-name:var(--font-display)] text-[14px] font-bold ${
                        on ? 'text-[#1E36D6]' : 'text-[#17161F]'
                      }`}
                    >
                      {m.label}
                    </span>
                    <span className="block truncate text-[12px] text-[#8A8896]">
                      {m.positioning[lang]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── The source, and the end frame where the engine has one ───── */}
        <section className={CARD}>
          <span className={LABEL}>
            {mode === 'reference' ? t('video.reference') : t('video.source')}
          </span>
          {recentRenders.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-[#6B6878]">{t('video.noRender')}</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {recentRenders.map((r) => {
                const on = r.id === sourceId;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSourceId(r.id)}
                    aria-pressed={on}
                    title={r.projectName}
                    className={`h-[60px] w-20 flex-shrink-0 cursor-pointer overflow-hidden rounded-lg ${
                      on ? 'ring-2 ring-[#2948FC]' : 'ring-1 ring-[#ECECF2]'
                    }`}
                  >
                    <img
                      src={`/api/render-nodes/${r.id}/image?size=thumb`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                );
              })}
            </div>
          )}

          {/* Drawn only where the endpoint really takes an end frame. */}
          {caps.modes.includes('first_last') && recentRenders.length > 0 && (
            <div className="mt-4">
              <span className={LABEL}>{t('video.endFrame')}</span>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setEndId(null)}
                  className={endId === null ? CHIP_ACTIVE : CHIP_SLOT}
                >
                  {t('video.noEndFrame')}
                </button>
                {recentRenders
                  .filter((r) => r.id !== sourceId)
                  .map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setEndId(r.id)}
                      aria-pressed={r.id === endId}
                      className={`h-[60px] w-20 flex-shrink-0 cursor-pointer overflow-hidden rounded-lg ${
                        r.id === endId ? 'ring-2 ring-[#2948FC]' : 'ring-1 ring-[#ECECF2]'
                      }`}
                    >
                      <img
                        src={`/api/render-nodes/${r.id}/image?size=thumb`}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
              </div>
            </div>
          )}
        </section>

        {/* ── The movement, what may move, and how much ─────────────────── */}
        <section className={CARD}>
          <span className={LABEL}>{t('video.camera')}</span>
          <div className="flex flex-wrap gap-2">
            {CAMERA_MOVE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setCamera(key)}
                className={`cursor-pointer ${key === camera ? CHIP_ACTIVE : CHIP_BASE}`}
              >
                {CAMERA_MOVES[key][lang]}
              </button>
            ))}
          </div>

          <div className="mt-5">
            <span className={LABEL}>{t('video.environment')}</span>
            <div className="flex flex-wrap gap-2">
              {ENVIRONMENT_KEYS.map((key) => {
                const on = environment.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setEnvironment((prev) =>
                        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
                      )
                    }
                    className={`cursor-pointer ${on ? CHIP_ACTIVE : CHIP_BASE}`}
                  >
                    {ENVIRONMENT_ELEMENTS[key][lang]}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-[#8A8896]">
              {t('video.environmentNote')}
            </p>
          </div>

          <div className="mt-5">
            <span className={LABEL}>{t('video.intensity')}</span>
            <div className="flex flex-wrap gap-2">
              {INTENSITY_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setIntensity(key)}
                  className={`cursor-pointer ${key === intensity ? CHIP_ACTIVE : CHIP_BASE}`}
                >
                  {ANIMATION_INTENSITY[key][lang]}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── The command bar ──────────────────────────────────────────── */}
        <section className={CARD}>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={t('video.notePlaceholder')}
            className="w-full resize-none rounded-xl bg-[#F4F4F7] p-3 text-[14px] text-[#17161F] outline-none placeholder:text-[#8A8896]"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* Durations the engine really accepts. */}
            {caps.durations.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={`cursor-pointer ${d === duration ? CHIP_ACTIVE : CHIP_BASE}`}
              >
                {d}s
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-[#ECECF2]" />
            {resolutions.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setResolution(r)}
                className={`cursor-pointer ${r === resolution ? CHIP_ACTIVE : CHIP_BASE}`}
              >
                {r}
              </button>
            ))}

            {/* A switch only where there is something to switch. Veo always
                produces sound and offers no parameter, so it says so
                instead of pretending to be adjustable. */}
            {caps.audio === 'toggle' && (
              <button
                type="button"
                onClick={() => setAudio((a) => !a)}
                className={`cursor-pointer ${audio ? CHIP_ACTIVE : CHIP_BASE}`}
              >
                {t('video.sound')}
              </button>
            )}
            {caps.audio === 'always' && <span className={CHIP_STATIC}>{t('video.soundOn')}</span>}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-[#6B6878]">
              {cost === null ? (
                t('video.priceUnknown')
              ) : (
                <>
                  <span className="font-[family-name:var(--font-mono)] font-semibold text-[#17161F]">
                    {cost}
                  </span>{' '}
                  {t('video.credits')}
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              className="cursor-pointer rounded-xl bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] px-5 py-2.5 text-[14px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t('video.sending') : t('video.send')}
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-[#FFE4E7] px-3 py-2 text-[13px] text-[#C21F33]">
              {error === 'INSUFFICIENT_CREDITS' || error === 'NO_ACTIVE_TIER'
                ? t('video.errorCredits')
                : error === 'PRICE_NOT_VERIFIED'
                  ? t('video.priceUnknown')
                  : t('video.errorGeneric')}
            </p>
          )}
        </section>

        {/* ── The clips ────────────────────────────────────────────────── */}
        <section className={CARD}>
          <span className={LABEL}>{t('video.yourClips')}</span>
          {jobs.length === 0 ? (
            <p className="text-[13px] text-[#6B6878]">{t('video.noClip')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {jobs.map((job) => (
                <li key={job.id} className="rounded-xl bg-[#F7F7FA] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-[#17161F]">
                      {VIDEO_MODELS[job.model as VideoModelKey]?.label ?? job.model} ·{' '}
                      {job.duration}s · {job.resolution}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11.5px] font-semibold ${
                        job.status === 'SUCCEEDED'
                          ? 'bg-[#E3F3E9] text-[#1E7A3D]'
                          : job.status === 'FAILED' || job.status === 'EXPIRED'
                            ? 'bg-[#FFE4E7] text-[#C21F33]'
                            : 'bg-[#EEF1FF] text-[#1E36D6]'
                      }`}
                    >
                      {statusLabel[job.status]}
                    </span>
                  </div>
                  {job.status === 'SUCCEEDED' && (
                    <video
                      src={`/api/video/jobs/${job.id}/file`}
                      controls
                      playsInline
                      preload="none"
                      className="mt-3 w-full rounded-lg bg-black"
                    />
                  )}
                  {(job.status === 'FAILED' || job.status === 'EXPIRED') && (
                    <p className="mt-2 text-[12.5px] text-[#6B6878]">{t('video.refunded')}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppSurface>
  );
}
