'use client';

// Left rail — Krea-style mode switcher (Generate/Retouch/Add) with the
// existing render tree underneath, so both stay visible without an extra
// click (per the addendum spec). The active mode is the only place the red
// gradient appears here — the rail itself stays on the neutral surface
// color, never a gradient background.
import { Image as ImageIcon, Edit, PaperPlus } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { RenderTreeNode } from '@/lib/server/render-tree';
import { ProjectTree } from './ProjectTree';
import type { AppMode } from './CommandBar';

const MODE_ICON = { generate: ImageIcon, retouch: Edit, add: PaperPlus } as const;
const MODE_LABEL_KEY = {
  generate: 'app.modeGenerate',
  retouch: 'app.modeRetouch',
  add: 'app.modeAdd',
} as const;

export function ModeSidebar({
  mode,
  onModeChange,
  tree,
  selectedId,
  onSelectNode,
}: {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  tree: RenderTreeNode[];
  selectedId: string | null;
  onSelectNode: (id: string) => void;
}) {
  const t = useTranslations();

  return (
    <>
      <div className="mb-4 flex flex-col gap-1">
        {(['generate', 'retouch', 'add'] as const).map((m) => {
          const Icon = MODE_ICON[m];
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
                active
                  ? 'bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] text-white'
                  : 'text-[#17161F] hover:bg-[#F1F0F6]'
              }`}
            >
              <Icon set="bold" size={16} primaryColor={active ? '#ffffff' : '#8A8896'} />
              {t(MODE_LABEL_KEY[m])}
            </button>
          );
        })}
      </div>

      <div className="mb-2 h-px bg-[#ECECF2]" />

      <h3 className="mb-3.5 mt-3 font-[family-name:var(--font-general-sans)] text-[11px] uppercase tracking-wide text-[#8A8896]">
        {t('app.treeTitle')}
      </h3>
      <ProjectTree tree={tree} selectedId={selectedId} onSelect={onSelectNode} />
    </>
  );
}
