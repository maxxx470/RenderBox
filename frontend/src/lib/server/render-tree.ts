// Shapes a project's flat RenderNode rows (parentId self-reference) into a
// nested tree for the /app rail. Pure, no I/O — reused by
// GET /api/projects/[projectId] and POST /api/projects/[projectId]/generate
// (both need the freshly-updated tree in their response).
export interface FlatRenderNode {
  id: string;
  parentId: string | null;
  kind: string;
  createdAt: Date | string;
  // Optional so existing call sites/tests that don't select it keep working.
  preset?: string | null;
  engine?: string | null;
}

export interface RenderTreeNode extends FlatRenderNode {
  children: RenderTreeNode[];
}

/**
 * A node plus every node descending from it.
 *
 * Deleting only the node would leave its children behind: `parentId` is
 * `onDelete: SetNull`, so they would silently become roots and their stated
 * lineage — "generated from this render" — would point at nothing. Callers
 * take the branch as a whole, and tell the user how many renders that is
 * before destroying anything.
 *
 * Pure and free of server imports on purpose: the delete route and the UI that
 * counts the branch before confirming must agree, so they share one function.
 */
export function collectBranch<T extends { id: string; parentId: string | null }>(
  nodes: readonly T[],
  rootId: string,
): T[] {
  const childrenOf = new Map<string, T[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = childrenOf.get(node.parentId);
    if (siblings) siblings.push(node);
    else childrenOf.set(node.parentId, [node]);
  }

  const root = nodes.find((n) => n.id === rootId);
  if (!root) return [];

  const branch: T[] = [];
  const queue: T[] = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    branch.push(current);
    queue.push(...(childrenOf.get(current.id) ?? []));
  }
  return branch;
}

export function buildRenderTree(nodes: FlatRenderNode[]): RenderTreeNode[] {
  const byId = new Map<string, RenderTreeNode>(nodes.map((n) => [n.id, { ...n, children: [] }]));
  const roots: RenderTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
