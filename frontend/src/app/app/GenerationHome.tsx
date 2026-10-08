'use client';

// /app/generer — "Espace de génération". Distinct from the /app dashboard:
// this screen is a quick-start surface (recent renders + the command bar)
// that always creates a *new* project from the image pinned in the bar.
//
// All three actions work here (owner, 2026-10-06): Générer opens the new
// project ready to render; Commenter shows the pinned image large, takes
// numbered comments on it and runs the edit; Ajouter takes a photo of the
// element and runs the edit. The edits then open the project on their result.
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Folder, Upload } from 'react-iconly';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import { api } from '@/lib/api';
import { getCsrfTokenForUpload } from '@/lib/csrf-client';
import { RequestError, readErrorCode, isServiceNotConfigured } from './request-error';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import { PRESETS, type PresetKey } from '@/lib/server/generation/presets';
import { EXAMPLE_RENDERS, type ExampleRender } from './generer-examples';
import type { PricingTierId } from '@/lib/pricing-tiers';
import { ACCEPTED_UPLOAD_TYPES } from './Dropzone';
import { isRatioSupported, type RatioKey } from '@/lib/server/generation/ratios';
import {
  DEFAULT_RESOLUTION,
  isResolutionSupported,
  type ResolutionKey,
} from '@/lib/server/generation/resolutions';
import { AppFrame } from './AppFrame';
import { MOBILE_NAV_PAD } from './MobileNav';
import { PageHeader } from './PageHeader';
import { CommandBar, useObjectUrl, type AppMode, type PinnedImage } from './CommandBar';
import { AnnotationLayer, drawMarkedImage, type Pin } from './AnnotationLayer';
import { ANNOTATE_ENGINE } from '@/lib/server/generation/annotations';

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

