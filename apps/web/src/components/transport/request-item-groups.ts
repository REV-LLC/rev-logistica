import type { SelectedItem } from './request-types';

export type RequestItemGroup = { item: SelectedItem; index: number; children: RequestItemGroup[] };
export const parentAssetId = (item: SelectedItem) => item.componentParentAssetId;

/** Presentation only: the saved document remains a flat list with parent references. */
export function groupRequestItems(items: SelectedItem[]): RequestItemGroup[] {
  const nodes = items.map((item, index) => ({ item, index, children: [] as RequestItemGroup[] }));
  const byAsset = new Map(nodes.filter(node => node.item.assetId).map(node => [node.item.assetId!, node]));
  const roots: RequestItemGroup[] = [];
  for (const node of nodes) {
    const parent = byAsset.get(parentAssetId(node.item) ?? '');
    const seen = new Set([node.item.selectionId]);
    let ancestor = parent;
    while (ancestor && !seen.has(ancestor.item.selectionId)) {
      seen.add(ancestor.item.selectionId);
      ancestor = byAsset.get(parentAssetId(ancestor.item) ?? '');
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
    const assets = new Set(items.filter(item => removedIds.has(item.selectionId)).map(item => item.assetId).filter(Boolean));
    for (const item of items) {
      if (!removedIds.has(item.selectionId) && assets.has(parentAssetId(item))) {
        removedIds.add(item.selectionId);
        changed = true;
      }
    }
  }
  return items.filter(item => !removedIds.has(item.selectionId));
}
