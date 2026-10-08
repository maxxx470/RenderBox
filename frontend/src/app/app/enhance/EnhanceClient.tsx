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
// column, "À améliorer": seven improvements, each with a "+" that attaches one
// reference image the engine uses as a guide for that aspect only, then the
// intensity and the engine. Typing in the bar is enough, nothing ticked.
//
// "Relancer" reuses the photo already uploaded (same project, same source
// node) so a second try with other settings does not upload it twice or
// scatter a project per attempt.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Category, Folder, Download, Paper, Plus } from 'react-iconly';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { api } from '@/lib/api';
import { getCsrfTokenForUpload } from '@/lib/csrf-client';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_NAMES } from '@/lib/server/generation/engines/types';
import { ENGINE_COLORS, ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import {
  DEFAULT_ENHANCE_OPTIONS,
  ENHANCE_OPTIONS,
  ENHANCE_OPTION_KEYS,
  ENHANCE_STRENGTHS,
  ENHANCE_STRENGTH_HINTS,
  ENHANCE_STRENGTH_LABELS,
  type EnhanceOptionKey,
  type EnhanceStrength,
} from '@/lib/server/generation/enhance';
import type { RatioKey } from '@/lib/server/generation/ratios';
import { DEFAULT_RESOLUTION, type ResolutionKey } from '@/lib/server/generation/resolutions';
import { BeforeAfterSlider } from '@/app/BeforeAfterSlider';
import { AppFrame } from '../AppFrame';
import type { AppSurfaceProps } from '../AppSurface';
import { useObjectUrl } from '../CommandBar';
import { CARD_TRANSFORM, ExampleFanCard } from '../fan';
import { EXAMPLE_RENDERS } from '../generer-examples';
import { MOBILE_NAV_PAD } from '../MobileNav';
import { RequestError, readErrorCode, isServiceNotConfigured } from '../request-error';
import { EnhanceBar } from './EnhanceBar';

const GRADIENT = 'bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6]';
const HEADING =
  'font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[#8A8896]';
/** The two-way toggles of the column (intensity, engine). */
const SEGMENT = 'grid grid-cols-2 gap-1 rounded-xl bg-[#F7F7FA] p-1';
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

/** One improvement of the column: the tick, its name and hint, then "+". */
function OptionRow({
  optionKey,
  on,
  reference,
  disabled,
  onToggle,
  onAddReference,
  onRemoveReference,
}: {
  optionKey: EnhanceOptionKey;
  on: boolean;
  reference: File | null;
  disabled: boolean;
  onToggle: () => void;
  onAddReference: () => void;
  onRemoveReference: () => void;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const refUrl = useObjectUrl(reference);
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
      {refUrl ? (
        // The reference, as a thumbnail; its cross takes it off again.
        <div className="relative h-7 w-7 flex-shrink-0" title={t('enhance.refAttached')}>
          <img
            src={refUrl}
            alt={t('enhance.refAttached')}
            className="h-full w-full rounded-lg object-cover"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={onRemoveReference}
            aria-label={t('enhance.refRemove')}
            title={t('enhance.refRemove')}
            className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-[5px] border-[1.5px] border-white bg-[#17161F] text-white"
          >
            <svg
              viewBox="0 0 24 24"
              width="7"
              height="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.4"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={onAddReference}
          aria-label={`${t('enhance.refAdd')} — ${option.label[locale]}`}
          title={t('enhance.refAdd')}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white transition-colors hover:bg-[#E9E9EE] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus set="curved" size={15} primaryColor="#2948FC" />
        </button>
      )}
    </div>
  );
}

export function EnhanceClient({
  surface,
  initialSession = null,
  initialResultId = null,
}: {
  surface: AppSurfaceProps;
  /** An image already in a project (opened from its command bar). */
  initialSession?: Session | null;
  /** An Enhance project reopened: its latest result, compared with the photo. */
  initialResultId?: string | null;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const { user } = useAuth();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [session, setSession] = useState<Session | null>(initialSession);
  const [resultId, setResultId] = useState<string | null>(initialResultId);
  const [working, setWorking] = useState(false);

  const [options, setOptions] = useState<EnhanceOptionKey[]>(DEFAULT_ENHANCE_OPTIONS);
  // One reference image per ticked improvement (owner, 2026-10-08).
  const [refs, setRefs] = useState<Partial<Record<EnhanceOptionKey, File>>>({});
  const [strength, setStrength] = useState<EnhanceStrength>('subtle');
  const [engine, setEngine] = useState<EngineName>('nanobanana');
  const [instruction, setInstruction] = useState('');
  const [ratio, setRatio] = useState<RatioKey>('auto');
  const [resolution, setResolution] = useState<ResolutionKey>(DEFAULT_RESOLUTION);
  const [remaining, setRemaining] = useState(surface.quotaRemaining);
  const [panelOpen, setPanelOpen] = useState(false);
  const refInputRef = useRef<HTMLInputElement>(null);
  // Which improvement the reference picker was opened for.
  const refTarget = useRef<EnhanceOptionKey | null>(null);
  const preview = useObjectUrl(file);
  // Either a file attached here, or an image that already lives in a project.
  const hasSource = Boolean(file || session);
  // Opened from an image project: the result is filed into that project, so
  // the page offers the way back to it. An Enhance project (made here, or
  // reopened with its result) has no editor to go back to.
  const imageProjectId = initialSession && !initialResultId ? initialSession.projectId : null;

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

  function dropReference(key: EnhanceOptionKey) {
    setRefs((cur) => {
      const next = { ...cur };
      delete next[key];
      return next;
    });
  }

  function toggleOption(key: EnhanceOptionKey) {
    if (options.includes(key)) {
      setOptions((cur) => cur.filter((k) => k !== key));
      // A reference belongs to a ticked improvement: unticking drops it.
      dropReference(key);
    } else {
      setOptions((cur) => [...cur, key]);
    }
  }

  function addReference(key: EnhanceOptionKey) {
    refTarget.current = key;
    refInputRef.current?.click();
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
    form.append('file', source);
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
    setWorking(true);
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
      form.append('strength', strength);
      form.append('ratio', ratio);
      form.append('resolution', resolution);
      for (const key of options) form.append('options', key);
      if (instruction.trim()) form.append('instruction', instruction.trim());
      for (const key of options) {
        const ref = refs[key];
        if (ref) form.append(`ref_${key}`, ref);
      }
      const csrf = getCsrfTokenForUpload();
      const res = await fetch(`/api/projects/${current.projectId}/enhance`, {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers: csrf ? { 'x-csrf-token': csrf } : {},
      });
      if (!res.ok) throw new RequestError(await readErrorCode(res));
      const data = (await res.json()) as { nodeId: string; quotaRemaining: number | null };
      setResultId(data.nodeId);
      setRemaining(data.quotaRemaining);
    } catch (err) {
      const code = err instanceof RequestError ? err.code : '';
      if (code === 'NO_ACTIVE_TIER') toast(t('app.noActiveTierError'), 'error');
      else if (code === 'QUOTA_EXCEEDED') toast(t('app.quotaExceededError'), 'error');
      else if (code === 'CONTENT_FLAGGED') toast(t('enhance.refFlagged'), 'error');
      else if (isServiceNotConfigured(err)) toast(t('app.serviceNotConfigured'), 'error');
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
        quotaMax: surface.quotaMax,
        quotaRemaining: remaining,
        userEmail: surface.userEmail,
      }}
    >
      <input
        ref={refInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          const key = refTarget.current;
          if (picked && key) {
            setRefs((cur) => ({ ...cur, [key]: picked }));
            // Adding a reference ticks its improvement: one goes with the other.
            setOptions((cur) => (cur.includes(key) ? cur : [...cur, key]));
          }
          e.target.value = '';
        }}
      />

      <main className={`flex min-w-0 flex-1 flex-col overflow-hidden ${MOBILE_NAV_PAD}`}>
        <div className="flex items-center justify-end gap-2 px-5.5 pt-4 min-[900px]:hidden">
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="rounded-xl p-1.5"
            aria-label={t('enhance.optionsHeading')}
          >
            <Category set="curved" size={16} primaryColor="#8A8896" />
          </button>
        </div>

        {/* Same side padding as the bar below it, as on a project. */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-2.5 pt-4 min-[640px]:px-5 min-[640px]:pt-5">
          <div className="mb-4">
            <h2 className="mb-1 font-[family-name:var(--font-display)] text-base font-semibold text-[#17161F]">
              {t('enhance.title')}
            </h2>
            <p className="text-[13px] text-[#8A8896]">{t('enhance.subtitle')}</p>
          </div>

          {!surface.tier ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <div
                className={`flex h-[52px] w-[52px] items-center justify-center rounded-2xl ${GRADIENT}`}
              >
                <Folder set="curved" size={24} primaryColor="#ffffff" />
              </div>
              <h2 className="text-[15px] font-semibold text-[#17161F]">
                {t('app.genHomeNoTierTitle')}
              </h2>
              <p className="max-w-[320px] text-[13px] text-[#6B6878]">
                {t('app.genHomeNoTierBody')}
              </p>
              <Link
                href="/app/tarifs"
                className={`inline-flex items-center gap-2 rounded-xl ${GRADIENT} px-5 py-2.5 text-[13px] font-semibold text-white`}
              >
                {t('app.genHomeChooseTier')}
              </Link>
            </div>
          ) : !hasSource ? (
            // Nothing attached yet: the example renders, as on the Image page.
            // The render comes in through the bar's paperclip.
            <div className="flex flex-1 items-center justify-center overflow-hidden pb-5">
              {EXAMPLE_RENDERS.slice(0, CARD_TRANSFORM.length).map((example, i) => (
                <ExampleFanCard key={example.src} example={example} index={i} />
              ))}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 pb-2">
              {/* 16:10 like the slider, as large as the stage allows. */}
              <div className="flex aspect-[16/10] max-h-full min-h-0 w-full max-w-full items-center">
                {resultId && beforeSrc ? (
                  <div className="w-full">
                    <BeforeAfterSlider
                      before={<img src={beforeSrc} alt="" className="h-full w-full object-cover" />}
                      after={
                        <img
                          src={nodeImage(resultId)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      }
                      beforeLabel={t('enhance.before')}
                      afterLabel={t('enhance.after')}
                    />
                  </div>
                ) : (
                  <div className="relative h-full w-full overflow-hidden rounded-[22px] bg-[#F7F7FA]">
                    {beforeSrc && (
                      <img src={beforeSrc} alt="" className="h-full w-full object-contain" />
                    )}
                    {working && (
                      <div
                        role="status"
                        className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 px-6 text-center backdrop-blur-[2px]"
                      >
                        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#D5DCFF] border-t-[#2948FC]" />
                        <span className="text-[14px] font-semibold text-[#17161F]">
                          {t('enhance.working')}
                        </span>
                        <span className="max-w-[36ch] text-[12.5px] text-[#6B6878]">
                          {t('enhance.workingHint')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {resultId && (
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <a
                    href={nodeImage(resultId)}
                    download="renderbox-enhance.png"
                    className={`inline-flex items-center gap-2 rounded-xl ${GRADIENT} px-4 py-2 text-[13px] font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]`}
                  >
                    <Download set="curved" size={16} primaryColor="#ffffff" />
                    {t('enhance.download')}
                  </a>
                  {imageProjectId && session?.projectId === imageProjectId && (
                    <Link
                      href={`/app/${imageProjectId}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-[13px] font-semibold text-[#17161F] transition-colors hover:bg-[#F2F2F5]"
                    >
                      <Paper set="curved" size={16} primaryColor="#6B6878" />
                      {t('enhance.openProject')}
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {surface.tier && (
          <EnhanceBar
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
        )}
      </main>

      {surface.tier && (
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
            } fixed bottom-0 right-0 top-16 z-[35] w-[300px] flex-col overflow-y-auto bg-white px-4 py-4.5 ${MOBILE_NAV_PAD} min-[900px]:static min-[900px]:z-auto min-[900px]:my-3 min-[900px]:mr-3 min-[900px]:flex min-[900px]:flex-shrink-0 min-[900px]:rounded-[20px]`}
          >
            <h3 className={`${HEADING} mb-1`}>{t('enhance.optionsHeading')}</h3>
            <p className="mb-3 text-[11px] leading-relaxed text-[#8A8896]">
              {t('enhance.refNote')}
            </p>
            <div className="flex flex-col gap-1">
              {ENHANCE_OPTION_KEYS.map((key) => (
                <OptionRow
                  key={key}
                  optionKey={key}
                  on={options.includes(key)}
                  reference={refs[key] ?? null}
                  disabled={working}
                  onToggle={() => toggleOption(key)}
                  onAddReference={() => addReference(key)}
                  onRemoveReference={() => dropReference(key)}
                />
              ))}
            </div>

            <h3 className={`${HEADING} mb-1.5 mt-3.5`}>{t('enhance.strengthHeading')}</h3>
            <div className={SEGMENT}>
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
                  <span
                    aria-hidden
                    className={`h-2 w-2 rounded-full ${
                      engine === e ? 'bg-current opacity-80' : ENGINE_COLORS[e].dot
                    }`}
                  />
                  {ENGINE_LABELS[e].name[locale]}
                </button>
              ))}
            </div>

            <p className="mt-auto pt-3 text-center text-[11.5px] text-[#6B6878]">
              {t('enhance.costNote')}
              {remaining !== null && surface.quotaMax !== null
                ? ` · ${remaining}/${surface.quotaMax}`
                : ''}
            </p>
          </aside>
        </>
      )}
    </AppFrame>
  );
}
