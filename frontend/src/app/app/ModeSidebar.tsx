'use client';

// Left rail inside an open project: the output kind on top, then the render
// tree, so both stay visible without an extra click.
//
// It mirrors HomeSidebar deliberately — same "Tableau de bord" entry in the
// same place, same raised-white-card active state, same pinned Informations
// link at the bottom. The two rails had drifted apart (no way back to the
// dashboard here, and a solid gradient for "you are here" instead of the
// card), which made the same product look like two.
import { Image as ImageIcon, ChevronLeft, ChevronRight, InfoSquare, Category } from 'react-iconly';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { RenderTreeNode } from '@/lib/server/render-tree';
import { ProjectTree } from './ProjectTree';
import { RAIL_TOGGLE, ROW, ROW_ACTIVE, ROW_IDLE } from './nav-row';
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
        className={`mb-3 ${RAIL_TOGGLE} ${
          collapsed ? 'min-[900px]:self-center' : 'min-[900px]:self-end'
        }`}
      >
        {collapsed ? (
          <ChevronRight set="light" size={15} primaryColor="#8A8896" />
        ) : (
          <ChevronLeft set="light" size={15} primaryColor="#8A8896" />
        )}
      </button>

      {/* Way back to the dashboard. Opening a project used to drop this rail's
          only exit — the logo aside, there was no route out — while the home
          rail has carried the entry all along. Same component shape, same
          position, so the two rails no longer disagree. */}
      <div className="mb-4">
        <Link
          href="/app"
          {...(collapsed ? { title: t('dashboard.title') } : {})}
          aria-label={t('dashboard.title')}
          className={`${ROW} ${ROW_IDLE} ${
            collapsed ? 'min-[900px]:justify-center min-[900px]:px-0' : ''
          }`}
        >
          <Category set="light" size={18} primaryColor="#6B6880" />
          <span className={hideOnCollapse}>{t('dashboard.title')}</span>
        </Link>
      </div>

      {/* Only the output kind lives here now. Generate / retouch / add moved
          into the command bar, where the action is actually fired — they are
          three ways of producing an image, not three destinations. */}
      <div className="mb-4 flex flex-col gap-1">
        {/* Active state matches HomeSidebar's: a raised white card, not a
            solid gradient fill. Two rails in the same product were using two
            different treatments for the same "you are here". */}
        <button
          type="button"
          onClick={() => onModeChange('generate')}
          {...(collapsed ? { title: t('app.modeGenerate') } : {})}
          aria-label={t('app.modeGenerate')}
          aria-current="page"
          className={`${ROW} ${ROW_ACTIVE} text-left ${
            collapsed ? 'min-[900px]:justify-center min-[900px]:px-0' : ''
          }`}
        >
          <ImageIcon set="light" size={18} primaryColor="#716FFF" />
          <span className={hideOnCollapse}>{t('app.modeGenerate')}</span>
        </button>
      </div>

      <div className="mb-2 h-px bg-[#ECECF2]" />

      {/* Only this block scrolls. A project's tree can run to any length, but
          the collapse button, the mode entries and the Informations link at the
          bottom must stay put — scrolling the whole rail to reach them is
          exactly what the fixed rail is meant to avoid.
          The tree needs the labels to be readable at all, so it goes away with
          them rather than degrading into an unlabelled column of dots. */}
      <div className={`min-h-0 flex-1 overflow-y-auto ${hideOnCollapse}`}>
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
        className={`mt-2 flex-shrink-0 ${ROW} ${ROW_IDLE} ${
          collapsed ? 'min-[900px]:justify-center min-[900px]:px-0' : ''
        }`}
      >
        <InfoSquare set="light" size={18} primaryColor="#6B6880" />
        <span className={hideOnCollapse}>{t('info.title')}</span>
      </Link>
    </>
  );
}
