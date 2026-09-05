'use client';

// "@ Éléments" — pick an image already in this project as the reference for
// the next generation or edit, instead of finding the file on disk and
// uploading it again.
//
// The reference was upload-only: every time you wanted the same chair, the
// same car, the same tree in another render, you went back to the file
// picker. Every one of those images is already in the project, already
// uploaded, already served.
//
// No new API surface. The chosen node's bytes come back through
// `/api/render-nodes/[id]/image` — the authenticated proxy that already gates
// every image in this app on project ownership — and are handed to the
// existing flow as a File. Downstream, an element picked here and an element
// dragged from the desktop are the same thing, which is why the edit route
// needed no change at all.
//
// The chip is present in every mode and even with nothing to offer, matching
// the reference bar: a control that appears and disappears as the project
// fills up reads as an interface glitch, and the empty panel is where the
// user learns what the control is for.
import { ChevronUp, ChevronDown } from 'react-iconly';
import { CHIP_BASE } from './chip';
import type { RenderTreeNode } from '@/lib/server/render-tree';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { POPOVER_HEADING, popoverPanelClass, useHoverPopover } from './useHoverPopover';

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
  const { open, ref, toggle, closeNow, hoverProps } = useHoverPopover({
    disabled: disabled || busy,
  });

  return (
    <div className="relative" ref={ref} {...hoverProps}>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={CHIP_BASE}
      >
        <span aria-hidden className="text-[13px] leading-none text-[#8A8896]">
          @
        </span>
        {t('app.elementsChip')}
        <span className="flex-shrink-0">
          {open ? (
            <ChevronUp set="light" size={12} primaryColor="#8A8896" />
          ) : (
            <ChevronDown set="light" size={12} primaryColor="#8A8896" />
          )}
        </span>
      </button>

      {open && (
        // Opens upward: the command bar is pinned to the bottom of the
        // workspace, so a menu below it would open off-screen.
        <div className={`${popoverPanelClass({ placement: 'up' })} w-[272px]`}>
          <p className={POPOVER_HEADING}>{t('app.elementsChip')}</p>
          <p className="px-2 pb-2 text-[11.5px] leading-[1.5] text-[#8A8896]">
            {t('app.elementsHint')}
          </p>
          {nodes.length === 0 ? (
            <p className="rounded-[10px] bg-[#FBFBFD] px-2.5 py-3 text-[11.5px] leading-[1.5] text-[#8A8896]">
              {t('app.elementsEmpty')}
            </p>
          ) : (
            <div className="grid max-h-[220px] grid-cols-3 gap-1.5 overflow-y-auto p-1">
              {nodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => {
                    onPick(node.id);
                    closeNow();
                  }}
                  className="aspect-square overflow-hidden rounded-[10px] border border-[#ECECF2] transition-colors duration-150 ease-out hover:border-[#716FFF]"
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
          )}
        </div>
      )}
    </div>
  );
}
