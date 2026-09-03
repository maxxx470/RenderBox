'use client';

// Left rail — Krea-style mode switcher (Generate/Retouch/Add) with the
// existing render tree underneath, so both stay visible without an extra
// click (per the addendum spec). The active mode is the only place the red
// gradient appears here — the rail itself stays on the neutral surface
// color, never a gradient background.
import { Image as ImageIcon, ChevronLeft, ChevronRight, InfoSquare } from 'react-iconly';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { RenderTreeNode } from '@/lib/server/render-tree';
import { ProjectTree } from './ProjectTree';
import { VideoModeSoon } from './VideoModeSoon';
import type { AppMode } from './CommandBar';

export function ModeSidebar({
  onModeChange,
  tree,
  selectedId,
  onSelectNode,
  onDeleteNode,
  collapsed,
  onToggleCollapse,
}: {
  /** Still needed: clicking "Image" returns from an edit mode to generate. */
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
          <ChevronRight set="light" size={15} primaryColor="#8A8896" />
        ) : (
          <ChevronLeft set="light" size={15} primaryColor="#8A8896" />
        )}
      </button>

      {/* Only the output kind lives here now. Generate / retouch / add moved
          into the command bar, where the action is actually fired — they are
          three ways of producing an image, not three destinations. */}
      <div className="mb-4 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => onModeChange('generate')}
          {...(collapsed ? { title: t('app.modeGenerate') } : {})}
          aria-label={t('app.modeGenerate')}
          aria-current="page"
          className={`flex items-center gap-2.5 rounded-xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-3 py-2.5 text-left text-[13px] font-medium text-white ${
            collapsed ? 'min-[900px]:justify-center min-[900px]:px-0' : ''
          }`}
        >
          <ImageIcon set="light" size={16} primaryColor="#ffffff" />
          <span className={hideOnCollapse}>{t('app.modeGenerate')}</span>
        </button>
        <VideoModeSoon
          collapsed={collapsed}
          className={`text-[13px] ${collapsed ? 'min-[900px]:justify-center min-[900px]:px-0' : ''}`}
          labelClassName={hideOnCollapse}
        />
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

      {/* Pinned to the bottom so it never competes with the tree for
          attention, but reachable without leaving the workspace. */}
      <Link
        href="/info"
        {...(collapsed ? { title: t('info.title') } : {})}
        aria-label={t('info.title')}
        className={`mt-auto flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-[#17161F] hover:bg-[#F1F0F6] ${
          collapsed ? 'min-[900px]:justify-center min-[900px]:px-0' : ''
        }`}
      >
        <InfoSquare set="light" size={16} primaryColor="#8A8896" />
        <span className={hideOnCollapse}>{t('info.title')}</span>
      </Link>
    </>
  );
}
