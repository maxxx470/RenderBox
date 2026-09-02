'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getCsrfTokenForUpload } from '@/lib/csrf-client';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { LanguageInlineSwitch } from '@/components/LanguageToggle';
import type { RenderTreeNode } from '@/lib/server/render-tree';
import { PRESETS, isPresetKey, type PresetKey } from '@/lib/server/generation/presets';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import type { PricingTierId } from '@/lib/pricing-tiers';
import { Category, Filter2, Download, Upload } from 'react-iconly';
import { ModeSidebar } from './ModeSidebar';
import { ACCEPTED_UPLOAD_TYPES, Dropzone } from './Dropzone';
import { MaterialsPanel, type MaterialRow } from './MaterialsPanel';
import { EditPanel } from './EditPanel';
import { CommandBar, type AppMode } from './CommandBar';

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
  quotaRemaining: number | null;
}

// handleEditSubmit posts via raw fetch (FormData), not the api() wrapper, so
// it needs its own tiny error type to carry the backend's stable `error`
// code through to the catch block below (mirrors what ApiError.code does
// for every other call site — see lib/api.ts).
class EditRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

interface Zone {
  x: number;
  y: number;
  width: number;
  height: number;
}

const EDIT_TYPE: Record<Extract<AppMode, 'retouch' | 'add'>, 'targeted_retouch' | 'add_element'> = {
  retouch: 'targeted_retouch',
  add: 'add_element',
};

function flattenTree(nodes: RenderTreeNode[]): RenderTreeNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

