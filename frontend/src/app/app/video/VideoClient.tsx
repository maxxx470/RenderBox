'use client';

// The video workspace (2026-11-07, rebuilt the same day after the owner saw
// the first version: « Je ne valide pas du tout ce que tu as proposé … Je
// t'ai bien demandé de mettre une commande bar »).
//
// It now has the workspace's own layout, like the image generator and
// Améliorer: the stage on top — the source, then the clip beside it once it
// is ready — and ONE command bar under it at the stage's width. The first
// version stacked settings into cards down the page, which is a form, not a
// workspace.
//
// Image to video only. The source is always one of the account's own
// renders: there is no free prompt that could run on its own, because a
// prompt alone would invent a building and this module exists to keep one.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppSurface, type AppSurfaceProps } from '../AppSurface';
import type { RecentRenderCardData } from '../GenerationHome';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { api, ApiError } from '@/lib/api';
import {
  DEFAULT_VIDEO_MODEL,
  VIDEO_MODELS,
  videoResolutionsFor,
  type VideoMode,
  type VideoModelKey,
} from '@/lib/server/generation/video-models';
import { VideoBar, type VideoBarState } from './VideoBar';
import { VideoSettings } from './VideoSettings';

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

/** While a clip works, ask again. This poll is also the heartbeat that
 *  settles what the callback never closed — see sweep.ts. */
const POLL_MS = 8_000;

