'use client';

// /app/generer — "Espace de génération". Distinct from the /app dashboard:
// the owner's four templates in the fan, the command bar, and the account's
// recent images in the right column.
//
// Since 2026-10-19 (owner) the page renders on the spot: the image pinned in
// the bar — a new photo through the paperclip, or a recent image picked in the
// right column — is shown on the left, the render appears on the right, with
// what made it and « Utiliser comme image source », which makes the render the
// next one's source. A new photo becomes a project on its first render; every
// render after it from the same source lands in that same project (« Ouvrir
// dans le projet » reaches its tree). Commenter and Ajouter work the same way:
// the pinned image is shown large for the comments, the result then appears
// beside its source.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Category, Download, Image as ImageIcon } from 'react-iconly';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import { api } from '@/lib/api';
import { getCsrfTokenForUpload } from '@/lib/csrf-client';
import {
  creditErrorKey,
  plansReasonFor,
  RequestError,
  readErrorCode,
  isGenerationTimeout,
  isMaterialsUnavailable,
  isServiceNotConfigured,
  errorCodeOf,
  notConfiguredKey,
} from './request-error';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import { PRESETS, isPresetKey, type PresetKey } from '@/lib/server/generation/presets';
import {
  TEMPLATE_KEYS,
  TEMPLATES,
  type SkyOption,
  type TemplateKey,
} from '@/lib/server/generation/templates';
import { FAN_SLOTS, FanCarousel, TemplateFanCard } from './fan';
import type { PricingTierId } from '@/lib/pricing-tiers';
import { ACCEPTED_UPLOAD_TYPES } from './upload-types';
import type { RatioKey } from '@/lib/server/generation/ratios';
import {
  DEFAULT_RESOLUTION,
  RESOLUTIONS,
  type ResolutionKey,
} from '@/lib/server/generation/resolutions';
import { AppFrame } from './AppFrame';
import { useAppChrome } from './AppChrome';
import { useRenderPrice } from './use-render-price';
import { MOBILE_NAV_PAD } from './MobileNav';
import { SideColumn } from './SideColumn';
import { NodeMaterialsPanel } from './NodeMaterialsPanel';
import { CommandBar, useObjectUrl, type AppMode, type PinnedImage } from './CommandBar';
import { AnnotationLayer, drawMarkedImage, type Pin } from './AnnotationLayer';
import { ANNOTATE_ENGINE } from '@/lib/server/generation/annotations';
import { fitForUpload, UPLOAD_FIT } from './fit-upload';
import { RecentImages } from './RecentImages';

export interface RecentRenderCardData {
  id: string;
  projectId: string;
  projectName: string;
  preset: string | null;
  engine: string | null;
  editType: string | null;
}

/** An image already stored, in its project: a recent one, or a render. */
interface StoredImage {
  projectId: string;
  nodeId: string;
}

/** The render shown on the right, and what made it. */
interface ResultImage extends StoredImage {
  engine: EngineName;
  resolution: ResolutionKey;
  /** The ambiance, template or action, already in the user's words. */
  label: string | null;
}

// The generate route may run up to its 300 s maxDuration; the browser waits a
// little longer, so the server's own answer always arrives (see AppShell).
const GENERATE_TIMEOUT_MS = 310_000;

const imageUrl = (nodeId: string) => `/api/render-nodes/${nodeId}/image`;