export function AppShell({
  initialProjectId,
  initialProjectName,
  initialTree,
  authDisabled = false,
  initialTier,
  initialMax,
  initialRemaining,
}: {
  initialProjectId: string;
  initialProjectName: string;
  initialTree: RenderTreeNode[];
  authDisabled?: boolean;
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
  const [selectedId, setSelectedId] = useState<string | null>(initialTree[0]?.id ?? null);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
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
  const [engine, setEngine] = useState<EngineName>('nanobanana');
  const [mode, setMode] = useState<AppMode>('generate');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [variantCount, setVariantCount] = useState(3);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  // Updated in place after each successful generate/edit (via the route's
  // quotaRemaining field) so the display never needs a full page reload.
  const [tier] = useState(initialTier);
  const [max] = useState(initialMax);
  const [remaining, setRemaining] = useState(initialRemaining);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  // dragenter/dragleave also fire when the pointer crosses into a child (the
  // badges, the download button), so a plain boolean flickers. Counting
  // enter/leave pairs keeps the overlay stable until the drag really exits.
  const fileDragDepth = useRef(0);

  useEffect(() => {
    const paramEngine = searchParams.get('engine');
    if (paramEngine === 'nanobanana' || paramEngine === 'gpt_image') {
      setEngine(paramEngine);
    } else if (user?.defaultEngine === 'nanobanana' || user?.defaultEngine === 'gpt_image') {
      setEngine(user.defaultEngine);
    }
  }, [user?.defaultEngine, searchParams]);

  function handleEngineChange(next: EngineName) {
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
    // Each mode has its own submission shape — drop the previous mode's
    // draft input so switching never silently carries state across.
    setPrompt('');
    setZone(null);
    setReferenceFile(null);
  }

  const refreshMaterials = useCallback(async (id: string) => {
    try {
      const res = await api<{ materials: MaterialRow[] }>(`/api/projects/${id}/materials`);
      setMaterials(res.materials);
    } catch {
      // Non-fatal — the panel just stays at its previous state.
    }
  }, []);

  useEffect(() => {
    void refreshMaterials(projectId);
  }, [projectId, refreshMaterials]);

  // A new selection means a new image context — a zone or reference drawn
  // against the previous render no longer applies.
  useEffect(() => {
    setZone(null);
    setReferenceFile(null);
  }, [selectedId]);

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
      if (!res.ok) throw new Error('upload failed');
      const node = (await res.json()) as UploadResponse;
      const asTreeNode: RenderTreeNode = { ...node, children: [] };
      setTree((prev) => [...prev, asTreeNode]);
      setSelectedId(node.id);
    } catch {
      toast(t('app.uploadError'), 'error');
    } finally {
      setUploading(false);
    }
  }

  // Only react to an OS file drag — dragging the selected render around, or text
  // from elsewhere in the page, must not arm the drop overlay.
  function isFileDrag(e: React.DragEvent): boolean {
    return Array.from(e.dataTransfer.types).includes('Files');
  }

  function handleCanvasDragEnter(e: React.DragEvent) {
    if (!isFileDrag(e)) return;
    fileDragDepth.current += 1;
    setFileDragOver(true);
  }

  function handleCanvasDragOver(e: React.DragEvent) {
    if (!isFileDrag(e)) return;
    // Without preventDefault the browser refuses the drop and opens the file.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function handleCanvasDragLeave(e: React.DragEvent) {
    if (!isFileDrag(e)) return;
    fileDragDepth.current = Math.max(0, fileDragDepth.current - 1);
    if (fileDragDepth.current === 0) setFileDragOver(false);
  }

  function handleCanvasDrop(e: React.DragEvent) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    fileDragDepth.current = 0;
    setFileDragOver(false);
    if (uploading) return;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!ACCEPTED_UPLOAD_TYPES.includes(file.type)) {
      toast(t('app.uploadTypeError'), 'error');
      return;
    }
    void handleFile(file);
  }

  async function handleGenerate() {
    if (!selectedId) return;
    setGenerating(true);
    try {
      const res = await api<GenerateResponse>(`/api/projects/${projectId}/generate`, {
        method: 'POST',
        body: {
          sourceNodeId: selectedId,
          preset,
          engine,
          customPrompt: prompt.trim() || undefined,
        },
      });
      setTree(res.tree);
      setSelectedId(res.nodeId);
      setPrompt('');
      setRemaining(res.quotaRemaining);
      if (res.materialsDetected) void refreshMaterials(projectId);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NO_ACTIVE_TIER') {
        toast(t('app.noActiveTierError'), 'error');
      } else if (err instanceof ApiError && err.code === 'QUOTA_EXCEEDED') {
        toast(t('app.quotaExceededError'), 'error');
      } else {
        toast(t('app.generateError'), 'error');
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleEditSubmit() {
    if (mode === 'generate' || !selectedNode || selectedNode.kind !== 'GENERATED') return;
    if (!prompt.trim()) return;
    if (mode === 'add' && !referenceFile) return;
    if (mode === 'retouch' && (!zone || zone.width < 1 || zone.height < 1)) return;

    setSubmittingEdit(true);
    try {
      const form = new FormData();
      form.append('sourceNodeId', selectedNode.id);
      form.append('editType', EDIT_TYPE[mode]);
      form.append('instruction', prompt.trim());
      form.append('variantCount', String(variantCount));
      form.append('engine', engine);
      if (mode === 'retouch' && zone) form.append('zone', JSON.stringify(zone));
      if (mode === 'add' && referenceFile) form.append('referenceImage', referenceFile);

      const csrf = getCsrfTokenForUpload();
      const res = await fetch(`/api/projects/${projectId}/edit`, {
        method: 'POST',
        body: form,
        credentials: 'include',
        headers: csrf ? { 'x-csrf-token': csrf } : {},
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new EditRequestError(body.error ?? '');
      }
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
      setZone(null);
      setReferenceFile(null);
      setRemaining(data.quotaRemaining);
    } catch (err) {
      if (err instanceof EditRequestError && err.code === 'NO_ACTIVE_TIER') {
        toast(t('app.noActiveTierError'), 'error');
      } else if (err instanceof EditRequestError && err.code === 'QUOTA_EXCEEDED') {
        toast(t('app.quotaExceededError'), 'error');
      } else {
        toast(t('edit.submitError'), 'error');
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

  function pctFromEvent(e: React.MouseEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (mode !== 'retouch') return;
    const p = pctFromEvent(e);
    dragStart.current = p;
    setZone({ x: p.x, y: p.y, width: 0, height: 0 });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragStart.current) return;
    const p = pctFromEvent(e);
    const start = dragStart.current;
    setZone({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      width: Math.abs(p.x - start.x),
      height: Math.abs(p.y - start.y),
    });
  }

  function handleMouseUp() {
    dragStart.current = null;
  }

  const hasNodes = tree.length > 0;
  const flat = flattenTree(tree);
  const selectedNode = flat.find((n) => n.id === selectedId) ?? null;
  const parentNode = selectedNode?.parentId
    ? (flat.find((n) => n.id === selectedNode.parentId) ?? null)
    : null;
  const canEdit = mode !== 'generate' && selectedNode?.kind === 'GENERATED';
  const zoneSelected = Boolean(zone && zone.width > 0 && zone.height > 0);

  function nodeLabel(kind: string): string {
    return kind === 'GENERATED' ? t('app.nodeGenerated') : t('app.nodeUploaded');
  }

  const inputDisabled =
    mode === 'generate' ? !selectedId || generating || !tier : !canEdit || submittingEdit || !tier;
  const sendDisabled =
    mode === 'generate'
      ? !selectedId || generating || !tier
      : !canEdit ||
        submittingEdit ||
        !tier ||
        !prompt.trim() ||
        (mode === 'add' ? !referenceFile : !zoneSelected);

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ECECF2] px-5.5 py-3.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileTreeOpen(true)}
            className="rounded-lg border border-[#ECECF2] p-1.5 min-[900px]:hidden"
            aria-label={t('app.treeTitle')}
          >
            <Category set="bold" size={16} primaryColor="#8A8896" />
          </button>
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]" />
          <span className="font-[family-name:var(--font-general-sans)] text-[15px] font-semibold text-[#17161F]">
            RenderBox
          </span>
          <span className="rounded-2xl border border-[#ECECF2] bg-[#F7F7FA] px-3 py-1.5 font-[family-name:var(--font-jetbrains-mono)] text-xs text-[#8A8896]">
            {projectName}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <LanguageInlineSwitch />
          {authDisabled && (
            <span className="rounded-2xl bg-amber-100 px-2.5 py-1 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium text-amber-800">
              {tier && max !== null && remaining !== null
                ? t('app.authDisabledBannerCount', { remaining, max })
                : t('app.authDisabledBanner')}
            </span>
          )}
          <span className="rounded-2xl bg-[#716FFF12] px-2.5 py-1 font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-[#716FFF]">
            {t('app.phaseTag')}
          </span>
          {!authDisabled && (
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-[#8A8896]">
              {tier && max !== null && remaining !== null
                ? t('app.quotaLabel', { used: max - remaining, max })
                : t('app.noTierLabel')}
            </span>
          )}
          <button
            type="button"
            onClick={() => setMobilePanelOpen(true)}
            className="rounded-lg border border-[#ECECF2] p-1.5 min-[900px]:hidden"
            aria-label={mode === 'generate' ? t('app.materialsTitle') : t('edit.panelTitle')}
          >
            <Filter2 set="bold" size={16} primaryColor="#8A8896" />
          </button>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        {(mobileTreeOpen || mobilePanelOpen) && (
          <div
            className="fixed inset-0 z-10 bg-black/30 min-[900px]:hidden"
            onClick={() => {
              setMobileTreeOpen(false);
              setMobilePanelOpen(false);
            }}
          />
        )}

        <aside
          className={`${
            mobileTreeOpen ? 'flex' : 'hidden'
          } fixed inset-y-0 left-0 z-20 w-[230px] flex-col border-r border-[#ECECF2] bg-[#F7F7FA] px-3.5 py-4.5 min-[900px]:static min-[900px]:z-auto min-[900px]:flex`}
        >
          <ModeSidebar
            mode={mode}
            onModeChange={handleModeChange}
            tree={tree}
            selectedId={selectedId}
            onSelectNode={(id) => {
              setSelectedId(id);
              setMobileTreeOpen(false);
            }}
          />
        </aside>

        <section className="flex flex-1 flex-col overflow-hidden px-6.5 py-5.5">
          {!hasNodes ? (
            <>
              <div className="mb-4">
                <h2 className="mb-1 font-[family-name:var(--font-general-sans)] text-base font-semibold text-[#17161F]">
                  {t('app.viewerTitle')}
                </h2>
                <p className="text-[13px] text-[#8A8896]">{t('app.viewerSubtitle')}</p>
              </div>
              <Dropzone uploading={uploading} onFile={handleFile} />
            </>
          ) : (
            <>
              {selectedNode && (
                <div className="mb-4 font-[family-name:var(--font-jetbrains-mono)] text-xs text-[#8A8896]">
                  {parentNode && <>{nodeLabel(parentNode.kind)} → </>}
                  <b className="font-medium text-[#17161F]">{nodeLabel(selectedNode.kind)}</b>
                </div>
              )}
              <div
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onDragEnter={handleCanvasDragEnter}
                onDragOver={handleCanvasDragOver}
                onDragLeave={handleCanvasDragLeave}
                onDrop={handleCanvasDrop}
                className={`relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border bg-gradient-to-br from-[#EFECFF] to-[#F7F7FA] transition-colors duration-150 ease-out ${
                  fileDragOver ? 'border-[#716FFF]' : 'border-[#ECECF2]'
                } ${mode === 'retouch' ? 'cursor-crosshair select-none' : ''}`}
              >
                {selectedId && (
                  <>
                    <span className="absolute left-3.5 top-3.5 rounded-2xl border border-[#ECECF2] bg-white px-2.5 py-1 font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-[#8A8896]">
                      {selectedNode?.preset
                        ? t('app.canvasPresetBadge', {
                            preset: PRESETS[selectedNode.preset as PresetKey].label[locale],
                            engine:
                              ENGINE_LABELS[(selectedNode.engine as EngineName) || 'nanobanana']
                                .name,
                          })
                        : t('app.engineTag')}
                    </span>
                    {selectedNode?.kind === 'GENERATED' && materials.length > 0 && (
                      <span className="absolute bottom-3.5 left-3.5 flex items-center gap-1.5 rounded-2xl bg-[#1E7A3D14] px-3 py-1.5 font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-[#1E7A3D]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#1E7A3D]" />
                        {t('app.scanBadge', { n: materials.length })}
                      </span>
                    )}
                    {/* Served by our own authenticated proxy route, not a static asset. */}
                    <img
                      src={`/api/render-nodes/${selectedId}/image`}
                      alt=""
                      draggable={false}
                      className="pointer-events-none max-h-full max-w-full object-contain"
                    />
                    <a
                      href={`/api/render-nodes/${selectedId}/image`}
                      download
                      onMouseDown={(e) => e.stopPropagation()}
                      aria-label={t('app.downloadButton')}
                      title={t('app.downloadButton')}
                      className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full border border-[#ECECF2] bg-white text-[#17161F] shadow-[0_4px_14px_-6px_rgba(23,22,31,0.25)] transition-transform duration-150 ease-out hover:-translate-y-0.5 active:scale-[0.95]"
                    >
                      <Download set="bold" size={15} primaryColor="#17161F" />
                    </a>
                    {mode === 'retouch' && zone && (zone.width > 0 || zone.height > 0) && (
                      <div
                        className="absolute rounded-md border-2 border-dashed border-[#716FFF] bg-[#716FFF12]"
                        style={{
                          left: `${zone.x}%`,
                          top: `${zone.y}%`,
                          width: `${zone.width}%`,
                          height: `${zone.height}%`,
                        }}
                      >
                        <span className="absolute -top-6 left-0 whitespace-nowrap rounded-md bg-[#716FFF] px-2 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-white">
                          {t('edit.zoneLabel')}
                        </span>
                      </div>
                    )}
                  </>
                )}
                {/* pointer-events-none so the overlay never becomes the drag
                    target itself, which would unbalance the enter/leave count. */}
                {fileDragOver && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-[#716FFF] bg-[#EFECFFF2] px-6">
                    <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]">
                      <Upload set="bold" size={24} primaryColor="#ffffff" />
                    </div>
                    <h3 className="font-[family-name:var(--font-general-sans)] text-[15px] font-semibold text-[#17161F]">
                      {t('app.canvasDropTitle')}
                    </h3>
                    <p className="max-w-[280px] text-center text-[13px] text-[#8A8896]">
                      {t('app.canvasDropHint')}
                    </p>
                  </div>
                )}
                {uploading && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#FFFFFFD9]">
                    <span className="rounded-2xl border border-[#ECECF2] bg-white px-4 py-2 font-[family-name:var(--font-jetbrains-mono)] text-[12px] text-[#17161F] shadow-[0_4px_14px_-6px_rgba(23,22,31,0.25)]">
                      {t('app.uploading')}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        <div
          className={`${
            mobilePanelOpen ? 'block' : 'hidden'
          } fixed inset-y-0 right-0 z-20 min-[900px]:static min-[900px]:z-auto min-[900px]:block`}
        >
          {mode === 'generate' ? (
            <MaterialsPanel materials={materials} onSave={handleSaveMaterial} />
          ) : (
            <EditPanel
              mode={mode}
              canEdit={canEdit}
              referenceFile={referenceFile}
              onReferenceChange={setReferenceFile}
              variantCount={variantCount}
              onVariantCountChange={setVariantCount}
            />
          )}
        </div>
      </div>

      <CommandBar
        mode={mode}
        prompt={prompt}
        onPromptChange={setPrompt}
        preset={preset}
        onPresetChange={setPreset}
        zoneSelected={zoneSelected}
        referenceAdded={Boolean(referenceFile)}
        onSubmit={handleSubmit}
        inputDisabled={inputDisabled}
        sendDisabled={sendDisabled}
        generating={generating || submittingEdit}
        engine={engine}
        onEngineChange={handleEngineChange}
        onUploadFile={handleFile}
        uploading={uploading}
      />
    </div>
  );
}
