'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getCsrfTokenForUpload } from '@/lib/csrf-client';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { collectBranch, type RenderTreeNode } from '@/lib/server/render-tree';
import { PRESETS, isPresetKey, type PresetKey } from '@/lib/server/generation/presets';
import { TEMPLATES, isTemplateKey, type TemplateKey } from '@/lib/server/generation/templates';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { isRatioKey, type RatioKey } from '@/lib/server/generation/ratios';
import {
  DEFAULT_RESOLUTION,
  isResolutionKey,
  type ResolutionKey,
} from '@/lib/server/generation/resolutions';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import type { PricingTierId } from '@/lib/pricing-tiers';
import { Category, Download, Swap } from 'react-iconly';
import { AppFrame } from './AppFrame';
import { MOBILE_NAV_PAD } from './MobileNav';
import { CARD_TRANSFORM, ExampleFanCard } from './fan';
import { EXAMPLE_RENDERS } from './generer-examples';
import { SideColumn } from './SideColumn';
import { nodeTitle } from './ProjectTree';
import type { MaterialRow } from './MaterialsPanel';
import { AnnotationLayer, drawMarkedImage, type Pin } from './AnnotationLayer';
import { ANNOTATE_ENGINE } from '@/lib/server/generation/annotations';
import { CommandBar, useObjectUrl, type AppMode, type PinnedImage } from './CommandBar';
import { RequestError, readErrorCode, isServiceNotConfigured } from './request-error';

interface UploadResponse {
  id: string;
  parentId: string | null;
  kind: string;
  createdAt: string;
}

interface GenerateResponse {
  tree: RenderTreeNode[];
  nodeId: string;
  materialsDetected: boolean;
  quotaRemaining: number | null;
}

interface EditResponse {
  tree: RenderTreeNode[];
  nodeIds: string[];
  requestedCount: number;
  createdCount: number;
  materialsDetected?: boolean;
  quotaRemaining: number | null;
}

// "retouch" in the UI is the point-and-comment mode since 2026-10-06 (it used
// to drag a rectangle — the route still accepts that shape as
// `targeted_retouch`, but nothing sends it any more).
const EDIT_TYPE: Record<Extract<AppMode, 'retouch' | 'add'>, 'annotate' | 'add_element'> = {
  retouch: 'annotate',
  add: 'add_element',
};

function flattenTree(nodes: RenderTreeNode[]): RenderTreeNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

