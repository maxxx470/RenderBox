'use client';

// /app home — "Espace de génération". Distinct from the /app/projets grid:
// this screen is a quick-start surface (engine pick + recent renders + a
// drop-a-photo command bar) that always creates a *new* project. Opening an
// existing one still goes through /app/projets or by clicking a card here.
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Folder, Send, TickSquare, CloseSquare, Upload, Image as ImageIcon } from 'react-iconly';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { LanguageInlineSwitch } from '@/components/LanguageToggle';
import { api } from '@/lib/api';
import { getCsrfTokenForUpload } from '@/lib/csrf-client';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import { PRESETS, type PresetKey } from '@/lib/server/generation/presets';
import type { PricingTierId } from '@/lib/pricing-tiers';
import { ACCEPTED_UPLOAD_TYPES, Dropzone } from './Dropzone';
import { EngineSelect } from './EngineSelect';
import { PresetSelect } from './PresetSelect';
import { RatioChip } from './RatioChip';
import { CHIP_ACTIVE, CHIP_BASE } from './chip';
import { HomeSidebar } from './HomeSidebar';
import type { AppMode } from './CommandBar';

export interface RecentRenderCardData {
  id: string;
  projectId: string;
  projectName: string;
  preset: string | null;
  engine: string | null;
  editType: string | null;
}

const CARD_TRANSFORM = [
  '',
  '-rotate-3 translate-y-1.5',
  'rotate-2 -translate-y-1 z-[2]',
  '-rotate-2 translate-y-2.5',
];

function RenderFanCard({ render, index }: { render: RecentRenderCardData; index: number }) {
  const { locale } = useLocale();
  const t = useTranslations();

  const tag =
    render.editType === 'add_element'
      ? t('edit.tabAdd')
      : render.editType === 'targeted_retouch'
        ? t('edit.tabRetouch')
        : render.preset
          ? PRESETS[render.preset as PresetKey].label[locale]
          : ENGINE_LABELS[(render.engine as EngineName) || 'nanobanana'].name;

  return (
    <Link
      href={`/app/${render.projectId}`}
      // 90ms apart: enough to read as a deal of cards, short enough that the
      // last one lands well before anyone reaches for it.
      style={{ animationDelay: `${index * 90}ms` }}
      className={`rb-card-in group relative h-[300px] w-[220px] flex-shrink-0 overflow-hidden rounded-[18px] border border-[#ECECF2] bg-gradient-to-br from-[#EFECFF] to-[#F1F0F6] shadow-[0_20px_40px_-20px_#17161F30] transition-transform hover:z-10 hover:-translate-y-2 hover:rotate-0 ${
        index === 0 ? '' : '-ml-6'
      } ${CARD_TRANSFORM[index] ?? ''}`}
    >
      <img
        src={`/api/render-nodes/${render.id}/image`}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
      <span className="absolute left-3 top-3 rounded-2xl border border-[#ECECF2] bg-white px-2 py-1 font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] text-[#8A8896]">
        {tag}
      </span>
      <span className="absolute inset-x-3.5 bottom-3.5 font-[family-name:var(--font-general-sans)] text-sm font-semibold text-white">
        {render.projectName}
      </span>
    </Link>
  );
}

