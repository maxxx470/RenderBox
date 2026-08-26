'use client';

import { useRef, useState } from 'react';
import { getCsrfTokenForUpload } from '@/lib/csrf-client';
import { useToast } from '@/contexts/ToastContext';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { RenderTreeNode } from '@/lib/server/render-tree';
import { PRESETS, type PresetKey } from '@/lib/server/generation/presets';
import type { EngineName } from '@/lib/server/generation/engines/types';

export interface EditResponse {
  tree: RenderTreeNode[];
  nodeIds: string[];
  requestedCount: number;
  createdCount: number;
}

type EditTab = 'add_element' | 'targeted_retouch';
interface Zone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function EditModeView({
  projectId,
  sourceNode,
  engine,
  onClose,
  onSubmitted,
}: {
  projectId: string;
  sourceNode: RenderTreeNode;
  engine: EngineName;
  onClose: () => void;
  onSubmitted: (res: EditResponse) => void;
}) {
  const { locale, t } = useLocale();
  const { toast } = useToast();

  const [tab, setTab] = useState<EditTab>('add_element');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [instruction, setInstruction] = useState('');
  const [variantCount, setVariantCount] = useState(3);
  const [zone, setZone] = useState<Zone | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  function pctFromEvent(e: React.MouseEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (tab !== 'targeted_retouch') return;
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

  async function handleSubmit() {
    if (!instruction.trim()) return;
    if (tab === 'add_element' && !referenceFile) {
      toast(t('edit.referenceRequired'), 'error');
      return;
    }
    if (tab === 'targeted_retouch' && (!zone || zone.width < 1 || zone.height < 1)) {
      toast(t('edit.zoneRequired'), 'error');
      return;
    }

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('sourceNodeId', sourceNode.id);
      form.append('editType', tab);
      form.append('instruction', instruction.trim());
      form.append('variantCount', String(variantCount));
      form.append('engine', engine);
      if (tab === 'targeted_retouch' && zone) form.append('zone', JSON.stringify(zone));
      if (tab === 'add_element' && referenceFile) form.append('referenceImage', referenceFile);

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
      onSubmitted(data);
      onClose();
    } catch {
      toast(t('edit.submitError'), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const presetLabel = sourceNode.preset
    ? PRESETS[sourceNode.preset as PresetKey].label[locale]
    : '';

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex items-center justify-between border-b border-[#ECE3E5] px-5.5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#E8121F] to-[#7F0000]" />
          <span className="font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[#170608]">
            RenderBox
          </span>
        </div>
        <div className="flex items-center gap-3.5">
          <span className="rounded-2xl bg-[#C8112012] px-2.5 py-1 font-[family-name:var(--font-ibm-plex-mono)] text-[10px] text-[#C81120]">
            {t('app.phaseTag')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-[#7A6E71] hover:text-[#170608]"
          >
            {t('edit.closeButton')}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <section className="flex flex-1 flex-col px-6.5 py-5.5">
          <div className="mb-3.5 font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[#170608]">
            {t('edit.canvasTitle', { preset: presetLabel })}
          </div>
          <div
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="relative flex flex-1 select-none items-center justify-center overflow-hidden rounded-2xl border border-[#ECE3E5] bg-gradient-to-br from-[#FBEDEE] to-[#F8F5F6]"
          >
            <img
              src={`/api/render-nodes/${sourceNode.id}/image`}
              alt=""
              draggable={false}
              className="pointer-events-none max-h-full max-w-full object-contain"
            />
            {tab === 'targeted_retouch' && zone && (zone.width > 0 || zone.height > 0) && (
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
          </div>
        </section>

        <aside className="w-[320px] overflow-y-auto border-l border-[#ECE3E5] px-4.5 py-5">
          <h3 className="mb-1 font-[family-name:var(--font-poppins)] text-sm font-semibold text-[#170608]">
            {t('edit.panelTitle')}
          </h3>
          <p className="mb-4.5 text-xs leading-relaxed text-[#7A6E71]">{t('edit.panelSubtitle')}</p>

          <div className="mb-4.5 flex gap-1.5 rounded-xl bg-[#F8F5F6] p-1">
            <button
              type="button"
              onClick={() => setTab('add_element')}
              className={`flex-1 rounded-[9px] py-2 text-xs font-medium ${
                tab === 'add_element' ? 'bg-white text-[#170608] shadow-sm' : 'text-[#7A6E71]'
              }`}
            >
              {t('edit.tabAdd')}
            </button>
            <button
              type="button"
              onClick={() => setTab('targeted_retouch')}
              className={`flex-1 rounded-[9px] py-2 text-xs font-medium ${
                tab === 'targeted_retouch' ? 'bg-white text-[#170608] shadow-sm' : 'text-[#7A6E71]'
              }`}
            >
              {t('edit.tabRetouch')}
            </button>
          </div>

          {tab === 'add_element' ? (
            <>
              <span className="mb-2 block text-xs font-semibold text-[#170608]">
                {t('edit.referenceLabel')}
              </span>
              <label className="mb-4.5 block cursor-pointer rounded-xl border border-dashed border-[#ECE3E5] p-4.5 text-center text-xs text-[#7A6E71] hover:border-[#C81120]">
                <div className="mx-auto mb-2 h-[30px] w-[30px] rounded-lg bg-[#F1EBEC]" />
                {referenceFile ? referenceFile.name : t('edit.referenceHint')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => setReferenceFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </>
          ) : (
            <p className="mb-4.5 text-xs leading-relaxed text-[#7A6E71]">{t('edit.zoneHint')}</p>
          )}

          <span className="mb-2 block text-xs font-semibold text-[#170608]">
            {t('edit.instructionLabel')}
          </span>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={
              tab === 'add_element'
                ? t('edit.instructionPlaceholderAdd')
                : t('edit.instructionPlaceholderRetouch')
            }
            className="mb-4.5 h-[70px] w-full resize-none rounded-xl border border-[#ECE3E5] p-3 text-[13px] outline-none focus:border-[#C81120]"
          />

          <div className="mb-4.5 flex items-center justify-between rounded-xl bg-[#F8F5F6] px-3.5 py-3">
            <div>
              <div className="text-[12.5px] font-medium text-[#170608]">
                {t('edit.variantLabel')}
              </div>
              <div className="text-[10.5px] text-[#7A6E71]">{t('edit.variantSub')}</div>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setVariantCount((n) => Math.max(1, n - 1))}
                className="h-[26px] w-[26px] rounded-lg border border-[#ECE3E5] bg-white text-sm"
              >
                −
              </button>
              <span className="w-4 text-center font-[family-name:var(--font-ibm-plex-mono)] text-[13px]">
                {variantCount}
              </span>
              <button
                type="button"
                onClick={() => setVariantCount((n) => Math.min(4, n + 1))}
                className="h-[26px] w-[26px] rounded-lg border border-[#ECE3E5] bg-white text-sm"
              >
                +
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={submitting || !instruction.trim()}
            onClick={handleSubmit}
            className="w-full rounded-xl bg-gradient-to-br from-[#E8121F] to-[#7F0000] py-3.5 text-[13.5px] font-semibold text-white disabled:opacity-50"
          >
            {submitting ? t('edit.generating') : t('edit.generateButton', { n: variantCount })}
          </button>
          <p className="mt-2.5 text-center text-[10.5px] leading-relaxed text-[#7A6E71]">
            {t('edit.note')}
          </p>
        </aside>
      </div>
    </div>
  );
}