/** One side of the stage: a picture on the grey ground, its tag in a corner. */
function StagePane({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-[#F7F7FA] p-3">
      <span className="absolute left-3 top-3 z-10 rounded-md bg-white px-2 py-1 font-[family-name:var(--font-mono)] text-[10px] font-medium text-[#6B6878] shadow-[0_1px_2px_rgba(23,22,31,0.08)]">
        {tag}
      </span>
      {children}
    </div>
  );
}

export function GenerationHome({
  recentRenders,
  tier,
  max,
  remaining: initialRemaining,
  userEmail,
}: {
  recentRenders: RecentRenderCardData[];
  tier: PricingTierId | null;
  max: number | null;
  remaining: number | null;
  /** Passed from the server component, like /app does. */
  userEmail: string;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const { user } = useAuth();
  const { toast } = useToast();
  const chrome = useAppChrome();
  const priceOf = useRenderPrice();

  const [mode, setMode] = useState<AppMode>('generate');
  const [engine, setEngine] = useState<EngineName>('nanobanana');
  const [ratio, setRatio] = useState<RatioKey>('auto');
  const [resolution, setResolution] = useState<ResolutionKey>(DEFAULT_RESOLUTION);
  const [prompt, setPrompt] = useState('');
  const [preset, setPreset] = useState<PresetKey | null>(null);
  // A template picked in the fan (owner, 2026-10-10): the server builds its
  // prompt from the key (2026-10-19, D1); the bar holds the user's own note.
  const [template, setTemplate] = useState<TemplateKey | null>(null);
  // Exterior day's sky (D2): lightly hazy unless the user asks for sun.
  const [sky, setSky] = useState<SkyOption>('hazy');
  // The source: a new photo through the paperclip (stored on the first
  // render, then `stored` too), or a recent image picked in the column.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [stored, setStored] = useState<StoredImage | null>(null);
  const [result, setResult] = useState<ResultImage | null>(null);
  const [recent, setRecent] = useState<RecentRenderCardData[]>(recentRenders);
  const [remaining, setRemaining] = useState<number | null>(initialRemaining);
  // Ajouter only: a photo of the element to add.
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  // One version by default (owner, 2026-10-19); more on request.
  const [variantCount, setVariantCount] = useState(1);
  // Below 900px the right column is a drawer.
  const [panelOpen, setPanelOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const photoUrl = useObjectUrl(photoFile);
  const sourceSrc = photoUrl ?? (stored ? imageUrl(stored.nodeId) : null);
  // The pinned image's own size, and the size it is shown at in the edit
  // modes: as large as the stage allows, small photos included.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null);
  const referenceUrl = useObjectUrl(mode === 'add' ? referenceFile : null);

  useEffect(() => {
    if (user?.defaultEngine === 'nanobanana' || user?.defaultEngine === 'gpt_image') {
      setEngine(user.defaultEngine);
    }
  }, [user?.defaultEngine]);

  // The source stays pinned across modes — it is what all three work on. The
  // rest belongs to the mode it was made in.
  function handleModeChange(next: AppMode) {
    setMode(next);
    setPrompt('');
    setPins([]);
    setReferenceFile(null);
    setTemplate(null);
  }

  // "Utiliser ce modèle": the template's chip goes in the bar, then the
  // paperclip asks for the plan or photo it will work on (unless one is
  // already pinned).
  function applyTemplate(key: TemplateKey) {
    if (mode !== 'generate') {
      setMode('generate');
      setPins([]);
      setReferenceFile(null);
    }
    setTemplate(key);
    if (!sourceSrc) fileInputRef.current?.click();
  }

  /** A new photo through the paperclip. */
  function pinPhoto(file: File) {
    setPhotoFile(file);
    setStored(null);
    setResult(null);
    // Comments placed on the previous picture point at nothing on this one.
    setPins([]);
    setNatural(null);
  }

  /** An image already stored becomes the source (a recent one, a render). */
  function pinStored(image: StoredImage) {
    setPhotoFile(null);
    setStored(image);
    setResult(null);
    setPins([]);
    setNatural(null);
    setPanelOpen(false);
  }

  function clearSource() {
    setPhotoFile(null);
    setStored(null);
    setResult(null);
    setPins([]);
  }

  /**
   * The source as a stored image: a new photo goes into a new project first
   * (deleted again if the upload fails), once — the next renders reuse it.
   */
  async function ensureStored(): Promise<StoredImage> {
    if (stored) return stored;
    if (!photoFile) throw new Error('no source');
    const project = await api<{ id: string }>('/api/projects', {
      method: 'POST',
      // Quick-start deliberately does not ask for a name, but it should at
      // least speak the user's language.
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
    form.append('file', await fitForUpload(photoFile));
    const csrf = getCsrfTokenForUpload();
    const res = await fetch(`/api/projects/${project.id}/upload`, {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: csrf ? { 'x-csrf-token': csrf } : {},
    });
    if (!res.ok) {
      const code = await readErrorCode(res);
      // The project was created only to hold this photo. Not awaited: the
      // error toast must not wait on the cleanup.
      void api(`/api/projects/${project.id}`, { method: 'DELETE' }).catch(() => undefined);
      throw new RequestError(code);
    }
    const node = (await res.json()) as { id: string };
    const image = { projectId: project.id, nodeId: node.id };
    setStored(image);
    return image;
  }

  function errorToast(err: unknown, fallback: TranslationKey) {
    const creditKey = creditErrorKey(err);
    const plansReason = plansReasonFor(err);
    if (plansReason && chrome) {
      // Refused for want of a plan or credits: the plans, over the page.
      chrome.openPlans(plansReason);
    } else if (creditKey) {
      toast(t(creditKey), 'error', { label: t('app.creditsCta'), href: '/app/tarifs' });
    } else if (isServiceNotConfigured(err)) {
      toast(t(notConfiguredKey(err)), 'error');
    } else if (isMaterialsUnavailable(err)) {
      toast(t('app.materialsUnavailableError'), 'error');
    } else {
      // The code after the message says which step failed, on any screenshot.
      const code = errorCodeOf(err);
      const message = t(isGenerationTimeout(err) ? 'app.generationTimeout' : fallback);
      toast(code ? `${message} (${code})` : message, 'error');
    }
  }

  /** A new render on the right, first in the recent images. */
  function showResult(image: ResultImage, card: Omit<RecentRenderCardData, 'id' | 'projectId'>) {
    setResult(image);
    setRecent((prev) => [
      { id: image.nodeId, projectId: image.projectId, ...card },
      ...prev.filter((r) => r.id !== image.nodeId),
    ]);
  }

  // Générer: the render is made here and appears beside its source.
  async function generate() {
    setCreating(true);
    setResult(null);
    try {
      const source = await ensureStored();
      const res = await api<{ nodeId: string; creditsBalance: number | null }>(
        `/api/projects/${source.projectId}/generate`,
        {
          method: 'POST',
          timeoutMs: GENERATE_TIMEOUT_MS,
          body: {
            sourceNodeId: source.nodeId,
            preset,
            engine,
            customPrompt: prompt.trim() || undefined,
            template: template ?? undefined,
            sky: template === 'jour_ext' ? sky : undefined,
            // 'auto' is the absence of a request, so it is not sent at all.
            ratio: ratio === 'auto' ? undefined : ratio,
            resolution,
          },
        },
      );
      const label = template
        ? TEMPLATES[template].label[locale]
        : preset
          ? PRESETS[preset].label[locale]
          : null;
      showResult(
        { projectId: source.projectId, nodeId: res.nodeId, engine, resolution, label },
        { projectName: '', preset: template ?? preset, engine, editType: null },
      );
      setRemaining(res.creditsBalance);
    } catch (err) {
      errorToast(err, 'app.genHomeQuickStartError');
    } finally {
      setCreating(false);
    }
  }

  // Commenter / Ajouter: the edit runs from here, on the pinned image, and its
  // first result appears beside its source.
  async function runEdit() {
    const notes = pins.filter((p) => p.comment.trim());
    const editMode = mode;
    const editEngine = editMode === 'retouch' ? ANNOTATE_ENGINE : engine;
    setCreating(true);
    try {
      const source = await ensureStored();
      const form = new FormData();
      form.append('sourceNodeId', source.nodeId);
      form.append('editType', editMode === 'retouch' ? 'annotate' : 'add_element');
      form.append('instruction', prompt.trim());
      form.append('variantCount', String(variantCount));
      form.append('engine', editEngine);
      form.append('ratio', ratio);
      form.append('resolution', resolution);
      if (editMode === 'retouch') {
        form.append(
          'annotations',
          JSON.stringify(notes.map((p) => ({ x: p.x, y: p.y, comment: p.comment.trim() }))),
        );
        // Best effort: without the marked copy the server still places each
        // comment by its coordinates.
        const marked = sourceSrc ? await drawMarkedImage(sourceSrc, notes) : null;
        if (marked)
          form.append(
            'markedImage',
            await fitForUpload(
              new File([marked], 'marked.jpg', { type: 'image/jpeg' }),
              UPLOAD_FIT.reference,
            ),
          );
      }
      if (editMode === 'add' && referenceFile)
        form.append('referenceImage', await fitForUpload(referenceFile, UPLOAD_FIT.reference));

      const csrf = getCsrfTokenForUpload();
      const res = await fetch(`/api/projects/${source.projectId}/edit`, {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers: csrf ? { 'x-csrf-token': csrf } : {},
      });
      if (!res.ok) throw new RequestError(await readErrorCode(res));
      const data = (await res.json()) as {
        nodeIds: string[];
        requestedCount: number;
        createdCount: number;
        creditsBalance: number | null;
      };
      if (data.createdCount < data.requestedCount) {
        toast(
          t('edit.partialSuccess', { created: data.createdCount, requested: data.requestedCount }),
          'error',
        );
      }
      setRemaining(data.creditsBalance);
      const first = data.nodeIds[0];
      if (first) {
        // Back to the side-by-side view, the comments and element done.
        handleModeChange('generate');
        showResult(
          {
            projectId: source.projectId,
            nodeId: first,
            engine: editEngine,
            resolution,
            label: t(editMode === 'retouch' ? 'edit.tabRetouch' : 'edit.tabAdd'),
          },
          {
            projectName: '',
            preset: null,
            engine: editEngine,
            editType: editMode === 'retouch' ? 'annotate' : 'add_element',
          },
        );
      }
    } catch (err) {
      errorToast(err, 'edit.submitError');
    } finally {
      setCreating(false);
    }
  }

  const hasComments = pins.some((p) => p.comment.trim());
  const sendDisabled =
    creating ||
    !sourceSrc ||
    (mode === 'retouch' && !hasComments) ||
    (mode === 'add' && (!referenceFile || !prompt.trim()));
  const sendHint = !sourceSrc
    ? mode === 'generate'
      ? t(template ? 'app.templateHint' : 'app.genHomeCardPlaceholder')
      : t('app.genHomeNeedPhoto')
    : mode === 'retouch' && !hasComments
      ? t('edit.zoneRequired')
      : mode === 'add' && !referenceFile
        ? t('edit.referenceRequired')
        : mode === 'add' && !prompt.trim()
          ? t('app.hintNoPrompt')
          : undefined;

  const pinned: PinnedImage[] = [];
  if (sourceSrc)
    pinned.push({
      key: 'photo',
      src: sourceSrc,
      caption: t(mode === 'generate' ? 'app.cmdPhotoTag' : 'app.cmdSourceTag'),
      onRemove: clearSource,
    });
  if (referenceUrl)
    pinned.push({
      key: 'reference',
      src: referenceUrl,
      caption: t('app.cmdReferenceTag'),
      onRemove: () => setReferenceFile(null),
    });

  // The pinned image, shown large, in the two edit modes.
  const largeSrc = mode !== 'generate' ? sourceSrc : null;

  // Scaled to fit the stage exactly (the image box IS the picture, which is
  // what the comment layer measures — object-contain would add letterboxing).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !natural || !largeSrc) return;
    const read = () => {
      const k = Math.min(
        (stage.clientWidth - 24) / natural.w,
        (stage.clientHeight - 24) / natural.h,
      );
      if (k > 0) setFit({ w: Math.floor(natural.w * k), h: Math.floor(natural.h * k) });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [natural, largeSrc]);

  const resultInfo = result
    ? [
        ENGINE_LABELS[result.engine].name[locale],
        result.label,
        RESOLUTIONS[result.resolution].label,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <AppFrame
      current="generate"
      topbar={{
        title: t('app.genHomeTitle'),
        shortTitle: t('app.genHomeShortTitle'),
        tier,
        creditsMax: max,
        creditsBalance: remaining,
        userEmail,
      }}
      onModeChange={handleModeChange}
    >
      {/* On the left the stage with the command bar under it at the same
          width, on the right the materials sheet and the recent images. */}
      <main className={`flex min-w-0 flex-1 flex-col overflow-hidden ${MOBILE_NAV_PAD}`}>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_UPLOAD_TYPES.join(',')}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) pinPhoto(file);
            e.target.value = '';
          }}
        />
        {/* The right column's drawer, below 900px: the recent images (and
            the edit panel in Commenter / Ajouter). */}
        <div className="flex items-center justify-end gap-2 px-5.5 pt-4 min-[900px]:hidden">
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="rounded-xl p-1.5"
            aria-label={mode === 'generate' ? t('app.recentTitle') : `${t('edit.panelTitle')}`}
          >
            <Category set="curved" size={16} primaryColor="#8A8896" />
          </button>
        </div>
        {/* Same side padding as the command bar below it, as on a project. */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-2.5 pt-4 min-[640px]:px-5 min-[640px]:pt-5">
          {/* On a phone the header already names the page (owner, 2026-10-15). */}
          <div className="mb-4 max-[899px]:hidden">
            <h2 className="mb-1 font-[family-name:var(--font-display)] text-base font-semibold text-[#17161F]">
              {t('app.genHomeTitle')}
            </h2>
            <p className="text-[13px] text-[#8A8896]">{t('page.generateSubtitle')}</p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {/* No drag-and-drop on the canvas (owner, 2026-10-08): images
                come in through the command bar's paperclip or the column. */}
            {largeSrc ? (
              // Commenter / Ajouter on the pinned image: shown as large as
              // the screen allows, so a comment can be placed precisely.
              <div className="flex min-h-0 flex-1 flex-col pb-2">
                <p className="mb-2 text-center text-[12.5px] font-medium leading-snug text-[#6B6878]">
                  <span
                    aria-hidden
                    className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${
                      mode === 'retouch' ? 'bg-[#DC2626]' : 'bg-[#435CFE]'
                    }`}
                  />
                  {t(mode === 'retouch' ? 'app.genHomeCommentHint' : 'app.genHomeAddHint')}
                </p>
                <div
                  ref={stageRef}
                  className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-[#F7F7FA]"
                >
                  <img
                    ref={imgRef}
                    src={largeSrc}
                    alt=""
                    draggable={false}
                    onLoad={(e) =>
                      setNatural({
                        w: e.currentTarget.naturalWidth,
                        h: e.currentTarget.naturalHeight,
                      })
                    }
                    style={fit ? { width: fit.w, height: fit.h } : undefined}
                    className="pointer-events-none max-h-full max-w-full rounded-lg object-contain"
                  />
                  {mode === 'retouch' && (
                    <AnnotationLayer
                      imgRef={imgRef}
                      pins={pins}
                      onChange={setPins}
                      disabled={creating}
                    />
                  )}
                  {creating && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/55 backdrop-blur-[2px]">
                      <span className="rb-spin h-8 w-8 rounded-full border-[3px] border-[#D5DCFF] border-t-[#2948FC]" />
                    </div>
                  )}
                </div>
              </div>
            ) : sourceSrc ? (
              // Générer with a source: the source on the left, the render on
              // the right (owner, 2026-10-19); one above the other on a phone.
              <div className="flex min-h-0 flex-1 flex-col gap-3 pb-2 min-[640px]:flex-row">
                <StagePane tag={t('app.genSourceTag')}>
                  <img
                    src={sourceSrc}
                    alt=""
                    draggable={false}
                    className="max-h-full max-w-full rounded-lg object-contain"
                  />
                </StagePane>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
                  <StagePane tag={t('app.genResultTag')}>
                    {result ? (
                      <img
                        key={result.nodeId}
                        src={imageUrl(result.nodeId)}
                        alt=""
                        draggable={false}
                        className="rb-card-in max-h-full max-w-full rounded-lg object-contain"
                      />
                    ) : creating ? (
                      <div className="flex flex-col items-center gap-3 text-center">
                        <span className="rb-spin h-8 w-8 rounded-full border-[3px] border-[#D5DCFF] border-t-[#2948FC]" />
                        <span className="max-w-[220px] text-[12.5px] text-[#6B6878]">
                          {t('app.genResultWorking')}
                        </span>
                      </div>
                    ) : (
                      <div className="flex max-w-[240px] flex-col items-center gap-2.5 text-center">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white">
                          <ImageIcon set="curved" size={20} primaryColor="#C9C7D1" />
                        </span>
                        <span className="text-[12.5px] leading-snug text-[#8A8896]">
                          {t('app.genResultEmpty')}
                        </span>
                      </div>
                    )}
                  </StagePane>
                  {result && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-auto min-w-0 truncate font-[family-name:var(--font-mono)] text-[11px] text-[#6B6878]">
                        {resultInfo}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          pinStored({ projectId: result.projectId, nodeId: result.nodeId })
                        }
                        disabled={creating}
                        className="rounded-lg bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] px-3 py-1.5 text-[12px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
                      >
                        {t('app.genUseAsSource')}
                      </button>
                      <a
                        href={imageUrl(result.nodeId)}
                        download={`renderpro-${result.nodeId}.jpg`}
                        title={t('images.download')}
                        aria-label={t('images.download')}
                        className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[#F2F2F5] hover:bg-[#E9E9EE]"
                      >
                        <Download set="curved" size={15} primaryColor="#3D3B49" />
                      </a>
                      <Link
                        href={`/app/${result.projectId}?node=${result.nodeId}`}
                        className="rounded-lg bg-[#F2F2F5] px-3 py-1.5 text-[12px] font-medium text-[#3D3B49] hover:bg-[#E9E9EE]"
                      >
                        {t('app.genOpenProject')}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // No source yet: the owner's four templates, always — the
              // account's renders live in the right column (owner, 2026-10-19:
              // « ces images restent là et ne bougent plus »).
              <FanCarousel
                items={TEMPLATE_KEYS.slice(0, FAN_SLOTS).map((key, i) => ({
                  key,
                  node: (
                    <TemplateFanCard
                      src={TEMPLATES[key].image}
                      label={TEMPLATES[key].label[locale]}
                      action={t('app.templateUse')}
                      index={i}
                      onUse={() => applyTemplate(key)}
                    />
                  ),
                }))}
              />
            )}
          </div>
        </section>

        <CommandBar
          mode={mode}
          onModeChange={handleModeChange}
          // All three modes are open here: Commenter and Ajouter work
          // on the image pinned in the bar.
          editEnabled
          engine={mode === 'retouch' ? ANNOTATE_ENGINE : engine}
          onEngineChange={setEngine}
          engineLocked={mode === 'retouch'}
          versions={chrome?.versionsEnabled ? chrome.versions : undefined}
          onVersionChange={chrome?.versionsEnabled ? chrome.setVersion : undefined}
          ratio={ratio}
          onRatioChange={setRatio}
          resolution={resolution}
          onResolutionChange={setResolution}
          preset={preset}
          onPresetChange={setPreset}
          prompt={prompt}
          onPromptChange={setPrompt}
          // The paperclip pins the image to work on; in Ajouter, once
          // that is there, it takes the element's photo.
          onAttach={mode === 'add' && sourceSrc ? setReferenceFile : pinPhoto}
          attachTitle={
            mode === 'add' && sourceSrc
              ? t('app.cmdAttachReference')
              : mode === 'generate'
                ? t('app.cmdAttach')
                : t('app.cmdAttachSource')
          }
          uploading={false}
          pinned={pinned}
          variantCount={variantCount}
          onVariantCountChange={setVariantCount}
          zoneSelected={hasComments}
          referenceAdded={Boolean(referenceFile)}
          materials={[]}
          elementNodes={[]}
          onPickElement={() => {}}
          pickingElement={false}
          template={
            template
              ? {
                  label: TEMPLATES[template].label[locale],
                  image: TEMPLATES[template].image,
                  onClear: () => setTemplate(null),
                  sky: template === 'jour_ext' ? { value: sky, onChange: setSky } : undefined,
                }
              : null
          }
          onSubmit={() => {
            if (!sourceSrc || sendDisabled) return;
            // No plan, or not enough credits for this render: the plans
            // open over the page, before anything is uploaded.
            const cost = priceOf(
              mode === 'retouch' ? ANNOTATE_ENGINE : engine,
              resolution,
              mode === 'generate' ? 1 : variantCount,
            );
            if (!tier && !remaining) return chrome?.openPlans('noTier');
            if (remaining !== null && remaining < cost) return chrome?.openPlans('noCredits');
            if (mode === 'generate') void generate();
            else void runEdit();
          }}
          inputDisabled={creating}
          sendDisabled={sendDisabled}
          sendHint={sendHint}
          submitLabel={
            mode === 'generate'
              ? t('app.submitGenerate')
              : mode === 'retouch'
                ? t('app.modeRetouch')
                : t('app.modeAdd')
          }
          generating={creating}
          fill
        />
      </main>

      <SideColumn
        mode={mode}
        // No project yet: the panel says where an image's materials will show.
        materialsPanel={
          <NodeMaterialsPanel state={null} controller={null} nodeName={null} legacy={[]} />
        }
        canEdit={Boolean(sourceSrc)}
        lockedHint={t('app.genHomeNeedPhoto')}
        referenceFile={referenceFile}
        onReferenceChange={setReferenceFile}
        pins={pins}
        onPinsChange={setPins}
        lower={{
          title: t('app.recentTitle'),
          content: (
            <RecentImages
              images={recent}
              selectedId={stored?.nodeId ?? null}
              disabled={creating}
              onPick={(r) => pinStored({ projectId: r.projectId, nodeId: r.id })}
              labelFor={(r) =>
                r.preset && isPresetKey(r.preset)
                  ? PRESETS[r.preset].label[locale]
                  : r.engine === 'nanobanana' || r.engine === 'gpt_image'
                    ? ENGINE_LABELS[r.engine].name[locale]
                    : ''
              }
            />
          ),
        }}
        mobileOpen={panelOpen}
        onMobileClose={() => setPanelOpen(false)}
      />
    </AppFrame>
  );
}