export function AppShell({
  initialProjectId,
  initialProjectName,
  initialTree,
  initialMaterials,
  initialTier,
  initialMax,
  initialRemaining,
}: {
  initialProjectId: string;
  initialProjectName: string;
  initialTree: RenderTreeNode[];
  initialMaterials: MaterialRow[];
  initialTier: PricingTierId | null;
  initialMax: number | null;
  initialRemaining: number | null;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const { toast } = useToast();
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const projectId = initialProjectId;
  const projectName = initialProjectName;

  const [tree, setTree] = useState<RenderTreeNode[]>(initialTree);
  // ?node= opens on a given image — the generation space lands here on the
  // result of a Commenter/Ajouter it ran (see GenerationHome).
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const wanted = searchParams.get('node');
    if (wanted && flattenTree(initialTree).some((n) => n.id === wanted)) return wanted;
    return initialTree[0]?.id ?? null;
  });
  // Rendered with the page (see [projet]/page.tsx) — fetching them after
  // hydration added a whole extra round trip before the panel filled in.
  const [materials, setMaterials] = useState<MaterialRow[]>(initialMaterials);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Prefilled once from the /app home quick-start redirect (?prompt=&preset=&engine=),
  // if present — see GenerationHome.tsx's quickStart(). Lazy initializers run
  // only on the very first render, so this never re-applies on a later
  // client-side navigation within the same mounted instance.
  const [prompt, setPrompt] = useState(() => searchParams.get('prompt') ?? '');
  const [preset, setPreset] = useState<PresetKey>(() => {
    const p = searchParams.get('preset');
    return p && isPresetKey(p) ? p : 'jour_ext';
  });
  // A template from the image generator page (?template=), sent with the
  // first render and then dropped, like the prompt it filled.
  const [template, setTemplate] = useState<TemplateKey | null>(() => {
    const p = searchParams.get('template');
    return p && isTemplateKey(p) ? p : null;
  });
  const [engine, setEngine] = useState<EngineName>('nanobanana');
  const [mode, setMode] = useState<AppMode>('generate');
  // Carried over from the /app quick-start bar (?ratio=), like prompt/preset.
  const [ratio, setRatio] = useState<RatioKey>(() => {
    const r = searchParams.get('ratio');
    return r && isRatioKey(r) ? r : 'auto';
  });
  // Output size (1K / 2K / 4K), carried over from the generation space too.
  const [resolution, setResolution] = useState<ResolutionKey>(() => {
    const r = searchParams.get('resolution');
    return r && isResolutionKey(r) ? r : DEFAULT_RESOLUTION;
  });
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [pickingElement, setPickingElement] = useState(false);
  const referenceUrl = useObjectUrl(mode === 'add' ? referenceFile : null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [variantCount, setVariantCount] = useState(3);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  // Set only for failures that a plain retry could fix — a missing tier or an
  // exhausted quota would fail identically, so those stay a toast.
  const [retryable, setRetryable] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<RenderTreeNode | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [comparePos, setComparePos] = useState(50);
  const compareDragging = useRef(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  // Updated in place after each successful generate/edit (via the route's
  // quotaRemaining field) so the display never needs a full page reload.
  const [tier] = useState(initialTier);
  const [max] = useState(initialMax);
  const [remaining, setRemaining] = useState(initialRemaining);

  const canvasRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const paramEngine = searchParams.get('engine');
    if (paramEngine === 'nanobanana' || paramEngine === 'gpt_image') {
      setEngine(paramEngine);
    } else if (user?.defaultEngine === 'nanobanana' || user?.defaultEngine === 'gpt_image') {
      setEngine(user.defaultEngine);
    }
  }, [user?.defaultEngine, searchParams]);

  function handleEngineChange(next: EngineName) {
    // Both engines honour every ratio and size (2026-10-08): the choice stays.
    setEngine(next);
    void api('/api/users/me', {
      method: 'PATCH',
      body: { defaultEngine: next },
    }).catch(() => {
      // Non-fatal — the choice just won't persist across reloads/devices.
    });
  }

  function handleModeChange(next: AppMode) {
    setMode(next);
    // The retry would re-submit through the new mode's shape, not the one
    // that failed — the offer no longer means what it says.
    setRetryable(false);
    // Each mode has its own submission shape — drop the previous mode's
    // draft input so switching never silently carries state across.
    setPrompt('');
    setPins([]);
    setReferenceFile(null);
    setComparing(false);
    setTemplate(null);
  }

  const refreshMaterials = useCallback(async (id: string) => {
    try {
      const res = await api<{ materials: MaterialRow[] }>(`/api/projects/${id}/materials`);
      setMaterials(res.materials);
    } catch {
      // Non-fatal — the panel just stays at its previous state.
    }
  }, []);

  // A new selection means a new image context — comments or a reference placed
  // against the previous render no longer apply, and neither does an offer
  // to retry a request that targeted the previous node.
  useEffect(() => {
    setPins([]);
    setReferenceFile(null);
    setRetryable(false);
    // A different node means a different pair to compare — reopen it
    // deliberately rather than inheriting the previous comparison.
    setComparing(false);
    setComparePos(50);
  }, [selectedId]);

  const busy = generating || submittingEdit;

  // Generation runs for tens of seconds with nothing to stream, so the only
  // honest reassurance is the time actually spent — no fabricated percentage.
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const csrf = getCsrfTokenForUpload();
      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers: csrf ? { 'x-csrf-token': csrf } : {},
      });
      if (!res.ok) throw new RequestError(await readErrorCode(res));
      const node = (await res.json()) as UploadResponse;
      const asTreeNode: RenderTreeNode = { ...node, children: [] };
      setTree((prev) => [...prev, asTreeNode]);
      setSelectedId(node.id);
    } catch (err) {
      toast(
        t(isServiceNotConfigured(err) ? 'app.serviceNotConfigured' : 'app.uploadError'),
        'error',
      );
    } finally {
      setUploading(false);
    }
  }

  // "Elements": reuse an image already in this project as the add-element
  // reference, instead of hunting for the file on disk again.
  //
  // Deliberately no new API. The node's bytes come back through the same
  // authenticated proxy that renders every thumbnail on this screen — which
  // already refuses a node the caller does not own — and are handed to the
  // existing flow as a File. Downstream, an element picked here and one
  // dragged in from the desktop are indistinguishable, which is why the edit
  // route needed no change at all.
  async function handlePickElement(nodeId: string) {
    setPickingElement(true);
    try {
      const res = await fetch(`/api/render-nodes/${nodeId}/image`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png';
      setReferenceFile(new File([blob], `element-${nodeId}.${ext}`, { type: blob.type }));
    } catch {
      toast(t('app.elementsError'), 'error');
    } finally {
      setPickingElement(false);
    }
  }

  async function handleDeleteNode(node: RenderTreeNode) {
    setDeleting(true);
    try {
      const res = await api<{ tree: RenderTreeNode[] }>(`/api/render-nodes/${node.id}`, {
        method: 'DELETE',
      });
      setTree(res.tree);
      // The selection may have been inside the deleted branch; fall back to
      // whatever survived rather than leaving the canvas pointed at a 404.
      const survivors = flattenTree(res.tree);
      setSelectedId((prev) =>
        prev && survivors.some((n) => n.id === prev) ? prev : (survivors[0]?.id ?? null),
      );
      setPendingDelete(null);
    } catch {
      toast(t('app.treeDeleteError'), 'error');
    } finally {
      setDeleting(false);
    }
  }

  async function handleGenerate() {
    if (!selectedId) return;
    setGenerating(true);
    setRetryable(false);
    try {
      const res = await api<GenerateResponse>(`/api/projects/${projectId}/generate`, {
        method: 'POST',
        body: {
          sourceNodeId: selectedId,
          preset,
          engine,
          customPrompt: prompt.trim() || undefined,
          template: template ?? undefined,
          // 'auto' is the absence of a request, so it is not sent at all.
          ratio: ratio === 'auto' ? undefined : ratio,
          resolution,
        },
      });
      setTree(res.tree);
      setSelectedId(res.nodeId);
      setPrompt('');
      setTemplate(null);
      setRemaining(res.quotaRemaining);
      if (res.materialsDetected) void refreshMaterials(projectId);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NO_ACTIVE_TIER') {
        toast(t('app.noActiveTierError'), 'error');
      } else if (err instanceof ApiError && err.code === 'QUOTA_EXCEEDED') {
        toast(t('app.quotaExceededError'), 'error');
      } else if (isServiceNotConfigured(err)) {
        toast(t('app.serviceNotConfigured'), 'error');
      } else {
        toast(t('app.generateError'), 'error');
        setRetryable(true);
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleEditSubmit() {
    if (mode === 'generate' || !selectedNode) return;
    // In "Commenter" the comments carry the instructions; the bar's text is
    // an optional overall note.
    const notes = pins.filter((p) => p.comment.trim());
    if (mode === 'add' && (!prompt.trim() || !referenceFile)) return;
    if (mode === 'retouch' && notes.length === 0) return;

    setSubmittingEdit(true);
    setRetryable(false);
    try {
      const form = new FormData();
      form.append('sourceNodeId', selectedNode.id);
      form.append('editType', EDIT_TYPE[mode]);
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
        const marked = await drawMarkedImage(`/api/render-nodes/${selectedNode.id}/image`, notes);
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
      const data = (await res.json()) as EditResponse;
      if (data.createdCount < data.requestedCount) {
        toast(
          t('edit.partialSuccess', { created: data.createdCount, requested: data.requestedCount }),
          'error',
        );
      }
      setTree(data.tree);
      if (data.nodeIds[0]) setSelectedId(data.nodeIds[0]);
      setPrompt('');
      setPins([]);
      setReferenceFile(null);
      setRemaining(data.quotaRemaining);
      // A comment usually changed a material — the server re-read them.
      if (data.materialsDetected) void refreshMaterials(projectId);
    } catch (err) {
      if (err instanceof RequestError && err.code === 'NO_ACTIVE_TIER') {
        toast(t('app.noActiveTierError'), 'error');
      } else if (err instanceof RequestError && err.code === 'QUOTA_EXCEEDED') {
        toast(t('app.quotaExceededError'), 'error');
      } else if (isServiceNotConfigured(err)) {
        toast(t('app.serviceNotConfigured'), 'error');
      } else {
        toast(t('edit.submitError'), 'error');
        setRetryable(true);
      }
    } finally {
      setSubmittingEdit(false);
    }
  }

  function handleSubmit() {
    if (mode === 'generate') void handleGenerate();
    else void handleEditSubmit();
  }

  async function handleSaveMaterial(materialId: string, valeur: string) {
    const material = await api<{ material: MaterialRow }>(
      `/api/projects/${projectId}/materials/${materialId}`,
      { method: 'PATCH', body: { valeur } },
    );
    setMaterials((prev) => prev.map((m) => (m.id === materialId ? material.material : m)));
  }

  function comparePctFromClientX(clientX: number): number {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return comparePos;
    return Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
  }

  function handleComparePointerDown(e: React.PointerEvent) {
    compareDragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setComparePos(comparePctFromClientX(e.clientX));
  }

  function handleComparePointerMove(e: React.PointerEvent) {
    if (!compareDragging.current) return;
    setComparePos(comparePctFromClientX(e.clientX));
  }

  function handleComparePointerUp() {
    compareDragging.current = false;
  }

  const hasNodes = tree.length > 0;
  const flat = flattenTree(tree);
  const selectedNode = flat.find((n) => n.id === selectedId) ?? null;
  const parentNode = selectedNode?.parentId
    ? (flat.find((n) => n.id === selectedNode.parentId) ?? null)
    : null;
  // Any image can be commented on or added to — a render or the photo itself.
  const canEdit = mode !== 'generate' && Boolean(selectedNode);
  const hasComments = pins.some((p) => p.comment.trim());

  // Same wording as the rail rows — the breadcrumb names the very nodes the
  // tree lists, so the two must not use two vocabularies for one thing.
  function nodeLabel(node: RenderTreeNode): string {
    return nodeTitle(node, locale, t);
  }

  const inputDisabled =
    mode === 'generate' ? !selectedId || generating || !tier : !canEdit || submittingEdit || !tier;
  const sendDisabled =
    mode === 'generate'
      ? !selectedId || generating || !tier
      : !canEdit ||
        submittingEdit ||
        !tier ||
        (mode === 'add' ? !prompt.trim() || !referenceFile : !hasComments);

  // Names the FIRST missing thing, in the order the user would fix them.
  // The bar used to just dim its button and say nothing, so a blocked user had
  // no way to find out what the app was waiting for.
  const sendHint = !sendDisabled
    ? undefined
    : !tier
      ? t('app.hintNoTier')
      : mode === 'generate'
        ? !selectedId
          ? t('app.hintNoImage')
          : undefined
        : !canEdit
          ? t('app.modeSelectNodeHint')
          : mode === 'add' && !referenceFile
            ? t('edit.referenceRequired')
            : mode === 'retouch' && !hasComments
              ? t('edit.zoneRequired')
              : !prompt.trim()
                ? t('app.hintNoPrompt')
                : undefined;

  // The image the action starts from, then (Ajouter) the element to add.
  const pinned: PinnedImage[] = [];
  if (selectedId)
    pinned.push({
      key: 'source',
      src: `/api/render-nodes/${selectedId}/image`,
      caption: t('app.cmdSourceTag'),
    });
  if (referenceUrl)
    pinned.push({
      key: 'reference',
      src: referenceUrl,
      caption: t('app.cmdReferenceTag'),
      onRemove: () => setReferenceFile(null),
    });

  return (
    // Same frame as /app/generer: the shared rail runs the full height on the
    // left (logo, links, account card), and everything else — project bar,
    // canvas, command bar — lives in the column beside it.
    <AppFrame
      // A project is where images are made: the rail marks Image, not Projets
      // (owner, 2026-10-08 — Projets is a list, not a kind of generation).
      current="generate"
      topbar={{
        title: projectName,
        tier,
        quotaMax: max,
        quotaRemaining: remaining,
        userEmail: user?.email ?? '',
      }}
      onModeChange={handleModeChange}
    >
      <div className={`flex min-w-0 flex-1 flex-col overflow-hidden ${MOBILE_NAV_PAD}`}>
        <div className="flex items-center justify-end gap-2 px-5.5 pt-4 min-[900px]:hidden">
          <button
            type="button"
            onClick={() => setMobilePanelOpen(true)}
            className="rounded-xl p-1.5"
            // Below 900px the right column is a drawer: the sheet (or the
            // edit panel) and the project tree, as on a computer.
            aria-label={`${mode === 'generate' ? t('app.materialsTitle') : t('edit.panelTitle')} · ${t('app.treeTitle')}`}
          >
            <Category set="curved" size={16} primaryColor="#8A8896" />
          </button>
        </div>

        {/* Same side padding as the command bar below it, so the canvas and
            the bar line up edge to edge (owner, 2026-10-08). */}
        <section className="flex flex-1 flex-col overflow-hidden px-2.5 pt-4 min-[640px]:px-5 min-[640px]:pt-5">
          {!hasNodes ? (
            <>
              <div className="mb-4">
                <h2 className="mb-1 font-[family-name:var(--font-display)] text-base font-semibold text-[#17161F]">
                  {t('app.viewerTitle')}
                </h2>
                <p className="text-[13px] text-[#8A8896]">{t('app.viewerSubtitle')}</p>
              </div>
              {/* No drop zone and no drag-and-drop here (owner, 2026-10-08):
                  an image comes in through the command bar's paperclip. The
                  canvas shows the four example renders of the Image page. */}
              <div className="flex flex-1 items-center justify-center overflow-hidden pb-5">
                {EXAMPLE_RENDERS.slice(0, CARD_TRANSFORM.length).map((example, i) => (
                  <ExampleFanCard key={example.src} example={example} index={i} />
                ))}
              </div>
            </>
          ) : (
            <>
              {selectedNode && (
                <div className="mb-4 font-[family-name:var(--font-mono)] text-xs text-[#8A8896]">
                  {parentNode && <>{nodeLabel(parentNode)} → </>}
                  <b className="font-medium text-[#17161F]">{nodeLabel(selectedNode)}</b>
                </div>
              )}
              <div
                ref={canvasRef}
                className={`relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#EEF1FF] to-[#F7F7FA] ${
                  mode === 'retouch' ? 'select-none' : ''
                }`}
              >
                {selectedId && (
                  <>
                    <span className="absolute left-3.5 top-3.5 rounded-2xl bg-white px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11px] text-[#8A8896]">
                      {selectedNode?.preset
                        ? t('app.canvasPresetBadge', {
                            preset: PRESETS[selectedNode.preset as PresetKey].label[locale],
                            engine:
                              ENGINE_LABELS[(selectedNode.engine as EngineName) || 'nanobanana']
                                .name[locale],
                          })
                        : // No preset: a source photo, or a render made from a
                          // template — name the engine that made it, if any.
                          ENGINE_LABELS[(selectedNode?.engine as EngineName) || 'nanobanana'].name[
                            locale
                          ]}
                    </span>
                    {/* Hidden while comparing: the two image labels take that
                        corner then. */}
                    {selectedNode?.kind === 'GENERATED' && materials.length > 0 && !comparing && (
                      <span className="absolute bottom-3.5 left-3.5 flex items-center gap-1.5 rounded-2xl bg-[#EEF1FF] px-3 py-1.5 font-[family-name:var(--font-mono)] text-[11px] text-[#1E36D6]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#2948FC]" />
                        {t('app.scanBadge', { n: materials.length })}
                      </span>
                    )}
                    {/* Served by our own authenticated proxy route, not a static asset. */}
                    <img
                      ref={imgRef}
                      src={`/api/render-nodes/${selectedId}/image`}
                      alt=""
                      draggable={false}
                      className="pointer-events-none max-h-full max-w-full object-contain"
                    />

                    {/* "Commenter": numbered pins laid over the image itself. */}
                    {mode === 'retouch' && selectedNode && (
                      <AnnotationLayer
                        imgRef={imgRef}
                        pins={pins}
                        onChange={setPins}
                        disabled={submittingEdit || !tier}
                      />
                    )}

                    {/* Comparison layer: the parent image underneath, the
                        selected one clipped on top. Both are laid out in the
                        same box with object-contain, so the divider cuts
                        through matching geometry. */}
                    {comparing && parentNode && selectedNode && (
                      <>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <img
                            src={`/api/render-nodes/${parentNode.id}/image`}
                            alt=""
                            draggable={false}
                            className="pointer-events-none max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div
                          className="absolute inset-0 flex items-center justify-center"
                          style={{ clipPath: `inset(0 0 0 ${comparePos}%)` }}
                        >
                          <img
                            src={`/api/render-nodes/${selectedId}/image`}
                            alt=""
                            draggable={false}
                            className="pointer-events-none max-h-full max-w-full object-contain"
                          />
                        </div>
                        <span className="pointer-events-none absolute bottom-3.5 left-3.5 rounded-2xl bg-[#17161F] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[10px] text-white">
                          {nodeLabel(parentNode)}
                        </span>
                        <span className="pointer-events-none absolute bottom-3.5 right-3.5 rounded-2xl bg-[#17161F] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[10px] text-white">
                          {nodeLabel(selectedNode)}
                        </span>
                        <div
                          onPointerDown={handleComparePointerDown}
                          onPointerMove={handleComparePointerMove}
                          onPointerUp={handleComparePointerUp}
                          onPointerCancel={handleComparePointerUp}
                          className="absolute inset-0 cursor-ew-resize touch-none select-none"
                        />
                        <div
                          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)]"
                          style={{ left: `${comparePos}%` }}
                        >
                          <div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg bg-white shadow-[0_10px_26px_-6px_rgba(67,92,254,0.6)]">
                            <Swap set="curved" size={15} primaryColor="#2948FC" />
                          </div>
                        </div>
                      </>
                    )}

                    <div className="absolute right-3.5 top-3.5 flex items-center gap-2">
                      {/* Only in "generate": in the edit modes the canvas is a
                          working surface for the zone or the reference, and a
                          comparison overlay would fight that interaction. */}
                      {mode === 'generate' && parentNode && (
                        <button
                          type="button"
                          onClick={() => setComparing((v) => !v)}
                          aria-pressed={comparing}
                          aria-label={t('app.compareToggle')}
                          title={t('app.compareToggle')}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg border shadow-[0_4px_14px_-6px_rgba(23,22,31,0.25)] transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.95] ${
                            comparing
                              ? 'border-transparent bg-[#2948FC]'
                              : 'border-transparent bg-white'
                          }`}
                        >
                          <Swap
                            set="curved"
                            size={15}
                            primaryColor={comparing ? '#ffffff' : '#17161F'}
                          />
                        </button>
                      )}
                      <a
                        href={`/api/render-nodes/${selectedId}/image`}
                        download
                        onMouseDown={(e) => e.stopPropagation()}
                        aria-label={t('app.downloadButton')}
                        title={t('app.downloadButton')}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#17161F] shadow-[0_4px_14px_-6px_rgba(23,22,31,0.25)] transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.95]"
                      >
                        <Download set="curved" size={15} primaryColor="#17161F" />
                      </a>
                    </div>
                  </>
                )}
                {uploading && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#FFFFFFD9]">
                    <span className="rounded-2xl bg-white px-4 py-2 font-[family-name:var(--font-mono)] text-[12px] text-[#17161F] shadow-[0_4px_14px_-6px_rgba(23,22,31,0.25)]">
                      {t('app.uploading')}
                    </span>
                  </div>
                )}
                {busy && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#FFFFFFD9]">
                    <span className="rb-spin h-8 w-8 rounded-full border-2 border-[#ECECF2] border-t-[#2948FC]" />
                    <span className="font-[family-name:var(--font-display)] text-[13.5px] font-semibold text-[#17161F]">
                      {t('app.generatingOverlay')}
                    </span>
                    <span className="font-[family-name:var(--font-mono)] text-[11px] text-[#8A8896]">
                      {t('app.generatingElapsed', { s: elapsed })}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* Semantic error colour, never the blue brand accent. The inputs are
          already preserved on failure — this just says so, and offers the
          second attempt the toast could not. */}
        {retryable && !busy && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E5484D33] bg-[#E5484D0F] px-5.5 py-2.5">
            <span className="text-[12.5px] text-[#E5484D]">{t('app.retryBannerText')}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRetryable(false)}
                className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-[#8A8896] hover:text-[#17161F]"
              >
                {t('app.retryDismiss')}
              </button>
              <button
                type="button"
                disabled={sendDisabled}
                onClick={handleSubmit}
                className="rounded-lg bg-[#E5484D] px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
              >
                {t('app.retryButton')}
              </button>
            </div>
          </div>
        )}

        <CommandBar
          mode={mode}
          onModeChange={handleModeChange}
          editEnabled={Boolean(selectedNode)}
          editDisabledHint={t('app.modeSelectNodeHint')}
          ratio={ratio}
          onRatioChange={setRatio}
          resolution={resolution}
          onResolutionChange={setResolution}
          prompt={prompt}
          onPromptChange={setPrompt}
          preset={preset}
          onPresetChange={setPreset}
          zoneSelected={hasComments}
          referenceAdded={Boolean(referenceFile)}
          onSubmit={handleSubmit}
          inputDisabled={inputDisabled}
          sendDisabled={sendDisabled}
          sendHint={sendHint}
          submitLabel={
            mode === 'generate'
              ? t('app.submitGenerate')
              : mode === 'retouch'
                ? t('app.modeRetouch')
                : t('app.modeAdd')
          }
          generating={generating || submittingEdit}
          // "Commenter" always runs on Pixel IA — the chip says so and is locked.
          engine={mode === 'retouch' ? ANNOTATE_ENGINE : engine}
          onEngineChange={handleEngineChange}
          engineLocked={mode === 'retouch'}
          // Generate: a new photo. Ajouter: the element's reference. Commenter
          // comments on the image itself — nothing to attach.
          onAttach={mode === 'generate' ? handleFile : mode === 'add' ? setReferenceFile : null}
          attachTitle={mode === 'retouch' ? t('app.cmdAttachRetouch') : undefined}
          uploading={uploading}
          pinned={pinned}
          variantCount={variantCount}
          onVariantCountChange={setVariantCount}
          materials={materials}
          elementNodes={flattenTree(tree)}
          onPickElement={handlePickElement}
          pickingElement={pickingElement}
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
          fill
        />
      </div>

      <SideColumn
        mode={mode}
        materials={materials}
        onSaveMaterial={handleSaveMaterial}
        canEdit={canEdit}
        lockedHint={t('app.modeSelectNodeHint')}
        referenceFile={referenceFile}
        onReferenceChange={setReferenceFile}
        pins={pins}
        onPinsChange={setPins}
        tree={tree}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onDelete={setPendingDelete}
        mobileOpen={mobilePanelOpen}
        onMobileClose={() => setMobilePanelOpen(false)}
      />

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPendingDelete(null)} />
          <div className="relative w-full max-w-[380px] rounded-2xl bg-white p-5 shadow-[0_24px_48px_-20px_rgba(23,22,31,0.35)]">
            <h2 className="mb-2 font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F]">
              {t('app.treeDeleteTitle', { name: nodeLabel(pendingDelete) })}
            </h2>
            <p className="mb-4 text-[13px] leading-relaxed text-[#8A8896]">
              {/* Says the real count before anything is destroyed: deleting a
                  render takes everything derived from it, which is rarely
                  obvious from the row you clicked. */}
              {t('app.treeDeleteBody', {
                n: collectBranch(flat, pendingDelete.id).length,
              })}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-xl px-3.5 py-2 text-[13px] text-[#8A8896] hover:text-[#17161F]"
              >
                {t('projects.dialogCancel')}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDeleteNode(pendingDelete)}
                className="rounded-xl bg-[#E5484D] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {t('projects.deleteConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppFrame>
  );
}
