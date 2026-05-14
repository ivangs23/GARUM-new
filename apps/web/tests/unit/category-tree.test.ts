import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCategoryTree,
  flattenTree,
  collectDescendantIds,
  countSubtreeProducts,
  type CategoryBase,
} from '../../lib/category-tree.ts';

type Cat = CategoryBase;

describe('buildCategoryTree', () => {
  it('returns empty roots when input is empty', () => {
    assert.deepEqual(buildCategoryTree([]), []);
  });

  it('builds a flat list of roots when no parent_id is set', () => {
    const flat: Cat[] = [
      { id: 'a', name: 'A', parent_id: null },
      { id: 'b', name: 'B', parent_id: null },
    ];
    const tree = buildCategoryTree(flat);
    assert.equal(tree.length, 2);
    assert.equal(tree[0].children.length, 0);
  });

  it('nests children under their parent', () => {
    const flat: Cat[] = [
      { id: 'root', name: 'Root', parent_id: null },
      { id: 'child', name: 'Child', parent_id: 'root' },
      { id: 'gc', name: 'GC', parent_id: 'child' },
    ];
    const tree = buildCategoryTree(flat);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].id, 'root');
    assert.equal(tree[0].children.length, 1);
    assert.equal(tree[0].children[0].children.length, 1);
    assert.equal(tree[0].children[0].children[0].id, 'gc');
  });

  it('treats nodes with unknown parent_id as roots (orphan-safe)', () => {
    const flat: Cat[] = [{ id: 'x', name: 'X', parent_id: 'ghost' }];
    const tree = buildCategoryTree(flat);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].id, 'x');
  });
});

describe('flattenTree', () => {
  it('pre-order traversal with depth labels', () => {
    const flat: Cat[] = [
      { id: 'a', name: 'A', parent_id: null },
      { id: 'b', name: 'B', parent_id: 'a' },
      { id: 'c', name: 'C', parent_id: 'b' },
    ];
    const out = flattenTree(buildCategoryTree(flat));
    assert.deepEqual(out.map((n) => [n.id, n.depth]), [
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });
});

describe('collectDescendantIds', () => {
  it('includes the node itself', () => {
    const tree = buildCategoryTree([{ id: 'a', name: 'A', parent_id: null }]);
    assert.deepEqual(collectDescendantIds(tree[0]), ['a']);
  });

  it('collects every descendant in the subtree', () => {
    const tree = buildCategoryTree([
      { id: 'a', name: 'A', parent_id: null },
      { id: 'b', name: 'B', parent_id: 'a' },
      { id: 'c', name: 'C', parent_id: 'b' },
      { id: 'd', name: 'D', parent_id: 'a' },
    ]);
    const ids = collectDescendantIds(tree[0]);
    assert.deepEqual(ids.sort(), ['a', 'b', 'c', 'd']);
  });
});

describe('countSubtreeProducts', () => {
  it('sums products across the subtree', () => {
    type WithProducts = Cat & { products: unknown[] };
    const flat: WithProducts[] = [
      { id: 'r', name: 'Root', parent_id: null, products: [1, 2] },
      { id: 'c', name: 'Child', parent_id: 'r', products: [3] },
    ];
    const tree = buildCategoryTree(flat);
    assert.equal(countSubtreeProducts(tree[0]), 3);
  });
});
