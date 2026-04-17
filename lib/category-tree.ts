export type CategoryBase = {
  id: string;
  name: string;
  parent_id: string | null;
};

export type CategoryNode<P extends CategoryBase = CategoryBase> = P & {
  children: CategoryNode<P>[];
};

export type FlatNode<P extends CategoryBase = CategoryBase> = CategoryNode<P> & {
  depth: number;
};

/**
 * Converts a flat array (with parent_id) into a nested tree. O(n).
 */
export function buildCategoryTree<P extends CategoryBase>(flat: P[]): CategoryNode<P>[] {
  const map = new Map<string, CategoryNode<P>>();
  const roots: CategoryNode<P>[] = [];

  for (const cat of flat) {
    map.set(cat.id, { ...cat, children: [] });
  }

  for (const cat of flat) {
    const node = map.get(cat.id)!;
    if (cat.parent_id && map.has(cat.parent_id)) {
      map.get(cat.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Depth-first pre-order traversal → flat array with a `depth` field on each node.
 */
export function flattenTree<P extends CategoryBase>(
  roots: CategoryNode<P>[],
  depth = 0,
): FlatNode<P>[] {
  const result: FlatNode<P>[] = [];
  for (const node of roots) {
    result.push({ ...node, depth });
    result.push(...flattenTree(node.children, depth + 1));
  }
  return result;
}

/**
 * Collects all descendant ids of a node (inclusive). Useful for
 * cycle detection and bulk operations.
 */
export function collectDescendantIds<P extends CategoryBase>(node: CategoryNode<P>): string[] {
  return [node.id, ...node.children.flatMap(collectDescendantIds)];
}

/**
 * Counts all products in a node's subtree (inclusive).
 * Requires that each node has a `products` field.
 */
export function countSubtreeProducts<P extends CategoryBase & { products: unknown[] }>(
  node: CategoryNode<P>,
): number {
  return node.products.length + node.children.reduce((s, c) => s + countSubtreeProducts(c as CategoryNode<P>), 0);
}
