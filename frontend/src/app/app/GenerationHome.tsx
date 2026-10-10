'use client';

// /app/generer — "Espace de génération". Distinct from the /app dashboard:
// this screen is a quick-start surface (recent renders + the command bar)
// that always creates a *new* project from the image pinned in the bar.
//
// All three actions work here (owner, 2026-10-06): Générer opens the new
// project ready to render; Commenter shows the pinned image large, takes
// numbered comments on it and runs the edit; Ajouter takes a photo of the
// element and runs the edit. The edits then open the project on their result.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Category, Folder, Upload } from 'react-iconly';
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
import { TEMPLATE_KEYS, TEMPLATES, type TemplateKey } from '@/lib/server/generation/templates';
import { CARD_SHAPE, CARD_TRANSFORM, FAN_SLOTS, TemplateFanCard } from './fan';
import type { PricingTierId } from '@/lib/pricing-tiers';
import { ACCEPTED_UPLOAD_TYPES } from './upload-types';
import type { RatioKey } from '@/lib/server/generation/ratios';
import { DEFAULT_RESOLUTION, type ResolutionKey } from '@/lib/server/generation/resolutions';
import { AppFrame } from './AppFrame';
import { MOBILE_NAV_PAD } from './MobileNav';
import { SideColumn } from './SideColumn';
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

// An empty slot in the fan.
//
// Only the FIRST empty slot carries the instruction and the brand tile. The
// message used to be repeated on all four, which stopped reading as a
// prompt and started reading as a rendering glitch — four identical
// sentences side by side. The remaining slots keep the fan's shape (that
// silhouette is the motif) and stay quiet.
//
// Not a button since 2026-10-08: an image comes in through the command bar's
// paperclip, the one way in (owner).
function EmptyFanCard({
  index,
  lead,
}: {
  index: number;
  /** The first slot with nothing in it — the one that speaks. */
  lead: boolean;
}) {
  const t = useTranslations();

  return (
    <div
      style={{ animationDelay: `${index * 90}ms` }}
      aria-hidden={!lead}
      className={`rb-card-in ${CARD_SHAPE} flex flex-col items-center justify-center gap-3 border-2 border-dashed border-[#ECECF2] bg-[#FBFBFD] ${
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
    </div>
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

  // Both engines honour every ratio and size (2026-10-08): the choice stays.
  function handleEngineChange(next: EngineName) {
    setEngine(next);
  }
  const [prompt, setPrompt] = useState('');
  const [preset, setPreset] = useState<PresetKey | null>(null);
  // A template picked in the fan (owner, 2026-10-10): its prompt is in the
  // bar, and the render is asked for without an ambiance.
  const [template, setTemplate] = useState<TemplateKey | null>(null);
  // The image every action starts from, pinned in the bar.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  // Ajouter only: a photo of the element to add.
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [variantCount, setVariantCount] = useState(2);
  // Below 900px the right column (sheet + tree) is a drawer.
  const [panelOpen, setPanelOpen] = useState(false);
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
    setTemplate(null);
  }

  // "Utiliser ce modèle": the template's prompt goes in the bar, then the
  // paperclip asks for the plan or photo it will work on (unless one is
  // already pinned).
  function applyTemplate(key: TemplateKey) {
    if (mode !== 'generate') {
      setMode('generate');
      setPins([]);
      setReferenceFile(null);
    }
    setTemplate(key);
    setPrompt(TEMPLATES[key].prompt[locale]);
    if (!photoFile) fileInputRef.current?.click();
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
      if (preset) params.set('preset', preset);
      if (template) params.set('template', template);
      params.set('engine', engine);
      // 'auto' is the default on the other side — no need to spell it out.
      if (ratio !== 'auto') params.set('ratio', ratio);
      if (resolution !== DEFAULT_RESOLUTION) params.set('resolution', resolution);
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
      form.append('ratio', ratio);
      form.append('resolution', resolution);
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

  // The templates are an empty-state device, like the examples they replaced
  // (2026-10-10): the moment the user has anything of their own, the fan
  // belongs to them.
  const showTemplates = recentRenders.length === 0;

  const hasComments = pins.some((p) => p.comment.trim());
  const sendDisabled =
    creating ||
    !photoFile ||
    (mode === 'retouch' && !hasComments) ||
    (mode === 'add' && (!referenceFile || !prompt.trim()));
  const sendHint = !photoFile
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
      {/* The same layout as a project (owner, 2026-10-08): on the left the
          canvas with the command bar under it at the same width, on the right
          the materials sheet and the project tree — empty until the first
          render, which opens its project. min-w-0 so the column can shrink
          below its content's width on a narrow screen. */}
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
        <div className="flex items-center justify-end gap-2 px-5.5 pt-4 min-[900px]:hidden">
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="rounded-xl p-1.5"
            aria-label={`${mode === 'generate' ? t('app.materialsTitle') : t('edit.panelTitle')} · ${t('app.treeTitle')}`}
          >
            <Category set="curved" size={16} primaryColor="#8A8896" />
          </button>
        </div>
        {/* Same side padding as the command bar below it, as on a project. */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden px-2.5 pt-4 min-[640px]:px-5 min-[640px]:pt-5">
          <div className="mb-4">
            <h2 className="mb-1 font-[family-name:var(--font-display)] text-base font-semibold text-[#17161F]">
              {t('app.genHomeTitle')}
            </h2>
            <p className="text-[13px] text-[#8A8896]">{t('page.generateSubtitle')}</p>
          </div>
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
              <p className="max-w-[320px] text-[13px] text-[#8A8896]">
                {t('app.genHomeNoTierBody')}
              </p>
              <Link
                href="/app/tarifs"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] px-5 py-2.5 text-[13px] font-semibold text-white"
              >
                {t('app.genHomeChooseTier')}
              </Link>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* No drag-and-drop on the canvas (owner, 2026-10-08): images
                  come in through the command bar's paperclip. */}
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
                    // All or nothing: the templates show only while the account
                    // has no render of its own.
                    const key = showTemplates ? TEMPLATE_KEYS[i] : undefined;
                    if (key)
                      return (
                        <TemplateFanCard
                          key={key}
                          src={TEMPLATES[key].image}
                          label={TEMPLATES[key].label[locale]}
                          action={t('app.templateUse')}
                          index={i}
                          onUse={() => applyTemplate(key)}
                        />
                      );
                    return (
                      <EmptyFanCard key={`slot-${i}`} index={i} lead={i === recentRenders.length} />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {tier && (
          <CommandBar
            mode={mode}
            onModeChange={handleModeChange}
            // All three modes are open here: Commenter and Ajouter work
            // on the image pinned in the bar.
            editEnabled
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
            materials={[]}
            elementNodes={[]}
            onPickElement={() => {}}
            pickingElement={false}
            template={
              template
                ? {
                    label: TEMPLATES[template].label[locale],
                    image: TEMPLATES[template].image,
                    onClear: () => {
                      setTemplate(null);
                      setPrompt('');
                    },
                  }
                : null
            }
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
            fill
          />
        )}
      </main>

      <SideColumn
        mode={mode}
        materials={[]}
        onSaveMaterial={async () => {}}
        canEdit={Boolean(photoFile)}
        lockedHint={t('app.genHomeNeedPhoto')}
        referenceFile={referenceFile}
        onReferenceChange={setReferenceFile}
        pins={pins}
        onPinsChange={setPins}
        tree={[]}
        selectedId={null}
        onSelect={() => {}}
        onDelete={() => {}}
        mobileOpen={panelOpen}
        onMobileClose={() => setPanelOpen(false)}
      />
    </AppFrame>
  );
}
