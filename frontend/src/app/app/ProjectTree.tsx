'use client';

import type { RenderTreeNode } from '@/lib/server/render-tree';
import { useTranslations } from '@/lib/i18n/LocaleContext';

function TreeRow({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: RenderTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations();
  const selected = node.id === selectedId;
  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        style={{ paddingLeft: 10 + depth * 14 }}
        className={`flex w-full items-center gap-2 rounded-lg py-2 pr-2 text-left text-[13px] ${
          selected
            ? 'bg-[#F1EBEC] font-medium text-[#170608]'
            : 'text-[#7A6E71] hover:bg-[#F1EBEC]/60'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${node.kind === 'GENERATED' ? 'bg-[#C81120]' : 'bg-[#7A6E71]'}`}
        />
        {node.kind === 'GENERATED' ? t('app.nodeGenerated') : t('app.nodeUploaded')}
      </button>
      {node.children.map((child) => (
        <TreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

export function ProjectTree({
  tree,
  selectedId,
  onSelect,
}: {
  tree: RenderTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations();

  if (tree.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-[#7A6E71]">
        <div className="h-[34px] w-[34px] rounded-[10px] border-[1.5px] border-dashed border-[#ECE3E5]" />
        <p className="max-w-[150px] text-xs leading-relaxed">{t('app.treeEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-0.5 overflow-y-auto">
      {tree.map((node) => (
        <TreeRow key={node.id} node={node} depth={0} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}
