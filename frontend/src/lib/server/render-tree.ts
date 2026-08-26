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
