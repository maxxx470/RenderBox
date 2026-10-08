'use client';

// The right column of the image workspace (owner, 2026-10-08) — the same on
// a project (/app/[projet]) and on the Image page (/app/generer): one
// vertical white card the full height, the materials sheet on top (the edit
// panel while Commenter / Ajouter is on), the project tree under it. A drawer
// from the right below 900px, opened by the page's own button.
import type { RenderTreeNode } from '@/lib/server/render-tree';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { AppMode } from './CommandBar';
import type { Pin } from './AnnotationLayer';
import { EditPanel } from './EditPanel';
import { MaterialsPanel, type MaterialRow } from './MaterialsPanel';
import { MOBILE_NAV_PAD } from './MobileNav';
import { ProjectTree } from './ProjectTree';

export function SideColumn({
  mode,
  materials,
  onSaveMaterial,
  canEdit,
  lockedHint,
  referenceFile,
  onReferenceChange,
  pins,
  onPinsChange,
  tree,
  selectedId,
  onSelect,
  onDelete,
  mobileOpen,
  onMobileClose,
}: {
  mode: AppMode;
  materials: MaterialRow[];
  onSaveMaterial: (id: string, valeur: string) => Promise<void>;
  canEdit: boolean;
  /** Why the edit panel is locked, while canEdit is false. */
  lockedHint: string;
  referenceFile: File | null;
  onReferenceChange: (file: File | null) => void;
  pins: Pin[];
  onPinsChange: (pins: Pin[]) => void;
  tree: RenderTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (node: RenderTreeNode) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const t = useTranslations();

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 min-[900px]:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}
      <div
        className={`${
          mobileOpen ? 'flex' : 'hidden'
        } fixed bottom-0 right-0 top-16 z-[35] w-[300px] flex-col overflow-hidden bg-white ${MOBILE_NAV_PAD} min-[900px]:static min-[900px]:z-auto min-[900px]:my-3 min-[900px]:mr-3 min-[900px]:flex min-[900px]:flex-shrink-0 min-[900px]:rounded-[20px]`}
      >
        <div className="max-h-[55%] flex-shrink-0 overflow-y-auto">
          {mode === 'retouch' || mode === 'add' ? (
            <EditPanel
              mode={mode}
              canEdit={canEdit}
              lockedHint={lockedHint}
              referenceFile={referenceFile}
              onReferenceChange={onReferenceChange}
              pins={pins}
              onPinsChange={onPinsChange}
            />
          ) : (
            <MaterialsPanel materials={materials} onSave={onSaveMaterial} />
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-[#ECECF2] px-4 py-4.5">
          <h3 className="mb-3.5 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[#8A8896]">
            {t('app.treeTitle')}
          </h3>
          <ProjectTree
            tree={tree}
            selectedId={selectedId}
            onSelect={(id) => {
              onSelect(id);
              onMobileClose();
            }}
            onDelete={(node) => {
              onDelete(node);
              onMobileClose();
            }}
          />
        </div>
      </div>
    </>
  );
}
