'use client';

import { Image as ImageIcon, Upload, Delete } from 'react-iconly';
import type { RenderTreeNode } from '@/lib/server/render-tree';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { PRESETS, isPresetKey } from '@/lib/server/generation/presets';
import type { Locale } from '@/lib/i18n/dictionaries';

/**
 * What a row says, in the user's own vocabulary rather than the DB's.
 *
 * A generated node is named by the ambiance it was asked for ("Jour
 * extérieur"), which is real stored data — the alternative was a column of
 * rows all reading "Généré", indistinguishable from one another.
 */
export function nodeTitle(
  node: Pick<RenderTreeNode, 'kind' | 'preset'>,
  locale: Locale,
  t: (key: 'app.treeNodeSource' | 'app.treeNodeRender') => string,
): string {
  if (node.kind !== 'GENERATED') return t('app.treeNodeSource');
  const preset = node.preset;
  if (preset && isPresetKey(preset)) return PRESETS[preset].label[locale];
  return t('app.treeNodeRender');
}

/**
 * Multi-variant edits produce several children at once from the same preset,
 * so siblings routinely share a title. Numbering them by position keeps the
 * rows distinguishable without inventing anything — and stays deterministic
 * between server and client render, unlike a timestamp would.
 */
function TreeLevel({
  nodes,
  selectedId,
  onSelect,
  onDelete,
}: {
  nodes: RenderTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (node: RenderTreeNode) => void;
}) {
  const { locale, t } = useLocale();

  // Count per title first: a suffix only earns its place when the title alone
  // is ambiguous, so a lone "Jour extérieur" stays clean.
  const counts = new Map<string, number>();
  for (const node of nodes) {
    const title = nodeTitle(node, locale, t);
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  const seen = new Map<string, number>();

  return (
    <div className="space-y-0.5">
      {nodes.map((node) => {
        const title = nodeTitle(node, locale, t);
        const rank = (seen.get(title) ?? 0) + 1;
        seen.set(title, rank);
        const label = (counts.get(title) ?? 0) > 1 ? `${title} · ${rank}` : title;
        const selected = node.id === selectedId;
        const generated = node.kind === 'GENERATED';

        return (
          <div key={node.id}>
            {/* The delete button is a sibling of the select button, never
                nested in it — a button inside a button is invalid HTML. */}
            <div
              className={`group/row flex items-center rounded-lg transition-colors ${
                selected ? 'bg-[#F1F0F6]' : 'hover:bg-[#F1F0F6]/60'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(node.id)}
                title={label}
                className={`flex min-w-0 flex-1 items-center gap-2 py-2 pl-2.5 text-left text-[13px] ${
                  selected ? 'font-medium text-[#17161F]' : 'text-[#8A8896]'
                }`}
              >
                <span className="flex-shrink-0">
                  {generated ? (
                    <ImageIcon
                      set="light"
                      size={13}
                      primaryColor={selected ? '#716FFF' : '#8A8896'}
                    />
                  ) : (
                    <Upload set="light" size={13} primaryColor={selected ? '#716FFF' : '#8A8896'} />
                  )}
                </span>
                <span className="truncate">{label}</span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(node)}
                aria-label={t('app.treeDeleteNode')}
                title={t('app.treeDeleteNode')}
                className="mr-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-opacity hover:bg-[#E5484D14] min-[900px]:opacity-0 min-[900px]:group-hover/row:opacity-100 min-[900px]:group-focus-within/row:opacity-100"
              >
                <Delete set="light" size={13} primaryColor="#E5484D" />
              </button>
            </div>

            {/* The nesting is drawn, not just indented: the left rule is what
                makes a branch read as descending from its parent. */}
            {node.children.length > 0 && (
              <div className="ml-[15px] border-l border-[#ECECF2] pl-1.5 pt-0.5">
                <TreeLevel
                  nodes={node.children}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onDelete={onDelete}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ProjectTree({
  tree,
  selectedId,
  onSelect,
  onDelete,
}: {
  tree: RenderTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (node: RenderTreeNode) => void;
}) {
  const { t } = useLocale();

  if (tree.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-[#8A8896]">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-[#ECECF2]">
          <ImageIcon set="light" size={16} primaryColor="#8A8896" />
        </div>
        <p className="max-w-[150px] text-xs leading-relaxed">{t('app.treeEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <TreeLevel nodes={tree} selectedId={selectedId} onSelect={onSelect} onDelete={onDelete} />
    </div>
  );
}
