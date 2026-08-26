import { describe, it, expect } from 'vitest';
import { buildRenderTree } from './render-tree';

const t = (id: string) => new Date(`2026-01-01T00:00:0${id}.000Z`);

describe('buildRenderTree', () => {
  it('returns a single root with no children for one flat node', () => {
    const tree = buildRenderTree([
      { id: 'a', parentId: null, kind: 'UPLOADED', createdAt: t('0') },
    ]);
    expect(tree).toEqual([
      { id: 'a', parentId: null, kind: 'UPLOADED', createdAt: t('0'), children: [] },
    ]);
  });

  it('builds a linear chain (a -> b -> c)', () => {
    const tree = buildRenderTree([
      { id: 'a', parentId: null, kind: 'UPLOADED', createdAt: t('0') },
      { id: 'b', parentId: 'a', kind: 'GENERATED', createdAt: t('1') },
      { id: 'c', parentId: 'b', kind: 'GENERATED', createdAt: t('2') },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.id).toBe('a');
    expect(tree[0]!.children[0]!.id).toBe('b');
    expect(tree[0]!.children[0]!.children[0]!.id).toBe('c');
  });

  it('builds a branching tree (a -> b, a -> c)', () => {
    const tree = buildRenderTree([
      { id: 'a', parentId: null, kind: 'UPLOADED', createdAt: t('0') },
      { id: 'b', parentId: 'a', kind: 'GENERATED', createdAt: t('1') },
      { id: 'c', parentId: 'a', kind: 'GENERATED', createdAt: t('2') },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children.map((c) => c.id).sort()).toEqual(['b', 'c']);
  });

  it('treats a node whose parentId points outside the set as a root (orphan)', () => {
    const tree = buildRenderTree([
      { id: 'b', parentId: 'missing-parent', kind: 'GENERATED', createdAt: t('0') },
    ]);
    expect(tree).toEqual([
      { id: 'b', parentId: 'missing-parent', kind: 'GENERATED', createdAt: t('0'), children: [] },
    ]);
  });

  it('returns an empty array for no nodes', () => {
    expect(buildRenderTree([])).toEqual([]);
  });
});
