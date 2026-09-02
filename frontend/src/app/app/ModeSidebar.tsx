'use client';

// Left rail — Krea-style mode switcher (Generate/Retouch/Add) with the
// existing render tree underneath, so both stay visible without an extra
// click (per the addendum spec). The active mode is the only place the red
// gradient appears here — the rail itself stays on the neutral surface
// color, never a gradient background.
import { Image as ImageIcon, Edit, PaperPlus, ChevronLeft, ChevronRight } from 'react-iconly';
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
  onDeleteNode,
  collapsed,
  onToggleCollapse,
}: {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  tree: RenderTreeNode[];
  selectedId: string | null;
  onSelectNode: (id: string) => void;
  onDeleteNode: (node: RenderTreeNode) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const t = useTranslations();
  // Collapsing is a desktop affordance only — below 900px the rail is a
  // full-width drawer, so every collapse effect is gated at that breakpoint
  // and the mobile drawer keeps its labels whatever the stored preference.
  const hideOnCollapse = collapsed ? 'min-[900px]:hidden' : '';

  return (
    <>
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={t(collapsed ? 'app.sidebarExpand' : 'app.sidebarCollapse')}
        title={t(collapsed ? 'app.sidebarExpand' : 'app.sidebarCollapse')}
        className={`mb-3 hidden h-8 w-8 items-center justify-center rounded-lg border border-[#ECECF2] bg-white transition-colors hover:border-[#DEDEE8] min-[900px]:flex ${
          collapsed ? 'min-[900px]:self-center' : 'min-[900px]:self-end'
        }`}
      >
        {collapsed ? (
          <ChevronRight set="bold" size={15} primaryColor="#8A8896" />
        ) : (
          <ChevronLeft set="bold" size={15} primaryColor="#8A8896" />
        )}
      </button>

      <div className="mb-4 flex flex-col gap-1">
        {(['generate', 'retouch', 'add'] as const).map((m) => {
          const Icon = MODE_ICON[m];
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              {...(collapsed ? { title: t(MODE_LABEL_KEY[m]) } : {})}
              aria-label={t(MODE_LABEL_KEY[m])}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
                collapsed ? 'min-[900px]:justify-center min-[900px]:px-0' : ''
              } ${
                active
                  ? 'bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] text-white'
                  : 'text-[#17161F] hover:bg-[#F1F0F6]'
              }`}
            >
              <Icon set="bold" size={16} primaryColor={active ? '#ffffff' : '#8A8896'} />
              <span className={hideOnCollapse}>{t(MODE_LABEL_KEY[m])}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-2 h-px bg-[#ECECF2]" />

      {/* The tree needs the labels to be readable at all, so it goes away with
          them rather than degrading into an unlabelled column of dots. */}
      <div className={hideOnCollapse}>
        <h3 className="mb-3.5 mt-3 font-[family-name:var(--font-general-sans)] text-[11px] uppercase tracking-wide text-[#8A8896]">
          {t('app.treeTitle')}
        </h3>
        <ProjectTree
          tree={tree}
          selectedId={selectedId}
          onSelect={onSelectNode}
          onDelete={onDeleteNode}
        />
      </div>
    </>
  );
}
