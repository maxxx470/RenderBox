'use client';

// /app/generer — "Espace de génération". Distinct from the /app dashboard:
// this screen is a quick-start surface (engine pick + recent renders + a
// drop-a-photo command bar) that always creates a *new* project. Opening an
// existing one still goes through the dashboard at /app, or by clicking a
// card here.
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Folder,
  Send,
  TickSquare,
  CloseSquare,
  Upload,
  Image as ImageIcon,
  Category,
} from 'react-iconly';
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
import { ACCEPTED_UPLOAD_TYPES } from './Dropzone';
import { EngineSelect } from './EngineSelect';
import { PresetSelect } from './PresetSelect';
import { RatioSelect } from './RatioSelect';
import { isRatioSupported, type RatioKey } from '@/lib/server/generation/ratios';
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

/** How many positions the fan lays out, filled or not. */
const FAN_SLOTS = CARD_TRANSFORM.length;

// Shared geometry so a filled slot and an empty one occupy exactly the same
// space — otherwise the fan would shift as renders replace placeholders.
const CARD_SHAPE =
  'group relative h-[300px] w-[220px] flex-shrink-0 overflow-hidden rounded-[18px] shadow-[0_20px_40px_-20px_#17161F30] transition-transform hover:z-10 hover:-translate-y-2 hover:rotate-0';

function EmptyFanCard({ index, onClick }: { index: number; onClick: () => void }) {
  const t = useTranslations();

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${index * 90}ms` }}
      className={`rb-card-in ${CARD_SHAPE} flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[#ECECF2] bg-[#FBFBFD] hover:border-[#716FFF] ${
        index === 0 ? '' : '-ml-6'
      } ${CARD_TRANSFORM[index] ?? ''}`}
    >
      <span className="flex h-[46px] w-[46px] items-center justify-center rounded-2xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]">
        <Upload set="light" size={20} primaryColor="#ffffff" />
      </span>
      <span className="max-w-[150px] text-center text-[12.5px] font-medium text-[#8A8896]">
        {t('app.genHomeCardPlaceholder')}
      </span>
    </button>
  );
}

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
      className={`rb-card-in ${CARD_SHAPE} border border-[#ECECF2] bg-gradient-to-br from-[#EFECFF] to-[#F1F0F6] ${
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
  const [ratio, setRatio] = useState<RatioKey>('auto');

  // Mirrors AppShell: an engine that cannot produce the chosen ratio drops the
  // choice back to 'auto' rather than carrying a request it will not honour.
  function handleEngineChange(next: EngineName) {
    setEngine(next);
    if (!isRatioSupported(ratio, next)) setRatio('auto');
  }
  const [prompt, setPrompt] = useState('');
  const [preset, setPreset] = useState<PresetKey>('jour_ext');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [creating, setCreating] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
      // 'auto' is the default on the other side — no need to spell it out.
      if (ratio !== 'auto') params.set('ratio', ratio);
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
      {/* Backdrop for the mobile drawer, matching the workspace. */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 min-[900px]:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden
        />
      )}
      <HomeSidebar
        onModeChange={handleModeChange}
        tier={tier}
        max={max}
        remaining={remaining}
        userEmail={user?.email ?? ''}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      {/* min-w-0 so this flex child can shrink below its content's intrinsic
          width instead of pushing the workspace off a narrow screen. */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden px-5 pt-5.5 min-[900px]:px-7.5">
        <div className="mb-7.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-lg border border-[#ECECF2] p-1.5 min-[900px]:hidden"
              aria-label={t('app.openMenu')}
            >
              <Category set="light" size={16} primaryColor="#8A8896" />
            </button>
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
              <Folder set="light" size={24} primaryColor="#ffffff" />
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
              <Folder set="light" size={24} primaryColor="#ffffff" />
            </div>
            <p className="max-w-[320px] text-[13px] text-[#8A8896]">{t('app.genHomeModeHint')}</p>
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-5 py-2.5 text-[13px] font-semibold text-white"
            >
              {t('app.genHomeOpenProjects')}
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6.5 flex items-center justify-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]">
                <ImageIcon set="light" size={22} primaryColor="#ffffff" />
              </div>
              <h1 className="font-[family-name:var(--font-general-sans)] text-[32px] font-bold text-[#17161F]">
                {t('app.genHomeTitle')}
              </h1>
            </div>

            {/* The fan is always laid out with FAN_SLOTS positions: real
                renders fill it from the left, and the rest stay as empty
                slots that get replaced one by one as renders come in. The
                placeholders are deliberately not images — inventing sample
                renders would pass fabricated output off as the product's. */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className="flex flex-1 items-start justify-center gap-0 overflow-hidden pb-5"
            >
              {Array.from({ length: FAN_SLOTS }, (_, i) => {
                const render = recentRenders[i];
                return render ? (
                  <RenderFanCard key={render.id} render={render} index={i} />
                ) : (
                  <EmptyFanCard
                    key={`slot-${i}`}
                    index={i}
                    onClick={() => fileInputRef.current?.click()}
                  />
                );
              })}
            </div>

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
                className={`rounded-[18px] border px-3.5 pb-3 pt-3 shadow-[0_2px_10px_-6px_rgba(23,22,31,0.18)] transition-colors ${
                  dragOver ? 'border-[#716FFF] bg-[#EFECFF]' : 'border-[#DEDEE8] bg-[#F7F7FA]'
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
                        <TickSquare set="light" size={13} primaryColor="#ffffff" />
                        {t('app.pillReferenceAdded')}
                        <CloseSquare set="light" size={13} primaryColor="#ffffff" />
                      </>
                    ) : (
                      <>
                        <Upload set="light" size={13} primaryColor="#8A8896" />
                        {t('app.pillReferenceEmpty')}
                      </>
                    )}
                  </button>
                  {/* Same control as the workspace bar: this launches a real
                      generation through the URL params below, so the ratio has
                      to be choosable here too. */}
                  <RatioSelect
                    ratio={ratio}
                    onChange={setRatio}
                    engine={engine}
                    disabled={creating}
                  />
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
                    <EngineSelect engine={engine} onChange={handleEngineChange} placement="up" />
                    <button
                      type="button"
                      disabled={sendDisabled}
                      onClick={() => referenceFile && void quickStart(referenceFile)}
                      aria-label={t('app.genHomeTitle')}
                      className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] text-white disabled:opacity-50"
                    >
                      <Send set="light" size={17} primaryColor="#ffffff" />
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
