'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { ProjectTree } from './ProjectTree';
import { Dropzone } from './Dropzone';
import { MaterialsPanel, type MaterialRow } from './MaterialsPanel';
import { CommandBar } from './CommandBar';
import { EditModeView, type EditResponse } from './EditModeView';

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

function flattenTree(nodes: RenderTreeNode[]): RenderTreeNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

export function AppShell({
  initialProjectId,
  initialProjectName,
  initialTree,
  devBypassActive = false,
}: {
  initialProjectId: string | null;
  initialProjectName: string | null;
  initialTree: RenderTreeNode[];
  devBypassActive?: boolean;
}) {
  const t = useTranslations();
  const { locale } = useLocale();
  const { toast } = useToast();
  const { user } = useAuth();

  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [projectName, setProjectName] = useState<string | null>(initialProjectName);
  const [tree, setTree] = useState<RenderTreeNode[]>(initialTree);
  const [selectedId, setSelectedId] = useState<string | null>(initialTree[0]?.id ?? null);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [preset, setPreset] = useState<PresetKey>('jour_ext');
  const [engine, setEngine] = useState<EngineName>('nanobanana');
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  // Phase 6 responsive — below 900px the tree + materials columns become
  // overlay drawers instead of always-visible columns (D-06 spec 6).
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [mobileMaterialsOpen, setMobileMaterialsOpen] = useState(false);

  // Phase 6 — engine preference now lives on User.defaultEngine (was a
  // localStorage-only preference pre-Phase-6, before /parametres existed
  // to back it with a real settings page). AuthContext's /api/auth/me
  // already fetches it, so just seed local state once the user loads.
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

  const refreshMaterials = useCallback(async (id: string) => {
    try {
      const res = await api<{ materials: MaterialRow[] }>(`/api/projects/${id}/materials`);
      setMaterials(res.materials);
    } catch {
      // Non-fatal — the panel just stays at its previous state.
    }
  }, []);

  useEffect(() => {
    if (projectId) void refreshMaterials(projectId);
  }, [projectId, refreshMaterials]);

  async function ensureProject(): Promise<string> {
    if (projectId) return projectId;
    const created = await api<{ id: string; name: string }>('/api/projects', {
      method: 'POST',
      body: { name: `Projet ${new Date().toLocaleDateString()}` },
    });
    setProjectId(created.id);
    setProjectName(created.name);
    return created.id;
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const id = await ensureProject();
      const form = new FormData();
      form.append('file', file);
      const csrf = getCsrfTokenForUpload();
      const res = await fetch(`/api/projects/${id}/upload`, {
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
    if (!projectId || !selectedId) return;
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

  function handleEditSubmitted(res: EditResponse) {
    setTree(res.tree);
    if (res.nodeIds[0]) setSelectedId(res.nodeIds[0]);
  }

  async function handleSaveMaterial(materialId: string, valeur: string) {
    if (!projectId) return;
    const material = await api<{ material: MaterialRow }>(
      `/api/projects/${projectId}/materials/${materialId}`,
      { method: 'PATCH', body: { valeur } },
    );
    setMaterials((prev) => prev.map((m) => (m.id === materialId ? material.material : m)));
  }

  const hasNodes = tree.length > 0;
  const flat = flattenTree(tree);
  const selectedNode = flat.find((n) => n.id === selectedId) ?? null;
  const parentNode = selectedNode?.parentId
    ? (flat.find((n) => n.id === selectedNode.parentId) ?? null)
    : null;

  function nodeLabel(kind: string): string {
    return kind === 'GENERATED' ? t('app.nodeGenerated') : t('app.nodeUploaded');
  }

  const editingNode = editingNodeId ? (flat.find((n) => n.id === editingNodeId) ?? null) : null;
  if (editingNode) {
    return (
      <EditModeView
        projectId={projectId!}
        sourceNode={editingNode}
        engine={engine}
        onClose={() => setEditingNodeId(null)}
        onSubmitted={handleEditSubmitted}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      <LanguageToggle />
      <header className="flex items-center justify-between border-b border-[#ECE3E5] px-5.5 py-3.5">
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
          <span className="rounded-2xl border border-[#ECE3E5] bg-[#F8F5F6] px-3 py-1.5 font-[family-name:var(--font-ibm-plex-mono)] text-xs text-[#7A6E71]">
            {projectName ?? t('app.newProject')}
          </span>
          <button
            type="button"
            onClick={() => setMobileMaterialsOpen(true)}
            className="rounded-lg border border-[#ECE3E5] p-1.5 min-[900px]:hidden"
            aria-label={t('app.materialsTitle')}
          >
            <Filter2 set="bold" size={16} primaryColor="#7A6E71" />
          </button>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        {(mobileTreeOpen || mobileMaterialsOpen) && (
          <div
            className="fixed inset-0 z-10 bg-black/30 min-[900px]:hidden"
            onClick={() => {
              setMobileTreeOpen(false);
              setMobileMaterialsOpen(false);
            }}
          />
        )}

        <aside
          className={`${
            mobileTreeOpen ? 'flex' : 'hidden'
          } fixed inset-y-0 left-0 z-20 w-[230px] flex-col border-r border-[#ECE3E5] bg-[#F8F5F6] px-3.5 py-4.5 min-[900px]:static min-[900px]:z-auto min-[900px]:flex`}
        >
          <h3 className="mb-3.5 font-[family-name:var(--font-poppins)] text-[11px] uppercase tracking-wide text-[#7A6E71]">
            {t('app.treeTitle')}
          </h3>
          <ProjectTree
            tree={tree}
            selectedId={selectedId}
            onSelect={(id) => {
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
              <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-[#ECE3E5] bg-gradient-to-br from-[#FBEDEE] to-[#F8F5F6]">
                {selectedId && (
                  <>
                    <span className="absolute left-3.5 top-3.5 rounded-2xl border border-[#ECE3E5] bg-white px-2.5 py-1 font-[family-name:var(--font-ibm-plex-mono)] text-[11px] text-[#7A6E71]">
                      {selectedNode?.preset
                        ? t('app.canvasPresetBadge', {
                            preset: PRESETS[selectedNode.preset as PresetKey].label[locale],
                            // Pre-Phase-4 GENERATED rows have no engine recorded —
                            // they were all produced by nanobanana (the only
                            // engine that existed then), so that's the accurate
                            // fallback rather than a generic placeholder.
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
                    {selectedNode?.kind === 'GENERATED' && (
                      <button
                        type="button"
                        onClick={() => setEditingNodeId(selectedNode.id)}
                        className="absolute right-3.5 top-3.5 rounded-2xl border border-[#ECE3E5] bg-white px-3 py-1.5 font-[family-name:var(--font-ibm-plex-mono)] text-[11px] text-[#170608] hover:border-[#C81120]"
                      >
                        {t('edit.enterButton')}
                      </button>
                    )}
                    {/* Served by our own authenticated proxy route, not a static asset. */}
                    <img
                      src={`/api/render-nodes/${selectedId}/image`}
                      alt=""
                      className="max-h-full max-w-full object-contain"
                    />
                  </>
                )}
              </div>
            </>
          )}
        </section>

        <div
          className={`${
            mobileMaterialsOpen ? 'block' : 'hidden'
          } fixed inset-y-0 right-0 z-20 min-[900px]:static min-[900px]:z-auto min-[900px]:block`}
        >
          <MaterialsPanel materials={materials} onSave={handleSaveMaterial} />
        </div>
      </div>

      <CommandBar
        prompt={prompt}
        onPromptChange={setPrompt}
        preset={preset}
        onPresetChange={setPreset}
        engine={engine}
        onEngineChange={handleEngineChange}
        onSubmit={handleGenerate}
        disabled={!selectedId || generating}
        generating={generating}
      />
    </div>
  );
}