export function GenerationHome({
  recentRenders,
  tier,
  max,
  remaining,
  authDisabled = false,
}: {
  recentRenders: RecentRenderCardData[];
  tier: PricingTierId | null;
  max: number | null;
  remaining: number | null;
  authDisabled?: boolean;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<AppMode>('generate');
  const [engine, setEngine] = useState<EngineName>('nanobanana');
  const [prompt, setPrompt] = useState('');
  const [preset, setPreset] = useState<PresetKey>('jour_ext');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user?.defaultEngine === 'nanobanana' || user?.defaultEngine === 'gpt_image') {
      setEngine(user.defaultEngine);
    }
  }, [user?.defaultEngine]);

  function handleModeChange(next: AppMode) {
    setMode(next);
    setPrompt('');
    setReferenceFile(null);
  }

  async function quickStart(file: File) {
    setCreating(true);
    try {
      const project = await api<{ id: string }>('/api/projects', {
        method: 'POST',
        // Quick-start deliberately does not ask for a name, but it should at
        // least speak the user's language — the grid's dialog uses the same key.
        body: {
          name: t('projects.defaultName', {
            date: new Date().toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
              day: 'numeric',
              month: 'short',
            }),
          }),
        },
      });

      const form = new FormData();
      form.append('file', file);
      const csrf = getCsrfTokenForUpload();
      const res = await fetch(`/api/projects/${project.id}/upload`, {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers: csrf ? { 'x-csrf-token': csrf } : {},
      });
      if (!res.ok) throw new Error('upload failed');

      const params = new URLSearchParams();
      if (prompt.trim()) params.set('prompt', prompt.trim());
      params.set('preset', preset);
      params.set('engine', engine);
      router.push(`/app/${project.id}?${params.toString()}`);
    } catch {
      toast(t('app.genHomeQuickStartError'), 'error');
      setCreating(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setReferenceFile(file);
  }

  const sendDisabled = creating || !referenceFile;

  return (
    <div className="flex h-screen bg-white">
      <HomeSidebar
        mode={mode}
        onModeChange={handleModeChange}
        tier={tier}
        max={max}
        remaining={remaining}
        userEmail={user?.email ?? ''}
      />

      <main className="flex flex-1 flex-col overflow-hidden px-7.5 pt-5.5">
        <div className="mb-7.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {authDisabled && (
              <span className="rounded-2xl bg-amber-100 px-2.5 py-1 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium text-amber-800">
                {tier && max !== null && remaining !== null
                  ? t('app.authDisabledBannerCount', { remaining, max })
                  : t('app.authDisabledBanner')}
              </span>
            )}
          </div>
          <LanguageInlineSwitch />
        </div>

        {!tier ? (
          // Blocking, not a late error at generate-time: without an active
          // tier there's nothing to do in any mode, so this pre-empts even
          // the mode hint below.
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]">
              <Folder set="bold" size={24} primaryColor="#ffffff" />
            </div>
            <h2 className="font-[family-name:var(--font-general-sans)] text-[15px] font-semibold text-[#17161F]">
              {t('app.genHomeNoTierTitle')}
            </h2>
            <p className="max-w-[320px] text-[13px] text-[#8A8896]">{t('app.genHomeNoTierBody')}</p>
            <Link
              href="/#tarifs"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-5 py-2.5 text-[13px] font-semibold text-white"
            >
              {t('app.genHomeChooseTier')}
            </Link>
          </div>
        ) : mode !== 'generate' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]">
              <Folder set="bold" size={24} primaryColor="#ffffff" />
            </div>
            <p className="max-w-[320px] text-[13px] text-[#8A8896]">{t('app.genHomeModeHint')}</p>
            <Link
              href="/app/projets"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-5 py-2.5 text-[13px] font-semibold text-white"
            >
              {t('app.genHomeOpenProjects')}
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6.5 flex items-center justify-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]">
                <ImageIcon set="bold" size={22} primaryColor="#ffffff" />
              </div>
              <h1 className="font-[family-name:var(--font-general-sans)] text-[32px] font-bold text-[#17161F]">
                {t('app.genHomeTitle')}
              </h1>
            </div>

            {recentRenders.length === 0 ? (
              <div className="flex flex-1 items-center justify-center pb-5">
                <div className="w-full max-w-[440px]">
                  <Dropzone uploading={creating} onFile={(f) => void quickStart(f)} />
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-start justify-center gap-0 overflow-hidden pb-5">
                {recentRenders.map((r, i) => (
                  <RenderFanCard key={r.id} render={r} index={i} />
                ))}
              </div>
            )}

            {/* One container, Krea-style: the prompt on top, its attributes
                below, the send button on the same row — instead of a pill row
                floating free above a separate input. The whole block is the
                drop target, so a photo can land anywhere on it. */}
            <div className="pb-5.5">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`rounded-[18px] border px-3.5 pb-3 pt-3 transition-colors ${
                  dragOver ? 'border-[#716FFF] bg-[#EFECFF]' : 'border-[#ECECF2] bg-[#F7F7FA]'
                }`}
              >
                <input
                  type="text"
                  placeholder={t('app.genHomeInputPlaceholder')}
                  value={prompt}
                  disabled={creating}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !sendDisabled && referenceFile)
                      void quickStart(referenceFile);
                  }}
                  className="mb-3 w-full bg-transparent px-1 py-1.5 text-[13.5px] text-[#17161F] outline-none placeholder:text-[#8A8896] disabled:cursor-not-allowed"
                />
                {/* Chips grouped tight on the left, generate alone on the
                    right — one chip per attribute, not one per option. */}
                <div className="flex flex-wrap items-center gap-2">
                  <PresetSelect preset={preset} onChange={setPreset} disabled={creating} />
                  <button
                    type="button"
                    disabled={creating}
                    onClick={() =>
                      referenceFile ? setReferenceFile(null) : fileInputRef.current?.click()
                    }
                    className={referenceFile ? CHIP_ACTIVE : CHIP_BASE}
                  >
                    {referenceFile ? (
                      <>
                        <TickSquare set="bold" size={13} primaryColor="#ffffff" />
                        {t('app.pillReferenceAdded')}
                        <CloseSquare set="bold" size={13} primaryColor="#ffffff" />
                      </>
                    ) : (
                      <>
                        <Upload set="bold" size={13} primaryColor="#8A8896" />
                        {t('app.pillReferenceEmpty')}
                      </>
                    )}
                  </button>
                  <RatioChip file={referenceFile} />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_UPLOAD_TYPES.join(',')}
                    className="hidden"
                    onChange={(e) => setReferenceFile(e.target.files?.[0] ?? null)}
                  />
                  {/* The engine belongs with the other generation attributes,
                      not alone in the page header where it used to sit. */}
                  <div className="ml-auto flex items-center gap-2">
                    <EngineSelect engine={engine} onChange={setEngine} placement="up" />
                    <button
                      type="button"
                      disabled={sendDisabled}
                      onClick={() => referenceFile && void quickStart(referenceFile)}
                      aria-label={t('app.genHomeTitle')}
                      className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] text-white disabled:opacity-50"
                    >
                      <Send set="bold" size={17} primaryColor="#ffffff" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
