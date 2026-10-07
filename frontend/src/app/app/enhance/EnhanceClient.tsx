'use client';

// The Enhance tool: one image in, the same image improved out.
//
// Behind the scenes it is a project like any other — the upload and the
// enhanced render are two nodes of a new "Enhance du …" project — so the
// result is kept, counted against the quota like any render, and can be
// opened in the workspace to retouch further. What this page hides is the
// project ceremony: drop, tick, run, compare.
//
// "Relancer" reuses the photo already uploaded (same project, same source
// node) so a second try with other settings does not upload it twice or
// scatter a project per attempt.
import { useEffect, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { Folder, Upload, Download, Paper } from 'react-iconly';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { api, ApiError } from '@/lib/api';
import { getCsrfTokenForUpload } from '@/lib/csrf-client';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_NAMES } from '@/lib/server/generation/engines/types';
import { ENGINE_COLORS, ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import {
  DEFAULT_ENHANCE_OPTIONS,
  ENHANCE_OPTIONS,
  ENHANCE_OPTION_KEYS,
  ENHANCE_STRENGTHS,
  ENHANCE_STRENGTH_LABELS,
  type EnhanceOptionKey,
  type EnhanceStrength,
} from '@/lib/server/generation/enhance';
import { AppSurface, type AppSurfaceProps } from '../AppSurface';
import { ACCEPTED_UPLOAD_TYPES } from '../Dropzone';
import { RequestError, readErrorCode, isServiceNotConfigured } from '../request-error';
import { BeforeAfterSlider } from '@/app/BeforeAfterSlider';

const GRADIENT = 'bg-gradient-to-br from-[#16A34A] via-[#15803D] to-[#166534]';
const HEADING = 'mb-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#6B6878]';

/** The uploaded photo, once it exists server-side. */
interface Session {
  projectId: string;
  sourceNodeId: string;
}

function nodeImage(id: string) {
  return `/api/render-nodes/${id}/image`;
}

export function EnhanceClient({
  surface,
  initialSession = null,
}: {
  surface: AppSurfaceProps;
  /** An image already in a project (opened from its command bar). */
  initialSession?: Session | null;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const { user } = useAuth();
  const { toast } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(initialSession);
  const [resultId, setResultId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [options, setOptions] = useState<EnhanceOptionKey[]>(DEFAULT_ENHANCE_OPTIONS);
  const [strength, setStrength] = useState<EnhanceStrength>('subtle');
  const [engine, setEngine] = useState<EngineName>('nanobanana');
  const [instruction, setInstruction] = useState('');
  const [remaining, setRemaining] = useState(surface.quotaRemaining);
  const inputRef = useRef<HTMLInputElement>(null);
  // Either a file picked here, or an image that already lives in a project.
  const hasSource = Boolean(file || session);

  useEffect(() => {
    if (user?.defaultEngine === 'nanobanana' || user?.defaultEngine === 'gpt_image') {
      setEngine(user.defaultEngine);
    }
  }, [user?.defaultEngine]);

  // The local preview is an object URL; release it when it is replaced.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickFile(next: File | null) {
    if (!next || working) return;
    setFile(next);
    setSession(null);
    setResultId(null);
  }

  function reset() {
    setFile(null);
    setSession(null);
    setResultId(null);
    setInstruction('');
  }

  function toggleOption(key: EnhanceOptionKey) {
    setOptions((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }

  function handleDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0] ?? null);
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

  async function run() {
    if (!hasSource || working) return;
    if (options.length === 0) {
      toast(t('enhance.pickOne'), 'error');
      return;
    }
    setWorking(true);
    let current = session;
    const fresh = !current;
    try {
      if (!current) {
        if (!file) return;
        current = await uploadSource(file);
        setSession(current);
      }
      const res = await api<{ nodeId: string; quotaRemaining: number | null }>(
        `/api/projects/${current.projectId}/enhance`,
        {
          method: 'POST',
          body: {
            sourceNodeId: current.sourceNodeId,
            engine,
            options,
            strength,
            ...(instruction.trim() ? { instruction: instruction.trim() } : {}),
          },
        },
      );
      setResultId(res.nodeId);
      setRemaining(res.quotaRemaining);
    } catch (err) {
      const code = err instanceof ApiError || err instanceof RequestError ? err.code : '';
      if (code === 'NO_ACTIVE_TIER') toast(t('app.noActiveTierError'), 'error');
      else if (code === 'QUOTA_EXCEEDED') toast(t('app.quotaExceededError'), 'error');
      else if (isServiceNotConfigured(err)) toast(t('app.serviceNotConfigured'), 'error');
      else toast(t('enhance.error'), 'error');
      // A project that never produced anything would sit empty on the
      // dashboard after every failed first try.
      if (fresh && current && !resultId) {
        void api(`/api/projects/${current.projectId}`, { method: 'DELETE' }).catch(() => undefined);
        setSession(null);
      }
    } finally {
      setWorking(false);
    }
  }

  const beforeSrc = session ? nodeImage(session.sourceNodeId) : preview;

  return (
    <AppSurface
      {...surface}
      quotaRemaining={remaining}
      eyebrow={t('page.enhanceEyebrow')}
      title={t('enhance.title')}
      subtitle={t('enhance.subtitle')}
    >
      {!surface.tier ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-[22px] border border-[#ECECF2] bg-[#F7F7FA] px-6 py-16 text-center">
          <div
            className={`flex h-[52px] w-[52px] items-center justify-center rounded-full ${GRADIENT}`}
          >
            <Folder set="light" size={24} primaryColor="#ffffff" />
          </div>
          <h2 className="text-[15px] font-semibold text-[#17161F]">
            {t('app.genHomeNoTierTitle')}
          </h2>
          <p className="max-w-[320px] text-[13px] text-[#6B6878]">{t('app.genHomeNoTierBody')}</p>
          <Link
            href="/app/tarifs"
            className={`inline-flex items-center gap-2 rounded-full ${GRADIENT} px-5 py-2.5 text-[13px] font-semibold text-white`}
          >
            {t('app.genHomeChooseTier')}
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 min-[1000px]:grid-cols-[minmax(0,1fr)_340px]">
          {/* The stage: drop zone, then the image, then the comparison. */}
          <section className="min-w-0">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_UPLOAD_TYPES.join(',')}
              className="hidden"
              onChange={(e) => {
                pickFile(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />

            {!hasSource ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`flex aspect-[16/10] w-full flex-col items-center justify-center gap-3.5 rounded-[22px] border-2 border-dashed px-6 text-center transition-colors ${
                  dragOver
                    ? 'border-[#16A34A] bg-[#E8F5EC]'
                    : 'border-[#DEDEE8] bg-[#FBFBFD] hover:border-[#16A34A]'
                }`}
              >
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-full ${GRADIENT}`}
                >
                  <Upload set="light" size={24} primaryColor="#ffffff" />
                </span>
                <span className="text-[16px] font-semibold text-[#17161F]">
                  {t('enhance.dropTitle')}
                </span>
                <span className="text-[13px] text-[#6B6878]">{t('enhance.dropHint')}</span>
              </button>
            ) : resultId && beforeSrc ? (
              <BeforeAfterSlider
                before={<img src={beforeSrc} alt="" className="h-full w-full object-cover" />}
                after={
                  <img src={nodeImage(resultId)} alt="" className="h-full w-full object-cover" />
                }
                beforeLabel={t('enhance.before')}
                afterLabel={t('enhance.after')}
              />
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="relative aspect-[16/10] w-full overflow-hidden rounded-[22px] border border-[#ECECF2] bg-[#F7F7FA]"
              >
                {beforeSrc && (
                  <img src={beforeSrc} alt="" className="h-full w-full object-contain" />
                )}
                {working && (
                  <div
                    role="status"
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 px-6 text-center backdrop-blur-[2px]"
                  >
                    <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#CDEBD6] border-t-[#15803D]" />
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

            {hasSource && (
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                {resultId && (
                  <>
                    <a
                      href={nodeImage(resultId)}
                      download="renderbox-enhance.png"
                      className={`inline-flex items-center gap-2 rounded-full ${GRADIENT} px-4.5 py-2.5 text-[13px] font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]`}
                    >
                      <Download set="light" size={16} primaryColor="#ffffff" />
                      {t('enhance.download')}
                    </a>
                    {session && (
                      <Link
                        href={`/app/${session.projectId}`}
                        className="inline-flex items-center gap-2 rounded-full border border-[#ECECF2] bg-white px-4.5 py-2.5 text-[13px] font-semibold text-[#17161F] transition-colors hover:border-[#DEDEE8]"
                      >
                        <Paper set="light" size={16} primaryColor="#6B6878" />
                        {t('enhance.openProject')}
                      </Link>
                    )}
                  </>
                )}
                <button
                  type="button"
                  disabled={working}
                  onClick={resultId ? reset : () => inputRef.current?.click()}
                  className="inline-flex items-center rounded-full border border-[#ECECF2] bg-white px-4.5 py-2.5 text-[13px] font-semibold text-[#3D3B49] transition-colors hover:border-[#DEDEE8] disabled:opacity-50"
                >
                  {resultId ? t('enhance.again') : t('enhance.change')}
                </button>
              </div>
            )}
          </section>

          {/* Settings. */}
          <aside className="h-fit rounded-[22px] border border-[#ECECF2] bg-white p-5">
            <h2 className={HEADING}>{t('enhance.optionsHeading')}</h2>
            <div className="flex flex-col gap-1.5">
              {ENHANCE_OPTION_KEYS.map((key) => {
                const on = options.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleOption(key)}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                      on
                        ? 'border-[#16A34A] bg-[#E8F5EC]'
                        : 'border-[#ECECF2] bg-white hover:border-[#DEDEE8]'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                        on ? GRADIENT : 'border border-[#DEDEE8] bg-white'
                      }`}
                    >
                      {on && (
                        <svg
                          viewBox="0 0 24 24"
                          width="12"
                          height="12"
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
                        className={`block text-[13.5px] font-semibold ${on ? 'text-[#166534]' : 'text-[#17161F]'}`}
                      >
                        {ENHANCE_OPTIONS[key].label[locale]}
                      </span>
                      <span className="block text-[12px] text-[#6B6878]">
                        {ENHANCE_OPTIONS[key].hint[locale]}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <h2 className={`${HEADING} mt-5`}>{t('enhance.strengthHeading')}</h2>
            <div className="grid grid-cols-2 gap-1 rounded-full border border-[#ECECF2] bg-[#F7F7FA] p-1">
              {ENHANCE_STRENGTHS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={strength === s}
                  onClick={() => setStrength(s)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold transition-colors ${
                    strength === s
                      ? 'bg-white text-[#17161F] shadow-[0_1px_3px_rgba(23,22,31,0.12)]'
                      : 'text-[#6B6878]'
                  }`}
                >
                  {ENHANCE_STRENGTH_LABELS[s][locale]}
                </button>
              ))}
            </div>

            <h2 className={`${HEADING} mt-5`}>{t('enhance.engineHeading')}</h2>
            <div className="grid grid-cols-2 gap-1 rounded-full border border-[#ECECF2] bg-[#F7F7FA] p-1">
              {ENGINE_NAMES.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={engine === e}
                  title={ENGINE_LABELS[e].description[locale]}
                  onClick={() => setEngine(e)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold transition-colors ${
                    engine === e
                      ? 'bg-white text-[#17161F] shadow-[0_1px_3px_rgba(23,22,31,0.12)]'
                      : 'text-[#6B6878]'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${ENGINE_COLORS[e].dot}`} aria-hidden />
                  {ENGINE_LABELS[e].name[locale]}
                </button>
              ))}
            </div>

            <label htmlFor="enhance-instruction" className={`${HEADING} mt-5 block`}>
              {t('enhance.instructionLabel')}
            </label>
            <textarea
              id="enhance-instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder={t('enhance.instructionPlaceholder')}
              className="w-full resize-none rounded-2xl border border-[#ECECF2] bg-[#FBFBFD] px-3.5 py-2.5 text-[13px] text-[#17161F] outline-none placeholder:text-[#8A8896] focus:border-[#15803D]"
            />

            <button
              type="button"
              onClick={() => void run()}
              disabled={!hasSource || working || options.length === 0}
              className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full ${GRADIENT} px-5 py-3 text-[14px] font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {working ? t('enhance.working') : resultId ? t('enhance.retry') : t('enhance.submit')}
            </button>
            <p className="mt-2.5 text-center text-[12px] text-[#6B6878]">
              {t('enhance.costNote')}
              {remaining !== null && surface.quotaMax !== null
                ? ` · ${remaining}/${surface.quotaMax}`
                : ''}
            </p>
          </aside>
        </div>
      )}
    </AppSurface>
  );
}