// An empty slot in the fan.
//
// Only the FIRST empty slot carries the instruction and the brand tile. The
// message used to be repeated on all four, which stopped reading as a
// prompt and started reading as a rendering glitch — four identical
// sentences side by side. The remaining slots keep the fan's shape (that
// silhouette is the motif) and stay quiet.
function EmptyFanCard({
  index,
  lead,
  onClick,
}: {
  index: number;
  /** The first slot with nothing in it — the one that speaks. */
  lead: boolean;
  onClick: () => void;
}) {
  const t = useTranslations();

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${index * 90}ms` }}
      aria-label={lead ? undefined : t('app.genHomeCardPlaceholder')}
      className={`rb-card-in ${CARD_SHAPE} flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[#ECECF2] bg-[#FBFBFD] hover:border-[#435CFE] ${
        index === 0 ? '' : '-ml-6'
      } ${CARD_TRANSFORM[index] ?? ''}`}
    >
      {lead ? (
        <>
          <span className="flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6]">
            <Upload set="curved" size={20} primaryColor="#ffffff" />
          </span>
          <span className="max-w-[150px] text-center text-[12.5px] font-medium text-[#6B6878]">
            {t('app.genHomeCardPlaceholder')}
          </span>
        </>
      ) : (
        <span className="flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-white">
          <Upload set="curved" size={20} primaryColor="#C9C7D1" />
        </span>
      )}
    </button>
  );
}

function RenderFanCard({ render, index }: { render: RecentRenderCardData; index: number }) {
  const { locale } = useLocale();
  const t = useTranslations();

  const tag =
    render.editType === 'add_element'
      ? t('edit.tabAdd')
      : render.editType === 'targeted_retouch' || render.editType === 'annotate'
        ? t('edit.tabRetouch')
        : render.editType === 'enhance'
          ? t('enhance.tag')
          : render.preset
            ? PRESETS[render.preset as PresetKey].label[locale]
            : ENGINE_LABELS[(render.engine as EngineName) || 'nanobanana'].name[locale];

  return (
    <Link
      href={`/app/${render.projectId}`}
      // 90ms apart: enough to read as a deal of cards, short enough that the
      // last one lands well before anyone reaches for it.
      style={{ animationDelay: `${index * 90}ms` }}
      className={`rb-card-in ${CARD_SHAPE} bg-[#F7F7FA] ${
        index === 0 ? '' : '-ml-6'
      } ${CARD_TRANSFORM[index] ?? ''}`}
    >
      <img
        src={`/api/render-nodes/${render.id}/image`}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
      <span className="absolute left-3 top-3 rounded-2xl bg-white px-2 py-1 font-[family-name:var(--font-mono)] text-[9.5px] text-[#8A8896]">
        {tag}
      </span>
      <span className="absolute inset-x-3.5 bottom-3.5 font-[family-name:var(--font-display)] text-sm font-semibold text-white">
        {render.projectName}
      </span>
    </Link>
  );
}

// An example render, shown only to an account with nothing of its own yet.
//
// Same geometry as RenderFanCard so the fan never shifts, but two things are
// deliberately different: the tag reads "exemple" rather than the preset, and
// the card is not a link. The in-app gallery it used to open was removed on
// 2026-10-06 (Enhance took its place), so it is a picture, not a destination.
function ExampleFanCard({ example, index }: { example: ExampleRender; index: number }) {
  const { locale } = useLocale();
  const t = useTranslations();

  return (
    <div
      style={{ animationDelay: `${index * 90}ms` }}
      className={`rb-card-in ${CARD_SHAPE} bg-[#F7F7FA] ${
        index === 0 ? '' : '-ml-6'
      } ${CARD_TRANSFORM[index] ?? ''}`}
    >
      <img src={example.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {/* Scrim only when something has to be read over the image, and deeper
          than RenderFanCard's: these images are not known in advance, and a
          pale one would drop a white caption below the contrast floor — the
          defect the hero fan hit. With no caption it would just dim the
          example on the screen meant to show what the product produces. */}
      {example.preset && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
      )}
      {/* The badge stays — these four slots otherwise hold the user's OWN
          renders, and an unlabelled RenderBox showcase image there would read
          as their work. What changed is how it reads: a black chip carrying
          the lowercase word "example" at 9.5px was the smallest, darkest type
          on the screen, and it looked like a debug annotation left in the
          build. Frosted white at a readable size, naming the product, reads
          as the caption it is. It carries its own ground either way, so it
          stays legible over a pale image or a dark one. */}
      <span className="absolute left-3 top-3 rounded-lg bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-[#17161F] backdrop-blur-sm">
        {t('app.genHomeExampleTag')}
      </span>
      {/* Only when the set spans several ambiances — see generer-examples.ts.
          Four cards captioned with the same word would say nothing. */}
      {example.preset && (
        <span className="absolute inset-x-3.5 bottom-3.5 font-[family-name:var(--font-display)] text-sm font-semibold text-white">
          {PRESETS[example.preset].label[locale]}
        </span>
      )}
    </div>
  );
}

export function GenerationHome({
  recentRenders,
  tier,
  max,
  remaining,
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
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  const [mode, setMode] = useState<AppMode>('generate');
  const [engine, setEngine] = useState<EngineName>('nanobanana');
  const [ratio, setRatio] = useState<RatioKey>('auto');
  const [resolution, setResolution] = useState<ResolutionKey>(DEFAULT_RESOLUTION);

  // Mirrors AppShell: an engine that cannot produce the chosen ratio or size
  // drops the choice back to its default rather than carrying a request it
  // will not honour.
  function handleEngineChange(next: EngineName) {
    setEngine(next);
    if (!isRatioSupported(ratio, next)) setRatio('auto');
    if (!isResolutionSupported(resolution, next)) setResolution(DEFAULT_RESOLUTION);
  }
  const [prompt, setPrompt] = useState('');
  const [preset, setPreset] = useState<PresetKey>('jour_ext');
  // The image every action starts from, pinned in the bar.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  // Ajouter only: a photo of the element to add.
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [variantCount, setVariantCount] = useState(2);
  const [dragOver, setDragOver] = useState(false);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const photoUrl = useObjectUrl(photoFile);
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

  // The photo stays pinned across modes — it is what all three work on. The
  // rest belongs to the mode it was made in.
  function handleModeChange(next: AppMode) {
    setMode(next);
    setPrompt('');
    setPins([]);
    setReferenceFile(null);
  }

  function pinPhoto(file: File) {
    setPhotoFile(file);
    // Comments placed on the previous picture point at nothing on this one.
    setPins([]);
  }

  /** A new project holding the pinned photo. Deleted again if the upload fails. */
  async function createProjectWithPhoto(
    file: File,
  ): Promise<{ projectId: string; nodeId: string }> {
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
    form.append('file', file);
    const csrf = getCsrfTokenForUpload();
    const res = await fetch(`/api/projects/${project.id}/upload`, {
      method: 'POST',
      body: form,
      credentials: 'include',
      headers: csrf ? { 'x-csrf-token': csrf } : {},
    });
    if (!res.ok) {
      const code = await readErrorCode(res);
      // The project was created only to hold this photo. Without it, it is
      // an empty "Projet du …" left on the dashboard after every failed try.
      // Not awaited: the error toast must not wait on the cleanup.
      void api(`/api/projects/${project.id}`, { method: 'DELETE' }).catch(() => undefined);
      throw new RequestError(code);
    }
    const node = (await res.json()) as { id: string };
    return { projectId: project.id, nodeId: node.id };
  }

  function errorToast(err: unknown, fallback: TranslationKey) {
    if (err instanceof RequestError && err.code === 'NO_ACTIVE_TIER') {
      toast(t('app.noActiveTierError'), 'error');
    } else if (err instanceof RequestError && err.code === 'QUOTA_EXCEEDED') {
      toast(t('app.quotaExceededError'), 'error');
    } else {
      toast(t(isServiceNotConfigured(err) ? 'app.serviceNotConfigured' : fallback), 'error');
    }
  }

  // Générer: the project opens with the bar's choices, ready to render.
  async function quickStart(file: File) {
    setCreating(true);
    try {
      const { projectId } = await createProjectWithPhoto(file);
      const params = new URLSearchParams();
      if (prompt.trim()) params.set('prompt', prompt.trim());
      params.set('preset', preset);
      params.set('engine', engine);
      // 'auto' is the default on the other side — no need to spell it out.
      if (ratio !== 'auto') params.set('ratio', ratio);
      router.push(`/app/${projectId}?${params.toString()}`);
    } catch (err) {
      errorToast(err, 'app.genHomeQuickStartError');
      setCreating(false);
    }
  }

  // Commenter / Ajouter: the edit runs from here, on the pinned photo, and
  // the project opens on its first result.
  async function runEdit(file: File) {
    const notes = pins.filter((p) => p.comment.trim());
    setCreating(true);
    let projectId: string | null = null;
    try {
      const created = await createProjectWithPhoto(file);
      projectId = created.projectId;

      const form = new FormData();
      form.append('sourceNodeId', created.nodeId);
      form.append('editType', mode === 'retouch' ? 'annotate' : 'add_element');
      form.append('instruction', prompt.trim());
      form.append('variantCount', String(variantCount));
      form.append('engine', mode === 'retouch' ? ANNOTATE_ENGINE : engine);
      if (mode === 'retouch') {
        form.append(
          'annotations',
          JSON.stringify(notes.map((p) => ({ x: p.x, y: p.y, comment: p.comment.trim() }))),
        );
        // Best effort: without the marked copy the server still places each
        // comment by its coordinates.
        const marked = photoUrl ? await drawMarkedImage(photoUrl, notes) : null;
        if (marked)
          form.append('markedImage', new File([marked], 'marked.jpg', { type: 'image/jpeg' }));
      }
      if (mode === 'add' && referenceFile) form.append('referenceImage', referenceFile);

      const csrf = getCsrfTokenForUpload();
      const res = await fetch(`/api/projects/${projectId}/edit`, {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers: csrf ? { 'x-csrf-token': csrf } : {},
      });
      if (!res.ok) throw new RequestError(await readErrorCode(res));
      const data = (await res.json()) as { nodeIds: string[] };
      const first = data.nodeIds[0];
      router.push(`/app/${projectId}${first ? `?node=${first}` : ''}`);
    } catch (err) {
      // Once the photo is safely in its project, open it — the same action
      // can be retried there — rather than leave a stray project behind.
      errorToast(err, 'edit.submitError');
      if (projectId) router.push(`/app/${projectId}`);
      else setCreating(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (mode === 'add' && photoFile) setReferenceFile(file);
    else pinPhoto(file);
  }

  // Examples are an empty-state device, not decoration: the moment the user
  // has anything of their own, the fan belongs to them.
  const showExamples = recentRenders.length === 0 && EXAMPLE_RENDERS.length > 0;

  const hasComments = pins.some((p) => p.comment.trim());
  const sendDisabled =
    creating ||
    !photoFile ||
    (mode === 'retouch' && !hasComments) ||
    (mode === 'add' && (!referenceFile || !prompt.trim()));
  const sendHint = !photoFile
    ? mode === 'generate'
      ? t('app.genHomeCardPlaceholder')
      : t('app.genHomeNeedPhoto')
    : mode === 'retouch' && !hasComments
      ? t('edit.zoneRequired')
      : mode === 'add' && !referenceFile
        ? t('edit.referenceRequired')
        : mode === 'add' && !prompt.trim()
          ? t('app.hintNoPrompt')
          : undefined;

  const pinned: PinnedImage[] = [];
  if (photoUrl)
    pinned.push({
      key: 'photo',
      src: photoUrl,
      caption: t(mode === 'generate' ? 'app.cmdPhotoTag' : 'app.cmdSourceTag'),
      onRemove: () => {
        setPhotoFile(null);
        setPins([]);
      },
    });
  if (referenceUrl)
    pinned.push({
      key: 'reference',
      src: referenceUrl,
      caption: t('app.cmdReferenceTag'),
      onRemove: () => setReferenceFile(null),
    });

  // The pinned image, shown large, in the two edit modes.
  const largeSrc = mode !== 'generate' ? photoUrl : null;

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

  return (
    // Below 900px the rail gives way to the bottom bar; here its "+" opens
    // the photo picker directly instead of linking to this very page.
    <AppFrame
      current="generate"
      topbar={{
        title: t('app.genHomeTitle'),
        tier,
        quotaMax: max,
        quotaRemaining: remaining,
        userEmail,
      }}
      onModeChange={handleModeChange}
      onNew={() => fileInputRef.current?.click()}
    >
      {/* min-w-0 so this flex child can shrink below its content's intrinsic
          width instead of pushing the workspace off a narrow screen. */}
      <main
        className={`flex min-w-0 flex-1 flex-col overflow-hidden bg-[#EEEEF1] px-2 pt-4 min-[640px]:px-4 min-[900px]:px-7.5 min-[900px]:pt-5 ${MOBILE_NAV_PAD}`}
      >
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
        <PageHeader
          eyebrow={t('page.generateEyebrow')}
          title={t('app.genHomeTitle')}
          subtitle={t('page.generateSubtitle')}
          className="mb-3 px-1"
        />
        {!tier ? (
          // Blocking, not a late error at generate-time: without an active
          // tier there's nothing to do in any mode.
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-[#EEF1FF]">
              <Folder set="curved" size={24} primaryColor="#2948FC" />
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F]">
              {t('app.genHomeNoTierTitle')}
            </h2>
            <p className="max-w-[320px] text-[13px] text-[#8A8896]">{t('app.genHomeNoTierBody')}</p>
            <Link
              href="/app/tarifs"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] px-5 py-2.5 text-[13px] font-semibold text-white"
            >
              {t('app.genHomeChooseTier')}
            </Link>
          </div>
        ) : (
          <>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className="flex min-h-0 flex-1 flex-col px-1"
            >
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
              ) : (
                // The fan is always laid out with FAN_SLOTS positions: real
                // renders fill it from the left, the rest stay empty slots.
                <div className="flex flex-1 items-center justify-center gap-0 overflow-hidden pb-5">
                  {Array.from({ length: FAN_SLOTS }, (_, i) => {
                    const render = recentRenders[i];
                    if (render) return <RenderFanCard key={render.id} render={render} index={i} />;
                    // All or nothing: examples show only while the account has
                    // no render of its own.
                    const example = showExamples ? EXAMPLE_RENDERS[i] : undefined;
                    if (example)
                      return <ExampleFanCard key={`example-${i}`} example={example} index={i} />;
                    return (
                      <EmptyFanCard
                        key={`slot-${i}`}
                        index={i}
                        lead={i === recentRenders.length}
                        onClick={() => fileInputRef.current?.click()}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* The command bar, the same component the workspace uses. The
                drop target wraps it so a photo can land anywhere on it. */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`rounded-[22px] transition-colors ${
                dragOver ? 'bg-[#EEF1FF]' : 'bg-transparent'
              }`}
            >
              <CommandBar
                mode={mode}
                onModeChange={handleModeChange}
                // All three modes are open here: Commenter and Ajouter work
                // on the image pinned in the bar.
                editEnabled
                enhanceHref="/app/enhance"
                engine={mode === 'retouch' ? ANNOTATE_ENGINE : engine}
                onEngineChange={handleEngineChange}
                engineLocked={mode === 'retouch'}
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
                onAttach={mode === 'add' && photoFile ? setReferenceFile : pinPhoto}
                attachTitle={
                  mode === 'add' && photoFile
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
                imageSrc={largeSrc}
                materials={[]}
                elementNodes={[]}
                onPickElement={() => {}}
                pickingElement={false}
                onSubmit={() => {
                  if (!photoFile || sendDisabled) return;
                  if (mode === 'generate') void quickStart(photoFile);
                  else void runEdit(photoFile);
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
              />
            </div>
          </>
        )}
      </main>
    </AppFrame>
  );
}
