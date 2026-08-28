'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { getCsrfTokenForUpload } from '@/lib/csrf-client';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import type { RenderTreeNode } from '@/lib/server/render-tree';
import { PRESETS, type PresetKey } from '@/lib/server/generation/presets';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';
import { Category, Filter2 } from 'react-iconly';
import { ModeSidebar } from './ModeSidebar';
import { Dropzone } from './Dropzone';
import { MaterialsPanel, type MaterialRow } from './MaterialsPanel';
import { EditPanel } from './EditPanel';
import { CommandBar, type AppMode } from './CommandBar';
import { EngineSelect } from './EngineSelect';

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
}

interface EditResponse {
  tree: RenderTreeNode[];
  nodeIds: string[];
  requestedCount: number;
  createdCount: number;
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
  devBypassActive = false,
}: {
  initialProjectId: string;
  initialProjectName: string;
  initialTree: RenderTreeNode[];
  devBypassActive?: boolean;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const { toast } = useToast();
  const { user } = useAuth();

  const projectId = initialProjectId;
  const projectName = initialProjectName;

  const [tree, setTree] = useState<RenderTreeNode[]>(initialTree);
  const [selectedId, setSelectedId] = useState<string | null>(initialTree[0]?.id ?? null);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [preset, setPreset] = useState<PresetKey>('jour_ext');
  const [engine, setEngine] = useState<EngineName>('nanobanana');
  const [mode, setMode] = useState<AppMode>('generate');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [variantCount, setVariantCount] = useState(3);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (user?.defaultEngine === 'nanobanana' || user?.defaultEngine === 'gpt_image') {
      setEngine(user.defaultEngine);
    }
  }, [user?.defaultEngine]);

  function handleEngineChange(next: EngineName) {
    setEngine(next);
    void api('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ defaultEngine: next }),
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
      if (res.materialsDetected) void refreshMaterials(projectId);
    } catch {
      toast(t('app.generateError'), 'error');
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
      if (!res.ok) throw new Error('edit failed');
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
    } catch {
      toast(t('edit.submitError'), 'error');
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
    mode === 'generate' ? !selectedId || generating : !canEdit || submittingEdit;
  const sendDisabled =
    mode === 'generate'
      ? !selectedId || generating
      : !canEdit ||
        submittingEdit ||
        !prompt.trim() ||
        (mode === 'add' ? !referenceFile : !zoneSelected);

  return (
    <div className="flex h-screen flex-col bg-white">
      <LanguageToggle />
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ECE3E5] px-5.5 py-3.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileTreeOpen(true)}
            className="rounded-lg border border-[#ECE3E5] p-1.5 min-[900px]:hidden"
            aria-label={t('app.treeTitle')}
          >
            <Category set="bold" size={16} primaryColor="#7A6E71" />
          </button>
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#E8121F] to-[#7F0000]" />
          <span className="font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[#170608]">
            RenderBox
          </span>
          <span className="rounded-2xl border border-[#ECE3E5] bg-[#F8F5F6] px-3 py-1.5 font-[family-name:var(--font-ibm-plex-mono)] text-xs text-[#7A6E71]">
            {projectName}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {devBypassActive && (
            <span className="rounded-2xl bg-amber-100 px-2.5 py-1 font-[family-name:var(--font-ibm-plex-mono)] text-[10px] font-medium text-amber-800">
              {t('app.devBypassBadge')}
            </span>
          )}
          <span className="rounded-2xl bg-[#C8112012] px-2.5 py-1 font-[family-name:var(--font-ibm-plex-mono)] text-[10px] text-[#C81120]">
            {t('app.phaseTag')}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#7A6E71]">{t('app.engineLabel')} :</span>
            <EngineSelect engine={engine} onChange={handleEngineChange} />
          </div>
          <button
            type="button"
            onClick={() => setMobilePanelOpen(true)}
            className="rounded-lg border border-[#ECE3E5] p-1.5 min-[900px]:hidden"
            aria-label={mode === 'generate' ? t('app.materialsTitle') : t('edit.panelTitle')}
          >
            <Filter2 set="bold" size={16} primaryColor="#7A6E71" />
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
          } fixed inset-y-0 left-0 z-20 w-[230px] flex-col border-r border-[#ECE3E5] bg-[#F8F5F6] px-3.5 py-4.5 min-[900px]:static min-[900px]:z-auto min-[900px]:flex`}
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
                <h2 className="mb-1 font-[family-name:var(--font-poppins)] text-base font-semibold text-[#170608]">
                  {t('app.viewerTitle')}
                </h2>
                <p className="text-[13px] text-[#7A6E71]">{t('app.viewerSubtitle')}</p>
              </div>
              <Dropzone uploading={uploading} onFile={handleFile} />
            </>
          ) : (
            <>
              {selectedNode && (
                <div className="mb-4 font-[family-name:var(--font-ibm-plex-mono)] text-xs text-[#7A6E71]">
                  {parentNode && <>{nodeLabel(parentNode.kind)} → </>}
                  <b className="font-medium text-[#170608]">{nodeLabel(selectedNode.kind)}</b>
                </div>
              )}
              <div
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className={`relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-[#ECE3E5] bg-gradient-to-br from-[#FBEDEE] to-[#F8F5F6] ${
                  mode === 'retouch' ? 'cursor-crosshair select-none' : ''
                }`}
              >
                {selectedId && (
                  <>
                    <span className="absolute left-3.5 top-3.5 rounded-2xl border border-[#ECE3E5] bg-white px-2.5 py-1 font-[family-name:var(--font-ibm-plex-mono)] text-[11px] text-[#7A6E71]">
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
                      <span className="absolute bottom-3.5 left-3.5 flex items-center gap-1.5 rounded-2xl bg-[#1E7A3D14] px-3 py-1.5 font-[family-name:var(--font-ibm-plex-mono)] text-[11px] text-[#1E7A3D]">
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
                    {mode === 'retouch' && zone && (zone.width > 0 || zone.height > 0) && (
                      <div
                        className="absolute rounded-md border-2 border-dashed border-[#C81120] bg-[#C8112012]"
                        style={{
                          left: `${zone.x}%`,
                          top: `${zone.y}%`,
                          width: `${zone.width}%`,
                          height: `${zone.height}%`,
                        }}
                      >
                        <span className="absolute -top-6 left-0 whitespace-nowrap rounded-md bg-[#C81120] px-2 py-0.5 font-[family-name:var(--font-ibm-plex-mono)] text-[10px] text-white">
                          {t('edit.zoneLabel')}
                        </span>
                      </div>
                    )}
                  </>
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
      />
    </div>
  );
}
