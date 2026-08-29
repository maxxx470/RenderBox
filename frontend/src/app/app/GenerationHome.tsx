'use client';

// /app home — "Espace de génération". Distinct from the /app/projets grid:
// this screen is a quick-start surface (engine pick + recent renders + a
// drop-a-photo command bar) that always creates a *new* project. Opening an
// existing one still goes through /app/projets or by clicking a card here.
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Folder, Send } from 'react-iconly';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { api } from '@/lib/api';
import { getCsrfTokenForUpload } from '@/lib/csrf-client';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import { PRESET_KEYS, PRESETS, type PresetKey } from '@/lib/server/generation/presets';
import type { PricingTierId } from '@/lib/pricing-tiers';
import { Dropzone } from './Dropzone';
import { EngineSelect } from './EngineSelect';
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
      className={`group relative h-[300px] w-[220px] flex-shrink-0 overflow-hidden rounded-[18px] border border-[#ECE3E5] bg-gradient-to-br from-[#FBEDEE] to-[#F1EBEC] shadow-[0_20px_40px_-20px_#17060830] transition-transform hover:z-10 hover:-translate-y-2 hover:rotate-0 ${
        index === 0 ? '' : '-ml-6'
      } ${CARD_TRANSFORM[index] ?? ''}`}
    >
      <img
        src={`/api/render-nodes/${render.id}/image`}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
      <span className="absolute left-3 top-3 rounded-2xl border border-[#ECE3E5] bg-white px-2 py-1 font-[family-name:var(--font-ibm-plex-mono)] text-[9.5px] text-[#7A6E71]">
        {tag}
      </span>
      <span className="absolute inset-x-3.5 bottom-3.5 font-[family-name:var(--font-poppins)] text-sm font-semibold text-white">
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
}: {
  recentRenders: RecentRenderCardData[];
  tier: PricingTierId | null;
  max: number | null;
  remaining: number | null;
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
        body: { name: `Projet ${new Date().toLocaleDateString()}` },
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
      <LanguageToggle />
      <HomeSidebar
        mode={mode}
        onModeChange={handleModeChange}
        tier={tier}
        max={max}
        remaining={remaining}
        userEmail={user?.email ?? ''}
      />

      <main className="flex flex-1 flex-col overflow-hidden px-7.5 pt-5.5">
        <div className="mb-7.5 flex items-center gap-2">
          <span className="text-[13px] text-[#7A6E71]">{t('app.engineLabel')}</span>
          <EngineSelect engine={engine} onChange={setEngine} />
        </div>

        {!tier ? (
          // Blocking, not a late error at generate-time: without an active
          // tier there's nothing to do in any mode, so this pre-empts even
          // the mode hint below.
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-[#E8121F] to-[#7F0000]">
              <Folder set="bold" size={24} primaryColor="#ffffff" />
            </div>
            <h2 className="font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[#170608]">
              {t('app.genHomeNoTierTitle')}
            </h2>
            <p className="max-w-[320px] text-[13px] text-[#7A6E71]">{t('app.genHomeNoTierBody')}</p>
            <Link
              href="/#tarifs"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#E8121F] to-[#7F0000] px-5 py-2.5 text-[13px] font-semibold text-white"
            >
              {t('app.genHomeChooseTier')}
            </Link>
          </div>
        ) : mode !== 'generate' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-[#E8121F] to-[#7F0000]">
              <Folder set="bold" size={24} primaryColor="#ffffff" />
            </div>
            <p className="max-w-[320px] text-[13px] text-[#7A6E71]">{t('app.genHomeModeHint')}</p>
            <Link
              href="/app/projets"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#E8121F] to-[#7F0000] px-5 py-2.5 text-[13px] font-semibold text-white"
            >
              {t('app.genHomeOpenProjects')}
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6.5 flex items-center justify-center gap-3.5">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#E8121F] to-[#7F0000]" />
              <h1 className="font-[family-name:var(--font-poppins)] text-[32px] font-bold text-[#170608]">
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

            <div className="pb-5.5">
              <div className="mb-3 flex flex-wrap gap-2">
                {PRESET_KEYS.map((key) => {
                  const active = preset === key;
                  const isSketch = key === 'esquisse';
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={creating}
                      onClick={() => setPreset(key)}
                      className={[
                        'flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                        isSketch ? 'border-dashed' : '',
                        active
                          ? isSketch
                            ? 'border-transparent bg-gradient-to-br from-[#3D3D3D] to-[#0A0A0A] text-white'
                            : 'border-transparent bg-gradient-to-br from-[#E8121F] to-[#7F0000] text-white'
                          : 'border-[#ECE3E5] bg-[#F8F5F6] text-[#7A6E71] hover:border-[#D9C4C6]',
                      ].join(' ')}
                    >
                      {PRESETS[key].label[locale]}
                    </button>
                  );
                })}
                <button
                  type="button"
                  disabled={creating}
                  onClick={() =>
                    referenceFile ? setReferenceFile(null) : fileInputRef.current?.click()
                  }
                  className={[
                    'flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12.5px] font-medium disabled:cursor-not-allowed disabled:opacity-50',
                    referenceFile
                      ? 'border-transparent bg-gradient-to-br from-[#E8121F] to-[#7F0000] text-white'
                      : 'border-dashed border-[#ECE3E5] bg-[#F8F5F6] text-[#7A6E71]',
                  ].join(' ')}
                >
                  {referenceFile
                    ? `✓ ${t('app.pillReferenceAdded')} ✕`
                    : t('app.pillReferenceEmpty')}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => setReferenceFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="flex items-center gap-2.5">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={`flex flex-1 items-center gap-2.5 rounded-[14px] border px-4 py-3 ${
                    dragOver ? 'border-[#C81120] bg-[#FBEDEE]' : 'border-[#ECE3E5] bg-[#F8F5F6]'
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
                    className="w-full bg-transparent text-[13px] text-[#170608] outline-none placeholder:text-[#7A6E71] disabled:cursor-not-allowed"
                  />
                </div>
                <button
                  type="button"
                  disabled={sendDisabled}
                  onClick={() => referenceFile && void quickStart(referenceFile)}
                  className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E8121F] to-[#7F0000] text-white disabled:opacity-50"
                >
                  <Send set="bold" size={17} primaryColor="#ffffff" />
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
