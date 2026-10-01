import type { SelectedItem } from './request-types';

export type RequestItemGroup = { item: SelectedItem; index: number; children: RequestItemGroup[] };
export const parentAssetId = (item: SelectedItem) => item.componentParentAssetId;

// A line ID identifies the immediate parent. Asset custody is only a legacy fallback.
function parentOf(item: SelectedItem, items: SelectedItem[]) {
  if (item.parentCompositionNodeId) return items.find(candidate => candidate.selectionId === item.parentCompositionNodeId);
  if (item.parentSourceDocumentItemId) return items.find(candidate => candidate.sourceDocumentItemId === item.parentSourceDocumentItemId);
  return items.find(candidate => candidate.assetId && candidate.assetId === item.componentParentAssetId);
}

/** Presentation only: the saved document remains a flat list with parent references. */
export function groupRequestItems(items: SelectedItem[]): RequestItemGroup[] {
  const nodes = items.map((item, index) => ({ item, index, children: [] as RequestItemGroup[] }));
  const byId = new Map(nodes.map(node => [node.item.selectionId, node]));
  const parentNode = (item: SelectedItem) => {
    const parent = parentOf(item, items);
    return parent ? byId.get(parent.selectionId) : undefined;
  };
  const roots: RequestItemGroup[] = [];
  for (const node of nodes) {
    const parent = parentNode(node.item);
    const seen = new Set([node.item.selectionId]);
    let ancestor = parent;
    while (ancestor && !seen.has(ancestor.item.selectionId)) {
      seen.add(ancestor.item.selectionId);
      ancestor = parentNode(ancestor.item);
    }
    // Unresolved/historical links and cycles must never hide a document line.
    if (!parent || ancestor) roots.push(node);
    else parent.children.push(node);
  }
  return roots;
}

export function removeRequestItem(items: SelectedItem[], selectionId: string) {
  const removed = items.find(item => item.selectionId === selectionId);
  if (!removed) return items;
  const removedIds = new Set([selectionId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      const parent = parentOf(item, items);
      if (!removedIds.has(item.selectionId) && parent && removedIds.has(parent.selectionId)) {
        removedIds.add(item.selectionId);
        changed = true;
      }
    }
  }
  return items.filter(item => !removedIds.has(item.selectionId));
}
