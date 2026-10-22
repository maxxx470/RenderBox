'use client';

// The Enhance tool: one image in, the same image improved out.
//
// Behind the scenes it is a project like any other — the upload and the
// enhanced render are two nodes of a new "Enhance du …" project — so the
// result is kept, counted against the quota like any render, and listed in
// Mes images. What this page hides is the project ceremony: attach, tick,
// run, compare.
//
// 2026-10-08 (owner) — the image workspace's layout: on the left the stage
// with a simplified command bar under it (the user's own description, the
// paperclip, ratio and size — see EnhanceBar); on the right a full-height
// column, "À améliorer": seven improvements, then the intensity and the
// engine. Typing in the bar is enough, nothing ticked. Each improvement took a
// reference image until 2026-10-19 (its "+"): with no moderation key in
// production none could be checked, so the owner removed them — the route
// still accepts them.
//
// "Relancer" reuses the photo already uploaded (same project, same source
// node) so a second try with other settings does not upload it twice or
// scatter a project per attempt.
import { useEffect, useState } from 'react';
import { Category, Download } from 'react-iconly';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { api } from '@/lib/api';
import { getCsrfTokenForUpload } from '@/lib/csrf-client';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_NAMES } from '@/lib/server/generation/engines/types';
import { ENGINE_COLORS, ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import { EngineLogo } from '@/components/EngineLogo';
import { VersionSelect } from '../VersionSelect';
import {
  DARK_ROOM_HINT,
  DARK_ROOM_LABEL,
  DEFAULT_ENHANCE_OPTIONS,
  DEFAULT_ENHANCE_STRENGTH,
  ENHANCE_AMBIANCE_KEYS,
  ENHANCE_AMBIANCE_LABELS,
  ENHANCE_OPTIONS,
  ENHANCE_OPTION_KEYS,
  ENHANCE_STRENGTHS,
  ENHANCE_STRENGTH_HINTS,
  ENHANCE_STRENGTH_LABELS,
  type EnhanceAmbianceKey,
  type EnhanceOptionKey,
  type EnhanceStrength,
} from '@/lib/server/generation/enhance';
import type { RatioKey } from '@/lib/server/generation/ratios';
import {
  DEFAULT_RESOLUTION,
  RESOLUTIONS,
  type ResolutionKey,
} from '@/lib/server/generation/resolutions';
import { AppFrame } from '../AppFrame';
import { useAppChrome } from '../AppChrome';
import { useRenderPrice } from '../use-render-price';
import { ANALYSIS_COST } from '@/lib/provider-cost';
import type { AppSurfaceProps } from '../AppSurface';
import { useObjectUrl } from '../CommandBar';
import { CARD_TRANSFORM, ExampleFanCard, FanCarousel } from '../fan';
import { ENHANCE_EXAMPLES } from '../generer-examples';
import { MOBILE_NAV_PAD, PHONE_STICKY_BAR } from '../MobileNav';
import { RecentImages, recentImageLabel, useFreshRecent } from '../RecentImages';
import { creditsChanged, useSyncedCredits } from '../fresh-credits';
import { SourceResultStage } from '../SourceResultStage';
import type { RecentRenderCardData } from '../GenerationHome';
import {
  creditErrorKey,
  plansReasonFor,
  creditDetailOf,
  RequestError,
  readErrorCode,
  analysisErrorKey,
  isGenerationTimeout,
  isServiceNotConfigured,
  notConfiguredKey,
} from '../request-error';
import { EnhanceBar } from './EnhanceBar';
import { fitForUpload } from '../fit-upload';

const GRADIENT = 'bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6]';
const HEADING =
  'font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[#8A8896]';
/** The two-way toggle of the column (engine). */
const SEGMENT = 'grid grid-cols-2 gap-1 rounded-xl bg-[#F7F7FA] p-1';
/** The three intensities (2026-10-19, D6). */
const SEGMENT_3 = 'grid grid-cols-3 gap-1 rounded-xl bg-[#F7F7FA] p-1';
const SEGMENT_ITEM =
  'flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold transition-colors';

/** The uploaded photo, once it exists server-side. */
interface Session {
  projectId: string;
  sourceNodeId: string;
}

function nodeImage(id: string) {
  return `/api/render-nodes/${id}/image`;
}

/** One improvement of the column: the tick, its name and hint. */
function OptionRow({
  optionKey,
  on,
  disabled,
  onToggle,
}: {
  optionKey: EnhanceOptionKey;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { locale } = useLocale();
  const option = ENHANCE_OPTIONS[optionKey];

  return (
    <div
      className={`flex items-center gap-2 rounded-xl py-1 pl-2 pr-1.5 transition-colors ${
        on ? 'bg-[#EEF1FF]' : 'bg-[#F7F7FA] hover:bg-[#F2F2F5]'
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        disabled={disabled}
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-not-allowed"
      >
        <span
          aria-hidden
          className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-md ${
            on ? GRADIENT : 'bg-white'
          }`}
        >
          {on && (
            <svg
              viewBox="0 0 24 24"
              width="11"
              height="11"
              fill="none"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </span>
        <span className="min-w-0">
          <span
            className={`block text-[13px] font-semibold leading-tight ${
              on ? 'text-[#1E36D6]' : 'text-[#17161F]'
            }`}
          >
            {option.label[locale]}
          </span>
          <span className="block truncate text-[11px] leading-snug text-[#6B6878] [@media(max-height:700px)]:hidden">
            {option.hint[locale]}
          </span>
        </span>
      </button>
    </div>
  );
}

export function EnhanceClient({
  surface,
  initialSession = null,
  initialResultId = null,
  recentRenders = [],
}: {
  surface: AppSurfaceProps;
  /** The account's latest renders, at the top of the column (2026-10-19). */
  recentRenders?: RecentRenderCardData[];
  /** An image already in a project (opened from its command bar). */
  initialSession?: Session | null;
  /** An Enhance project reopened: its latest result, compared with the photo. */
  initialResultId?: string | null;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const { user } = useAuth();
  const { toast } = useToast();
  const chrome = useAppChrome();
  const priceOf = useRenderPrice();

  const [file, setFile] = useState<File | null>(null);
  const [session, setSession] = useState<Session | null>(initialSession);
  const [resultId, setResultId] = useState<string | null>(initialResultId);
  const [working, setWorking] = useState(false);
  const [recent, setRecent] = useState<RecentRenderCardData[]>(recentRenders);
  useFreshRecent(setRecent);
  // What made the result on the right (engine · size), for the line under it.
  const [resultMeta, setResultMeta] = useState<{
    engine: EngineName;
    resolution: ResolutionKey;
  } | null>(null);

  const [options, setOptions] = useState<EnhanceOptionKey[]>(DEFAULT_ENHANCE_OPTIONS);
  const [strength, setStrength] = useState<EnhanceStrength>(DEFAULT_ENHANCE_STRENGTH);
  // Lumière's sub-option and the profile « Ambiance » harmonises towards
  // (2026-10-19, D6) — sent only while their option is ticked.
  const [darkRoom, setDarkRoom] = useState(false);
  const [ambiance, setAmbiance] = useState<EnhanceAmbianceKey>('jour_ext');
  const [engine, setEngine] = useState<EngineName>('nanobanana');
  const [instruction, setInstruction] = useState('');
  const [ratio, setRatio] = useState<RatioKey>('auto');
  const [resolution, setResolution] = useState<ResolutionKey>(DEFAULT_RESOLUTION);
  const [remaining, setRemaining] = useState(surface.creditsBalance);
  useSyncedCredits(setRemaining);
  const [panelOpen, setPanelOpen] = useState(false);
  const preview = useObjectUrl(file);
  // Either a file attached here, or an image that already lives in a project.
  const hasSource = Boolean(file || session);

  useEffect(() => {
    if (user?.defaultEngine === 'nanobanana' || user?.defaultEngine === 'gpt_image') {
      setEngine(user.defaultEngine);
    }
  }, [user?.defaultEngine]);

  // Both engines honour every ratio and size (2026-10-08): the choice stays.
  function handleEngineChange(next: EngineName) {
    setEngine(next);
  }

  function pickFile(next: File | null) {
    if (!next || working) return;
    setFile(next);
    setSession(null);
    setResultId(null);
  }

  function toggleOption(key: EnhanceOptionKey) {
    if (options.includes(key)) {
      setOptions((cur) => cur.filter((k) => k !== key));
    } else {
      setOptions((cur) => [...cur, key]);
    }
  }

  async function uploadSource(source: File): Promise<Session> {
    const project = await api<{ id: string }>('/api/projects', {
      method: 'POST',
      body: {
        name: t('enhance.projectName', {
          date: new Date().toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
            day: 'numeric',
            month: 'short',
          }),
        }),
      },
    });
    const form = new FormData();
    form.append('file', await fitForUpload(source));
    const csrf = getCsrfTokenForUpload();
    const res = await fetch(`/api/projects/${project.id}/upload`, {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: csrf ? { 'x-csrf-token': csrf } : {},
    });
    if (!res.ok) {
      const code = await readErrorCode(res);
      // Created only to hold this image — see GenerationHome's quickStart.
      void api(`/api/projects/${project.id}`, { method: 'DELETE' }).catch(() => undefined);
      throw new RequestError(code);
    }
    const node = (await res.json()) as { id: string };
    return { projectId: project.id, sourceNodeId: node.id };
  }

  const canRun = hasSource && (options.length > 0 || instruction.trim().length > 0);

  async function run() {
    if (!canRun || working) return;
    // No plan, or not enough credits: the plans open over the page (owner,
    // 2026-10-15), before anything is uploaded.
    if (!surface.tier && !remaining) return chrome?.openPlans('noTier');
    if (remaining !== null && remaining < priceOf(engine, resolution, 1, ANALYSIS_COST))
      return chrome?.openPlans('noCredits', {
        cost: priceOf(engine, resolution, 1, ANALYSIS_COST),
        balance: remaining,
      });
    setWorking(true);
    setResultId(null);
    let current = session;
    const fresh = !current;
    try {
      if (!current) {
        if (!file) return;
        current = await uploadSource(file);
        setSession(current);
      }
      const form = new FormData();
      form.append('sourceNodeId', current.sourceNodeId);
      form.append('engine', engine);
      if (chrome?.versionsEnabled) form.append('version', chrome.versions[engine]);
      form.append('strength', strength);
      form.append('ratio', ratio);
      form.append('resolution', resolution);
      for (const key of options) form.append('options', key);
      if (options.includes('lighting') && darkRoom) form.append('darkRoom', '1');
      if (options.includes('ambiance')) form.append('ambiance', ambiance);
      if (instruction.trim()) form.append('instruction', instruction.trim());
      const csrf = getCsrfTokenForUpload();
      const res = await fetch(`/api/projects/${current.projectId}/enhance`, {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers: csrf ? { 'x-csrf-token': csrf } : {},
      });
      if (!res.ok) throw new RequestError(await readErrorCode(res));
      const data = (await res.json()) as { nodeId: string; creditsBalance: number | null };
      setResultId(data.nodeId);
      setResultMeta({ engine, resolution });
      setRemaining(data.creditsBalance);
      const made = current;
      setRecent((cur) =>
        [
          {
            id: data.nodeId,
            projectId: made.projectId,
            projectName: '',
            preset: null,
            engine,
            editType: 'enhance',
          },
          ...cur.filter((r) => r.id !== data.nodeId),
        ].slice(0, 15),
      );
    } catch (err) {
      // A failed enhancement gives its credits back: read the balance again.
      creditsChanged();
      const code = err instanceof RequestError ? err.code : '';
      const creditKey = creditErrorKey(err);
      const plansReason = plansReasonFor(err);
      if (plansReason && chrome) chrome.openPlans(plansReason, creditDetailOf(err));
      else if (creditKey)
        toast(t(creditKey), 'error', { label: t('app.creditsCta'), href: '/app/tarifs' });
      else if (code === 'CONTENT_FLAGGED') toast(t('enhance.refFlagged'), 'error');
      else if (analysisErrorKey(err)) toast(t(analysisErrorKey(err)!), 'error');
      else if (isServiceNotConfigured(err)) toast(t(notConfiguredKey(err)), 'error');
      else if (isGenerationTimeout(err)) toast(t('app.generationTimeout'), 'error');
      else toast(t('enhance.error'), 'error');
      // A project that never produced anything would sit empty in Mes images
      // after every failed first try.
      if (fresh && current && !resultId) {
        void api(`/api/projects/${current.projectId}`, { method: 'DELETE' }).catch(() => undefined);
        setSession(null);
      }
    } finally {
      setWorking(false);
    }
  }

  const beforeSrc = session ? nodeImage(session.sourceNodeId) : preview;
  const resultInfo =
    resultId && resultMeta
      ? `${ENGINE_LABELS[resultMeta.engine].name[locale]} · ${RESOLUTIONS[resultMeta.resolution].label}`
      : '';
  const sendHint = !hasSource
    ? t('enhance.needImage')
    : options.length === 0 && !instruction.trim()
      ? t('enhance.pickOne')
      : undefined;

  return (
    <AppFrame
      current="enhance"
      topbar={{
        title: t('enhance.title'),
        tier: surface.tier,
        creditsMax: surface.creditsMax,
        creditsBalance: remaining,
        userEmail: surface.userEmail,
      }}
    >
      {/* Below 900px the page scrolls (owner, 2026-10-22: « le format
          téléphone ne fonctionne pas »): the stage takes its natural height
          and the bar stays pinned above the bottom menu. */}
      <main
        className={`flex min-w-0 flex-1 flex-col overflow-hidden max-[899px]:overflow-y-auto ${MOBILE_NAV_PAD}`}
      >
        {/* On a phone: one short line, then the « À améliorer » column's
            button, named — a bare grey icon was easy to miss (2026-10-15). */}
        <div className="flex items-center justify-between gap-3 px-3.5 pt-3 min-[900px]:hidden">
          <p className="min-w-0 text-[12.5px] leading-snug text-[#8A8896]">
            {t('enhance.subtitleShort')}
          </p>
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-[#EEF1FF] px-2.5 py-1.5 text-[12px] font-semibold text-[#1E36D6]"
          >
            <Category set="curved" size={14} primaryColor="#2948FC" />
            {t('enhance.optionsHeading')}
          </button>
        </div>

        {/* Same side padding as the bar below it, as on a project. */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-2.5 pt-4 max-[899px]:flex-none max-[899px]:overflow-visible min-[640px]:px-5 min-[640px]:pt-5">
          <div className="mb-4 max-[899px]:hidden">
            <h2 className="mb-1 font-[family-name:var(--font-display)] text-base font-semibold text-[#17161F]">
              {t('enhance.title')}
            </h2>
            <p className="text-[13px] text-[#8A8896]">{t('enhance.subtitle')}</p>
          </div>

          {/* Without a plan the page is the same (owner, 2026-10-15);
              launching opens the plans (run). */}
          {!hasSource ? (
            // Nothing attached yet: four blurry/sharp examples, each one picture
            // split in two with both resolutions on it (owner, 2026-10-13).
            // The render comes in through the bar's paperclip.
            <FanCarousel
              items={ENHANCE_EXAMPLES.slice(0, CARD_TRANSFORM.length).map((example, i) => ({
                key: example.src,
                node: <ExampleFanCard example={example} index={i} />,
              }))}
            />
          ) : (
            // The image pinned on the left, the enhanced one on the right,
            // then « Comparer » (owner, 2026-10-19, as on the generator).
            beforeSrc && (
              <SourceResultStage
                sourceSrc={beforeSrc}
                resultSrc={resultId ? nodeImage(resultId) : null}
                working={working}
                workingText={t('enhance.working')}
                emptyText={t('enhance.resultEmpty')}
                info={resultInfo}
                actions={
                  resultId && (
                    <>
                      {session && (
                        <button
                          type="button"
                          onClick={() => {
                            setFile(null);
                            setSession({ projectId: session.projectId, sourceNodeId: resultId });
                            setResultId(null);
                          }}
                          disabled={working}
                          className={`rounded-lg ${GRADIENT} px-3 py-1.5 text-[12px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-50`}
                        >
                          {t('app.genUseAsSource')}
                        </button>
                      )}
                      <a
                        href={nodeImage(resultId)}
                        download="renderpro-enhance.png"
                        title={t('enhance.download')}
                        aria-label={t('enhance.download')}
                        className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[#F2F2F5] hover:bg-[#E9E9EE]"
                      >
                        <Download set="curved" size={15} primaryColor="#3D3B49" />
                      </a>
                    </>
                  )
                }
              />
            )
          )}
        </section>

        <div className={PHONE_STICKY_BAR}>
          <EnhanceBar
            engine={engine}
            instruction={instruction}
            onInstructionChange={setInstruction}
            onAttach={pickFile}
            pinned={
              beforeSrc
                ? {
                    key: 'source',
                    src: beforeSrc,
                    caption: t('app.cmdSourceTag'),
                    onRemove: working
                      ? undefined
                      : () => {
                          setFile(null);
                          setSession(null);
                          setResultId(null);
                        },
                  }
                : null
            }
            ratio={ratio}
            onRatioChange={setRatio}
            resolution={resolution}
            onResolutionChange={setResolution}
            onSubmit={() => void run()}
            sendDisabled={!canRun}
            sendHint={sendHint}
            working={working}
          />
        </div>
      </main>

      {
        <>
          {panelOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/30 min-[900px]:hidden"
              onClick={() => setPanelOpen(false)}
              aria-hidden
            />
          )}
          {/* "À améliorer" — the full-height right column, as the materials
              sheet and the tree on a project (owner, 2026-10-08). */}
          <aside
            className={`${
              panelOpen ? 'flex' : 'hidden'
            } fixed bottom-0 right-0 top-16 z-[35] w-[300px] flex-col overflow-y-auto bg-white px-4 py-4.5 ${MOBILE_NAV_PAD} min-[900px]:static min-[900px]:z-auto min-[900px]:flex min-[900px]:flex-shrink-0 min-[900px]:border-l min-[900px]:border-[#ECECF2]`}
          >
            {/* « Images récentes » (owner, 2026-10-19: « ajoute ça à
                Améliorer »): a click makes one the image to enhance. */}
            <h3 className={`${HEADING} mb-2.5`}>{t('app.recentTitle')}</h3>
            <div className="mb-4">
              <RecentImages
                images={recent}
                selectedId={session && !file ? session.sourceNodeId : null}
                disabled={working}
                columns={4}
                onPick={(r) => {
                  setFile(null);
                  setSession({ projectId: r.projectId, sourceNodeId: r.id });
                  setResultId(null);
                  setPanelOpen(false);
                }}
                labelFor={(r) => recentImageLabel(r, locale)}
              />
            </div>
            <h3 className={`${HEADING} mb-3`}>{t('enhance.optionsHeading')}</h3>
            <div className="flex flex-col gap-1">
              {ENHANCE_OPTION_KEYS.map((key) => (
                <div key={key} className="flex flex-col gap-1">
                  <OptionRow
                    optionKey={key}
                    on={options.includes(key)}
                    disabled={working}
                    onToggle={() => toggleOption(key)}
                  />
                  {key === 'lighting' && options.includes('lighting') && (
                    <label className="ml-7 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-[12px] text-[#3D3B49] hover:bg-[#F7F7FA]">
                      <input
                        type="checkbox"
                        checked={darkRoom}
                        disabled={working}
                        onChange={(e) => setDarkRoom(e.target.checked)}
                        className="h-3.5 w-3.5 accent-[#2948FC]"
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold leading-tight">
                          {DARK_ROOM_LABEL[locale]}
                        </span>
                        <span className="block truncate text-[11px] text-[#6B6878]">
                          {DARK_ROOM_HINT[locale]}
                        </span>
                      </span>
                    </label>
                  )}
                  {key === 'ambiance' && options.includes('ambiance') && (
                    <div
                      role="radiogroup"
                      aria-label={t('enhance.ambianceProfile')}
                      className="ml-7 grid grid-cols-2 gap-1"
                    >
                      {ENHANCE_AMBIANCE_KEYS.map((k) => (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={ambiance === k}
                          disabled={working}
                          onClick={() => setAmbiance(k)}
                          className={`rounded-lg px-2 py-1 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed ${
                            ambiance === k
                              ? 'bg-[#EEF1FF] text-[#1E36D6]'
                              : 'bg-[#F7F7FA] text-[#3D3B49] hover:bg-[#F2F2F5]'
                          }`}
                        >
                          {ENHANCE_AMBIANCE_LABELS[k][locale]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <h3 className={`${HEADING} mb-1.5 mt-3.5`}>{t('enhance.strengthHeading')}</h3>
            <div className={SEGMENT_3}>
              {ENHANCE_STRENGTHS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={strength === s}
                  disabled={working}
                  onClick={() => setStrength(s)}
                  className={`${SEGMENT_ITEM} flex-col gap-0.5 text-center ${
                    strength === s
                      ? 'bg-white text-[#17161F] shadow-[0_1px_3px_rgba(23,22,31,0.12)]'
                      : 'text-[#6B6878]'
                  }`}
                >
                  <span>{ENHANCE_STRENGTH_LABELS[s][locale]}</span>
                  <span className="text-[10.5px] font-medium leading-tight text-[#8A8896] [@media(max-height:700px)]:hidden">
                    {ENHANCE_STRENGTH_HINTS[s][locale]}
                  </span>
                </button>
              ))}
            </div>

            <h3 className={`${HEADING} mb-1.5 mt-3.5`}>{t('enhance.engineHeading')}</h3>
            <div className={SEGMENT}>
              {ENGINE_NAMES.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={engine === e}
                  disabled={working}
                  title={ENGINE_LABELS[e].description[locale]}
                  onClick={() => handleEngineChange(e)}
                  className={`${SEGMENT_ITEM} ${
                    engine === e
                      ? `${ENGINE_COLORS[e].chip} shadow-[0_4px_10px_-6px_rgba(23,22,31,0.45)]`
                      : 'text-[#3D3B49] hover:bg-white'
                  }`}
                >
                  <EngineLogo engine={e} size={16} />
                  {ENGINE_LABELS[e].name[locale]}
                </button>
              ))}
            </div>
            {chrome?.versionsEnabled && (
              <div className="mt-2">
                <VersionSelect
                  engine={engine}
                  version={chrome.versions[engine]}
                  onChange={(v) => chrome.setVersion(engine, v)}
                  disabled={working}
                />
              </div>
            )}

            <p className="mt-auto pt-3 text-center text-[11.5px] text-[#6B6878]">
              {t('enhance.costNote', { cost: priceOf(engine, resolution, 1, ANALYSIS_COST) })}
              {remaining !== null && surface.creditsMax !== null
                ? ` · ${remaining}/${surface.creditsMax}`
                : ''}
            </p>
          </aside>
        </>
      }
    </AppFrame>
  );
}