export function VideoClient({
  surface,
  recentRenders,
}: {
  surface: AppSurfaceProps;
  recentRenders: RecentRenderCardData[];
}) {
  const { t } = useLocale();

  const firstCaps = VIDEO_MODELS[DEFAULT_VIDEO_MODEL].capabilities;
  const [state, setState] = useState<VideoBarState>({
    model: DEFAULT_VIDEO_MODEL,
    camera: 'push_in',
    environment: ['trees', 'clouds'],
    intensity: 'natural',
    duration: firstCaps.durations[0] ?? 5,
    resolution: videoResolutionsFor(DEFAULT_VIDEO_MODEL, firstCaps.durations[0] ?? 5)[0] ?? '720p',
    audio: firstCaps.audio === 'always',
    note: '',
  });
  // NOTHING is pinned on arrival (owner, 2026-11-07: « j'ai remarqué qu'il y
  // a une image par défaut qui a été ajoutée et je ne vois pas pourquoi tu as
  // fait ça. C'est l'utilisateur lui-même qui décide de mettre une image ou
  // pas »). Pre-selecting the latest render also made the send button look
  // ready to spend credits on an image nobody chose.
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [endId, setEndId] = useState<string | null>(null);
  /** Which slot the picker fills when a thumbnail is clicked. */
  const [picking, setPicking] = useState<'source' | 'end' | null>(null);
  const [jobs, setJobs] = useState<VideoJobRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const caps = VIDEO_MODELS[state.model].capabilities;

  // Changing engine can leave an impossible duration, size or end frame
  // behind. The settings snap to what the new engine really offers, rather
  // than letting the request be refused later.
  useEffect(() => {
    setState((s) => {
      const next = VIDEO_MODELS[s.model].capabilities;
      const duration = next.durations.includes(s.duration) ? s.duration : (next.durations[0] ?? 5);
      const sizes = videoResolutionsFor(s.model, duration);
      return {
        ...s,
        duration,
        resolution: sizes.includes(s.resolution) ? s.resolution : (sizes[0] ?? '720p'),
        audio: next.audio === 'toggle' ? s.audio : next.audio === 'always',
      };
    });
  }, [state.model, state.duration]);

  useEffect(() => {
    if (!caps.modes.includes('first_last')) setEndId(null);
  }, [caps]);

  const mode: VideoMode = caps.modes.includes('first')
    ? endId && caps.modes.includes('first_last')
      ? 'first_last'
      : 'first'
    : 'reference';

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

  const working = jobs.some((j) => j.status === 'PENDING' || j.status === 'RUNNING');
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [working, load]);

  async function send() {
    if (!sourceId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api('/api/video/jobs', {
        method: 'POST',
        body: JSON.stringify({
          model: state.model,
          mode,
          ...(mode === 'reference' ? { referenceNodeIds: [sourceId] } : { sourceNodeId: sourceId }),
          ...(mode === 'first_last' && endId ? { endNodeId: endId } : {}),
          camera: state.camera,
          environment: state.environment,
          intensity: state.intensity,
          duration: state.duration,
          resolution: state.resolution,
          audio: state.audio,
          ...(state.note.trim() ? { request: state.note.trim() } : {}),
        }),
      });
      setState((s) => ({ ...s, note: '' }));
      await load();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.code : 'UNKNOWN');
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

  const latestReady = jobs.find((j) => j.status === 'SUCCEEDED') ?? null;

  return (
    <AppSurface
      {...surface}
      eyebrow={t('video.eyebrow')}
      title={t('video.title')}
      subtitle={t('video.subtitle')}
    >
      {/* The workspace's own shape: the stage and its command bar in
          one column, the shot settings in a band on the right — the
          same place « Images récentes » and « À améliorer » sit. Below
          900px the band stacks under the bar rather than hiding in a
          drawer: on a phone nothing should be behind a second tap. */}
      <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* ── The stage: the source, and the clip once there is one ──── */}
          <section className="rounded-2xl bg-white p-4 min-[640px]:p-5">
            {recentRenders.length === 0 ? (
              <p className="py-10 text-center text-[13.5px] text-[#6B6878]">
                {t('video.noRender')}
              </p>
            ) : (
              <div className="grid gap-4 min-[860px]:grid-cols-2">
                <figure className="m-0">
                  <figcaption className="mb-2 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.14em] text-[#8A8896]">
                    {t('video.source')}
                  </figcaption>
                  {sourceId ? (
                    <img
                      src={`/api/render-nodes/${sourceId}/image`}
                      alt=""
                      className="w-full rounded-xl bg-[#F7F7FA] object-contain"
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center rounded-xl bg-[#F7F7FA] text-[13px] text-[#8A8896]">
                      {t('video.pickSource')}
                    </div>
                  )}
                </figure>
                <figure className="m-0">
                  <figcaption className="mb-2 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.14em] text-[#8A8896]">
                    {t('video.result')}
                  </figcaption>
                  {latestReady ? (
                    <video
                      src={`/api/video/jobs/${latestReady.id}/file`}
                      controls
                      playsInline
                      preload="none"
                      className="w-full rounded-xl bg-black"
                    />
                  ) : (
                    <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl bg-[#F7F7FA] px-4 text-center text-[13px] text-[#8A8896]">
                      {/* The module's own mark — the second picture the owner
                        generated. The engine cards wear their vendor's logo,
                        so this one says « video » for the module itself. */}
                      <img
                        src="/engines/video.webp"
                        alt=""
                        aria-hidden
                        width={36}
                        height={36}
                        className="h-9 w-9 rounded-lg bg-white opacity-80"
                      />
                      {working ? t('video.statusRunning') : t('video.resultEmpty')}
                    </div>
                  )}
                </figure>
              </div>
            )}

            {/* The account's renders: one click fills the slot being picked. */}
            {recentRenders.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.14em] text-[#8A8896]">
                  {picking === 'end' ? t('video.endFrame') : t('video.recent')}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {recentRenders.map((r) => {
                    const on = picking === 'end' ? r.id === endId : r.id === sourceId;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        title={r.projectName}
                        onClick={() => {
                          if (picking === 'end') {
                            setEndId(r.id);
                            setPicking(null);
                          } else {
                            setSourceId(r.id);
                          }
                        }}
                        className={`h-[54px] w-[72px] flex-shrink-0 cursor-pointer overflow-hidden rounded-lg ${
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
              </div>
            )}
          </section>

          {/* ── The command bar, at the stage's width ───────────────────── */}
          <VideoBar
            state={state}
            onChange={(next) => setState((s) => ({ ...s, ...next }))}
            sourceThumbId={sourceId}
            endThumbId={endId}
            onPickSource={() => setPicking('source')}
            onPickEnd={() => setPicking('end')}
            onClearEnd={() => setEndId(null)}
            onSend={() => void send()}
            busy={busy}
          />

          {error && (
            <p className="rounded-xl bg-[#FFE4E7] px-4 py-3 text-[13px] text-[#C21F33]">
              {error === 'INSUFFICIENT_CREDITS' || error === 'NO_ACTIVE_TIER'
                ? t('video.errorCredits')
                : error === 'PRICE_NOT_VERIFIED'
                  ? t('video.priceUnknown')
                  : t('video.errorGeneric')}
            </p>
          )}

          {/* ── The clips ──────────────────────────────────────────────── */}
          {jobs.length > 0 && (
            <section className="rounded-2xl bg-white p-4 min-[640px]:p-5">
              <p className="mb-3 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.14em] text-[#8A8896]">
                {t('video.yourClips')}
              </p>
              <ul className="flex flex-col gap-2">
                {jobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F7F7FA] px-3 py-2.5"
                  >
                    <span className="flex items-center gap-2 text-[13px] text-[#17161F]">
                      <img
                        src={
                          VIDEO_MODELS[job.model as VideoModelKey]?.logo ?? '/engines/video.webp'
                        }
                        alt=""
                        aria-hidden
                        className="h-4 w-4 rounded bg-white"
                      />
                      {VIDEO_MODELS[job.model as VideoModelKey]?.label ?? job.model} ·{' '}
                      {job.duration}s · {job.resolution}
                    </span>
                    <span className="flex items-center gap-3">
                      {job.status === 'SUCCEEDED' && (
                        <a
                          href={`/api/video/jobs/${job.id}/file`}
                          className="text-[12.5px] font-semibold text-[#2948FC] hover:underline"
                        >
                          {t('video.open')}
                        </a>
                      )}
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
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <VideoSettings
          camera={state.camera}
          environment={state.environment}
          intensity={state.intensity}
          onChange={(next) => setState((s) => ({ ...s, ...next }))}
        />
      </div>
    </AppSurface>
  );
}
