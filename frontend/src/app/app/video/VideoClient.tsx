'use client';

// The video workspace (2026-11-07, rebuilt a second time the same day after
// the owner saw it on screen: « L'élément à droite, la bande verticale
// droite, doit être fixe, bien collée à droite … La commande bar doit être
// bien en bas. Prends comme référence les anciennes pages de génération
// d'images et d'amélioration »).
//
// So it is no longer an AppSurface page — AppSurface is the frame for
// Paramètres, Info and Exemples: a centred 1100px column that scrolls, which
// is why the settings looked like a floating card and the bar sat wherever
// the content happened to end. This page now has the WORKSPACE skeleton, the
// one Améliorer and the image generator use:
//
//   <main>  the stage, scrolling, with the command bar pinned at its bottom
//   <aside> 300px flush against the right edge, full height under the
//           header, square, a hairline on its left — a drawer below 900px.
//
// Image to video only. The source is one of the account's own renders, or an
// image attached with the « + », which is uploaded first and becomes one.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppFrame } from '../AppFrame';
import type { AppSurfaceProps } from '../AppSurface';
import { MOBILE_NAV_PAD, PHONE_STICKY_BAR } from '../MobileNav';
import type { RecentRenderCardData } from '../GenerationHome';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { api, ApiError } from '@/lib/api';
import { getCsrfTokenForUpload } from '@/lib/csrf-client';
import { fitForUpload } from '../fit-upload';
import { readErrorCode } from '../request-error';
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

const CAPTION =
  'mb-2 block font-[family-name:var(--font-mono)] text-[11px] font-medium uppercase tracking-[0.14em] text-[#8A8896]';

