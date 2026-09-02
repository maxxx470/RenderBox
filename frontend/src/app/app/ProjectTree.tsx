'use client';

import { Image as ImageIcon, Upload } from 'react-iconly';
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
}: {
  nodes: RenderTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
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
            <button
              type="button"
              onClick={() => onSelect(node.id)}
              title={label}
              className={`flex w-full items-center gap-2 rounded-lg py-2 pl-2.5 pr-2 text-left text-[13px] transition-colors ${
                selected
                  ? 'bg-[#F1F0F6] font-medium text-[#17161F]'
                  : 'text-[#8A8896] hover:bg-[#F1F0F6]/60'
              }`}
            >
              <span className="flex-shrink-0">
                {generated ? (
                  <ImageIcon set="bold" size={13} primaryColor={selected ? '#716FFF' : '#8A8896'} />
                ) : (
                  <Upload set="bold" size={13} primaryColor={selected ? '#716FFF' : '#8A8896'} />
                )}
              </span>
              <span className="truncate">{label}</span>
            </button>

            {/* The nesting is drawn, not just indented: the left rule is what
                makes a branch read as descending from its parent. */}
            {node.children.length > 0 && (
              <div className="ml-[15px] border-l border-[#ECECF2] pl-1.5 pt-0.5">
                <TreeLevel nodes={node.children} selectedId={selectedId} onSelect={onSelect} />
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
}: {
  tree: RenderTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useLocale();

  if (tree.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-[#8A8896]">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-[#ECECF2]">
          <ImageIcon set="bold" size={16} primaryColor="#8A8896" />
        </div>
        <p className="max-w-[150px] text-xs leading-relaxed">{t('app.treeEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <TreeLevel nodes={tree} selectedId={selectedId} onSelect={onSelect} />
    </div>
  );
}
