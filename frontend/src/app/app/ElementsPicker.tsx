'use client';

// "Elements" — pick an image already in this project as the reference for an
// add-element edit, instead of finding the file on disk and uploading it
// again.
//
// The reference for "add an element" was upload-only: every time you wanted
// the same chair, the same car, the same tree in another render, you went
// back to the file picker. Every one of those images is already in the
// project, already uploaded, already served.
//
// No new API surface. The chosen node's bytes come back through
// `/api/render-nodes/[id]/image` — the authenticated proxy that already
// gates every image in this app on project ownership — and are handed to the
// existing flow as a File. Downstream, an element picked here and an element
// dragged from the desktop are the same thing, which is why the edit route
// needed no change at all.
import { useEffect, useRef, useState } from 'react';
import { CHIP_BASE } from './chip';
import type { RenderTreeNode } from '@/lib/server/render-tree';
import { useTranslations } from '@/lib/i18n/LocaleContext';

export function ElementsPicker({
  nodes,
  onPick,
  disabled,
  busy,
}: {
  /** Flattened project tree — every node is a candidate reference. */
  nodes: RenderTreeNode[];
  onPick: (nodeId: string) => void;
  disabled: boolean;
  /** True while the picked node's bytes are being fetched. */
  busy: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside click and on Escape — the two ways anyone expects to
  // close a popover, and the reason the project dialogs elsewhere still owe
  // this same treatment.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (nodes.length === 0) return null;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={CHIP_BASE}
      >
        <span aria-hidden className="text-[#8A8896]">
          @
        </span>
        {t('app.elementsChip')}
      </button>

      {open && (
        // Opens upward: the command bar is pinned to the bottom of the
        // workspace, so a menu below it would open off-screen.
        <div className="absolute bottom-[calc(100%+10px)] left-0 z-20 w-[268px] rounded-2xl border border-[#ECECF2] bg-white p-2.5 shadow-[0_20px_40px_-16px_#17161F30]">
          <p className="mb-2 px-1 text-[11.5px] text-[#8A8896]">{t('app.elementsHint')}</p>
          <div className="grid max-h-[220px] grid-cols-3 gap-1.5 overflow-y-auto">
            {nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => {
                  onPick(node.id);
                  setOpen(false);
                }}
                className="aspect-square overflow-hidden rounded-[10px] border border-[#ECECF2] transition-colors hover:border-[#716FFF]"
              >
                <img
                  src={`/api/render-nodes/${node.id}/image`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