export function VideoClient({
  surface,
  recentRenders,
}: {
  surface: AppSurfaceProps;
  recentRenders: RecentRenderCardData[];
}) {
  const { t, locale } = useLocale();

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
  // NOTHING is pinned on arrival (owner: « C'est l'utilisateur lui-même qui
  // décide de mettre une image ou pas »). Pre-selecting the latest render
  // also made the send button look ready to spend credits on an image
  // nobody had chosen.
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [endId, setEndId] = useState<string | null>(null);
  /** The settings column, a drawer below 900px. */
  const [panelOpen, setPanelOpen] = useState(false);
  const [recent, setRecent] = useState(recentRenders);
  const [jobs, setJobs] = useState<VideoJobRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
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

  /**
   * An image from the computer (owner: « en cliquant sur le +, il doit aussi
   * pouvoir ajouter des images extérieures au site »). The video route only
   * accepts a node this account owns, so the file goes up through the SAME
   * route a source photo takes — magic bytes checked server-side — and the
   * node it creates becomes the source like any other.
   */
  async function attach(file: File, slot: 'source' | 'end') {
    if (uploading || busy) return;
    setUploading(true);
    setError(null);
    try {
      const project = await api<{ id: string }>('/api/projects', {
        method: 'POST',
        body: {
          name: t('video.projectName', {
            date: new Date().toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
              day: 'numeric',
              month: 'short',
            }),
          }),
        },
      });
      const form = new FormData();
      form.append('file', await fitForUpload(file));
      const csrf = getCsrfTokenForUpload();
      const res = await fetch(`/api/projects/${project.id}/upload`, {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers: csrf ? { 'x-csrf-token': csrf } : {},
      });
      if (!res.ok) {
        // Created only to hold this image; it has nothing else in it.
        void api(`/api/projects/${project.id}`, { method: 'DELETE' }).catch(() => undefined);
        setError(await readErrorCode(res));
        return;
      }
      const node = (await res.json()) as { id: string };
      if (slot === 'end') setEndId(node.id);
      else setSourceId(node.id);
      // It is one of the account's images now, so it joins the strip.
      setRecent((list) => [
        {
          id: node.id,
          projectId: project.id,
          projectName: '',
          preset: null,
          engine: null,
          editType: null,
        },
        ...list,
      ]);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.code : 'UPLOAD_FAILED');
    } finally {
      setUploading(false);
    }
  }

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
    <AppFrame
      current="video"
      topbar={{
        title: t('video.title'),
        tier: surface.tier,
        creditsMax: surface.creditsMax,
        creditsBalance: surface.creditsBalance,
        userEmail: surface.userEmail,
      }}
    >
      {/* Below 900px the page scrolls and the bar stays pinned above the
          bottom menu — the arrangement Améliorer has used since the owner
          found the phone layout broken (2026-10-22). */}
      <main
        className={`flex min-w-0 flex-1 flex-col overflow-hidden max-[899px]:overflow-y-auto ${MOBILE_NAV_PAD}`}
      >
        <div className="flex items-center justify-between gap-3 px-3.5 pt-3 min-[900px]:hidden">
          <p className="min-w-0 text-[12.5px] leading-snug text-[#8A8896]">{t('video.subtitle')}</p>
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="inline-flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#EEF1FF] px-2.5 py-1.5 text-[12px] font-semibold text-[#1E36D6]"
          >
            {t('video.settings')}
          </button>
        </div>

        <section className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4 min-[900px]:px-5">
          {recent.length === 0 && !sourceId ? (
            <p className="py-16 text-center text-[13.5px] text-[#6B6878]">{t('video.noRender')}</p>
          ) : (
            <div className="grid gap-4 min-[860px]:grid-cols-2">
              <figure className="m-0">
                <figcaption className={CAPTION}>{t('video.source')}</figcaption>
                {sourceId ? (
                  <img
                    src={`/api/render-nodes/${sourceId}/image`}
                    alt=""
                    className="w-full rounded-xl bg-white object-contain"
                  />
                ) : (
                  <div className="flex h-44 items-center justify-center rounded-xl bg-white px-4 text-center text-[13px] text-[#8A8896]">
                    {t('video.pickSource')}
                  </div>
                )}
              </figure>
              <figure className="m-0">
                <figcaption className={CAPTION}>{t('video.result')}</figcaption>
                {latestReady ? (
                  <video
                    src={`/api/video/jobs/${latestReady.id}/file`}
                    controls
                    playsInline
                    preload="none"
                    className="w-full rounded-xl bg-black"
                  />
                ) : (
                  <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-xl bg-white px-4 text-center text-[13px] text-[#8A8896]">
                    {/* The module's own mark — the engine cards wear their
                        vendor's logo, so this one speaks for the module. */}
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

          {error && (
            <p className="mt-4 rounded-xl bg-[#FFE4E7] px-4 py-3 text-[13px] text-[#C21F33]">
              {error === 'INSUFFICIENT_CREDITS' || error === 'NO_ACTIVE_TIER'
                ? t('video.errorCredits')
                : error === 'PRICE_NOT_VERIFIED'
                  ? t('video.priceUnknown')
                  : t('video.errorGeneric')}
            </p>
          )}

          {jobs.length > 0 && (
            <div className="mt-5">
              <p className={CAPTION}>{t('video.yourClips')}</p>
              <ul className="flex flex-col gap-2">
                {jobs.map((job) => (
                  <li
                    key={job.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5"
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
            </div>
          )}
        </section>

        {/* The command bar, at the bottom of the page area. */}
        <div className={PHONE_STICKY_BAR}>
          <VideoBar
            state={state}
            onChange={(next) => setState((s) => ({ ...s, ...next }))}
            sourceThumbId={sourceId}
            endThumbId={endId}
            onAttach={(file, slot) => void attach(file, slot)}
            onClearSource={() => {
              setSourceId(null);
              setEndId(null);
            }}
            onClearEnd={() => setEndId(null)}
            onSend={() => void send()}
            busy={busy || uploading}
          />
        </div>
      </main>

      <>
        {panelOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/30 min-[900px]:hidden"
            onClick={() => setPanelOpen(false)}
            aria-hidden
          />
        )}
        {/* The shot settings — the full-height right column, flush against
            the edge, as the materials sheet and the tree are on a project. */}
        <aside
          className={`${
            panelOpen ? 'flex' : 'hidden'
          } fixed bottom-0 right-0 top-16 z-[35] w-[300px] flex-col overflow-y-auto bg-white px-4 py-4.5 ${MOBILE_NAV_PAD} min-[900px]:static min-[900px]:z-auto min-[900px]:flex min-[900px]:flex-shrink-0 min-[900px]:border-l min-[900px]:border-[#ECECF2]`}
        >
          <VideoSettings
            camera={state.camera}
            environment={state.environment}
            intensity={state.intensity}
            onChange={(next) => setState((s) => ({ ...s, ...next }))}
            recent={recent}
            sourceId={sourceId}
            onPickRecent={(id) => {
              setSourceId(id);
              setPanelOpen(false);
            }}
          />
        </aside>
      </>
    </AppFrame>
  );
}
